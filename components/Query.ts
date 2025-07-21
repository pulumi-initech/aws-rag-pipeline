import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VectorStoreConfig } from "./VectorStore.ts";

export interface QueryArgs {
    vectorStoreConfig: VectorStoreConfig;
    lambdaCodePath?: string;
    timeout?: number;
}

export class Query extends pulumi.ComponentResource {
    public readonly role: aws.iam.Role;
    public readonly lambda: aws.lambda.Function;
    public readonly lambdaArn: pulumi.Output<string>;
    public readonly api: aws.apigatewayv2.Api;
    public readonly apiEndpoint: pulumi.Output<string>;

    constructor(name: string, args: QueryArgs, opts?: pulumi.ComponentResourceOptions) {
        super("rag:Query", name, {}, opts);

        // Get Pinecone API key if vector store is Pinecone
        const pineconeConfig = new pulumi.Config("pinecone");
        const pineconeApiKey = pineconeConfig.get("APIKey") || "";

        // Create IAM role with combined policies
        this.role = new aws.iam.Role(`query-lambda-role`, {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
        }, { parent: this });

        const policyDoc = {
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
        };

        if ( args.vectorStoreConfig.type === "opensearch" ) {
            policyDoc.Statement.push({
                Effect: "Allow",
                Action: "aoss:APIAccessAll",
                Resource: "*"
            });
        }

        // Combined policy for query Lambda
        const combinedPolicy = new aws.iam.RolePolicy(`query-lambda-policy`, {
            role: this.role.name,
            policy: JSON.stringify(policyDoc),
        }, { parent: this.role });

          // Create Lambda function
        this.lambda = new aws.lambda.Function(`query-lambda`, {
            role: this.role.arn,
            runtime: "nodejs18.x",
            handler: "index.handler",
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive(args.lambdaCodePath || "./lambda/query"),
            }),
            environment: {
                variables: {
                    VECTOR_STORE_ENDPOINT: args.vectorStoreConfig.endpoint,
                    VECTOR_STORE_TYPE: args.vectorStoreConfig.type,
                    INDEX_NAME: args.vectorStoreConfig.indexName,
                    PINECONE_API_KEY: pineconeApiKey,
                },
            },
            timeout: args.timeout || 60,
        }, { parent: this, dependsOn: [combinedPolicy] });

        this.lambdaArn = this.lambda.arn;

        // Create API Gateway
        this.api = new aws.apigatewayv2.Api(`query-api`, {
            protocolType: "HTTP",
        }, { parent: this });

        // Create API Gateway integration
        const integration = new aws.apigatewayv2.Integration(`query-api-integration`, {
            apiId: this.api.id,
            integrationType: "AWS_PROXY",
            integrationUri: this.lambda.arn,
            payloadFormatVersion: "2.0",
        }, { parent: this.api });

        // Create API Gateway route
        new aws.apigatewayv2.Route(`query-api-route`, {
            apiId: this.api.id,
            routeKey: "POST /query",
            target: pulumi.interpolate`integrations/${integration.id}`,
        }, { parent: this.api });

        // Grant API Gateway permission to invoke Lambda
        new aws.lambda.Permission(`query-lambda-permission`, {
            action: "lambda:InvokeFunction",
            function: this.lambda.name,
            principal: "apigateway.amazonaws.com",
            sourceArn: pulumi.interpolate`${this.api.executionArn}/*/*`,
        }, { parent: this.lambda });

        // Create API Gateway stage
        new aws.apigatewayv2.Stage(`query-api-stage`, {
            apiId: this.api.id,
            name: "prod",
            autoDeploy: true,
        }, { parent: this.api });

        this.apiEndpoint = pulumi.interpolate`${this.api.apiEndpoint}/prod`;

        this.registerOutputs({
            apiEndpoint: this.apiEndpoint,
            lambdaArn: this.lambda.arn,
            roleArn: this.role.arn,
        });
    }
}