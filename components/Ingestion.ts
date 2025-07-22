import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VectorStoreConfig } from "./VectorStore.ts";

export interface IngestionArgs {
    inputBucket: aws.s3.BucketV2;
    vectorStoreConfig: VectorStoreConfig;
    lambdaCodePath?: string;
    timeout?: number;
}

export class Ingestion extends pulumi.ComponentResource {
    
    public readonly role: aws.iam.Role;
    public readonly policy: aws.iam.RolePolicy;
    public readonly lambda: aws.lambda.Function;
    public readonly invokePermission: aws.lambda.Permission;
    public readonly bucketNotification: aws.s3.BucketNotification;
    
    // component synthetic outputs
    public readonly lambdaArn: pulumi.Output<string>;
    public readonly roleArn: pulumi.Output<string>;

    constructor(name: string, args: IngestionArgs, opts?: pulumi.ComponentResourceOptions) {
        super("rag:Ingestion", name, {}, opts);

        // Get Pinecone API key if vector store is Pinecone
        const pineconeConfig = new pulumi.Config("pinecone");
        const pineconeApiKey = pineconeConfig.get("APIKey") || "";

        // Create IAM role with combined policies
        this.role = new aws.iam.Role(`ingestion-lambda-role`, {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
        }, { parent: this });

        this.roleArn = this.role.arn;

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
            }, {
                Effect: "Allow",
                Action: ["s3:GetObject"],
                Resource: pulumi.interpolate`${args.inputBucket.arn}/*`
            }, {
                Effect: "Allow",
                Action: [
                    "kms:Decrypt",
                    "kms:DescribeKey"
                ],
                Resource: "arn:aws:kms:*:*:key/aws/s3"
            }]
        };

        if ( args.vectorStoreConfig.type === "opensearch" ) {
            policyDoc.Statement.push({
                Effect: "Allow",
                Action: "aoss:APIAccessAll",
                Resource: "*"
            });
        }

        // Combined policy for ingestion Lambda
        this.policy = new aws.iam.RolePolicy(`ingestion-lambda-role-policy`, {
            role: this.role.name,
            policy: pulumi.jsonStringify(policyDoc),
        }, { parent: this.role });

        // Create Lambda function
        this.lambda = new aws.lambda.Function(`ingestion-lambda`, {
            role: this.role.arn,
            runtime: "nodejs18.x",
            handler: "index.handler",
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive(args.lambdaCodePath || "./lambda/ingestion"),
            }),
            environment: {
                variables: {
                    VECTOR_STORE_ENDPOINT: args.vectorStoreConfig.endpoint,
                    VECTOR_STORE_TYPE: args.vectorStoreConfig.type,
                    INDEX_NAME: args.vectorStoreConfig.indexName,
                    PINECONE_API_KEY: pineconeApiKey,
                },
            },
            timeout: args.timeout || 300,
        }, { parent: this, dependsOn: [this.role] });

        this.lambdaArn = this.lambda.arn;

        // Grant S3 permission to invoke Lambda
        this.invokePermission = new aws.lambda.Permission(`ingestion-lambda-s3-invoke-permission`, {
            action: "lambda:InvokeFunction",
            function: this.lambda.name,
            principal: "s3.amazonaws.com",
            sourceArn: args.inputBucket.arn,
        }, { parent: this.lambda });

        // Create S3 bucket notification
        this.bucketNotification = new aws.s3.BucketNotification(`ingestion-lambda-bucket-notification`, {
            bucket: args.inputBucket.id,
            lambdaFunctions: [{
                lambdaFunctionArn: this.lambda.arn,
                events: ["s3:ObjectCreated:*"],
            }],
        }, { parent: this, dependsOn: [this.lambda] });
    }
}