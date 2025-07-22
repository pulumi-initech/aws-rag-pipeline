// index.ts (Monolithic and hard to test)
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as pinecone from "@pinecone-database/pulumi";

// Read configuration to determine which vector store to use
const config = new pulumi.Config();

// This would be set in Pulumi.dev.yaml, e.g., `vectorStore: opensearch`
const vectorStoreType = config.get("vectorStore") || "opensearch"; 

// --- Ingestion Resources ---
const inputBucket = new aws.s3.BucketV2("input-bucket");

const ingestionRole = new aws.iam.Role("ingestion-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
});

// Combined policy for ingestion Lambda
new aws.iam.RolePolicy("ingestion-combined-policy", {
    role: ingestionRole.name,
    policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }, {
            "Effect": "Allow",
            "Action": "bedrock:InvokeModel",
            "Resource": "*"
        }, {
            "Effect": "Allow",
            "Action": ["s3:GetObject"],
            "Resource": "${inputBucket.arn}/*"
        }]
    }`,
});

// --- Vector Store Resources (Conditional) ---
let vectorStoreEndpoint: pulumi.Output<string>;
let collection: aws.opensearch.ServerlessCollection | undefined;

if (vectorStoreType === "opensearch") {
    // OpenSearch Serverless security policies
    const securityPolicies = [
        new aws.opensearch.ServerlessSecurityPolicy("encryption-policy", {
            name: "rag-encryption-policy",
            type: "encryption",
            policy: JSON.stringify({
                Rules: [{ ResourceType: "collection", Resource: ["collection/rag-collection*"] }],
                AWSOwnedKey: true
            })
        }),
        new aws.opensearch.ServerlessSecurityPolicy("network-policy", {
            name: "rag-network-policy",
            type: "network",
            policy: JSON.stringify([{
                Rules: [
                    { ResourceType: "collection", Resource: ["collection/rag-collection*"] },
                    { ResourceType: "dashboard", Resource: ["collection/rag-collection*"] }
                ],
                AllowFromPublic: true
            }])
        })
    ];

    collection = new aws.opensearch.ServerlessCollection("rag-collection", {
        type: "VECTORSEARCH",
    }, { dependsOn: securityPolicies });

    vectorStoreEndpoint = collection.collectionEndpoint;
    
    // Add OpenSearch permissions to the combined policy
    new aws.iam.RolePolicy("ingestion-opensearch-policy", {
        role: ingestionRole.name,
        policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": "aoss:APIAccessAll",
                "Resource": "${collection.arn}"
            }]
        }`,
    });
} else if (vectorStoreType === "pinecone") {
    const index = new pinecone.PineconeIndex("rag-index", {
        name: "rag-index",
        metric: "cosine",
        spec: { pod: { environment: "gcp-starter", podType: "p1.x1", replicas: 1 } },
    });
    vectorStoreEndpoint = index.host;
} else {
    throw new Error(`Unsupported vector store: ${vectorStoreType}`);
}

// --- Lambda Functions ---
const lambdaConfig = {
    runtime: "nodejs18.x",
    handler: "index.handler",
    environment: {
        variables: {
            VECTOR_STORE_ENDPOINT: vectorStoreEndpoint,
        },
    },
};

const ingestionLambda = new aws.lambda.Function("ingestion-lambda", {
    ...lambdaConfig,
    role: ingestionRole.arn,
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambda/ingestion"),
    }),
    timeout: 300,
});

new aws.lambda.Permission("ingestion-lambda-s3-permission", {
    action: "lambda:InvokeFunction",
    function: ingestionLambda.name,
    principal: "s3.amazonaws.com",
    sourceArn: inputBucket.arn,
});

new aws.s3.BucketNotification("input-bucket-notification", {
    bucket: inputBucket.id,
    lambdaFunctions: [{
        lambdaFunctionArn: ingestionLambda.arn,
        events: ["s3:ObjectCreated:*"],
    }],
}, { dependsOn: [ingestionLambda] });

// --- Querying Resources ---
const queryRole = new aws.iam.Role("query-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
});

// Combined policy for query Lambda
new aws.iam.RolePolicy("query-combined-policy", {
    role: queryRole.name,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            Resource: "arn:aws:logs:*:*:*"
        }, {
            Effect: "Allow",
            Action: "bedrock:InvokeModel",
            Resource: "*"
        }]
    }),
});

// Grant query lambda access to OpenSearch (conditional)
if (vectorStoreType === "opensearch" && collection) {
    new aws.iam.RolePolicy("query-opensearch-policy", {
        role: queryRole.name,
        policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": "aoss:APIAccessAll",
                "Resource": "${collection.arn}"
            }]
        }`,
    });

    // Create data access policy for OpenSearch Serverless
    new aws.opensearch.ServerlessAccessPolicy("data-access-policy", {
        name: "rag-data-access-policy",
        type: "data",
        policy: pulumi.interpolate`[{
            "Rules": [{
                "Resource": ["collection/rag-collection*"],
                "Permission": ["aoss:CreateCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"],
                "ResourceType": "collection"
            }, {
                "Resource": ["index/rag-collection*/rag-documents*"],
                "Permission": ["aoss:CreateIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"],
                "ResourceType": "index"
            }],
            "Principal": ["${ingestionRole.arn}", "${queryRole.arn}"]
        }]`
    });
}

const queryLambda = new aws.lambda.Function("query-lambda", {
    ...lambdaConfig,
    role: queryRole.arn,
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambda/query"),
    }),
    timeout: 60,
});

const api = new aws.apigatewayv2.Api("query-api", {
    protocolType: "HTTP",
});

const integration = new aws.apigatewayv2.Integration("query-integration", {
    apiId: api.id,
    integrationType: "AWS_PROXY",
    integrationUri: queryLambda.arn,
    payloadFormatVersion: "2.0",
});

new aws.apigatewayv2.Route("query-route", {
    apiId: api.id,
    routeKey: "POST /query",
    target: pulumi.interpolate`integrations/${integration.id}`,
});

new aws.lambda.Permission("query-lambda-api-permission", {
    action: "lambda:InvokeFunction",
    function: queryLambda.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

new aws.apigatewayv2.Stage("query-stage", {
    apiId: api.id,
    name: "prod",
    autoDeploy: true,
});

export const queryApiEndpoint = pulumi.interpolate`${api.apiEndpoint}/prod`;
export const inputBucketName = inputBucket.id;