import { S3Client, ListBucketsCommand, PutObjectCommand, GetBucketNotificationConfigurationCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { LambdaClient, GetFunctionCommand, GetPolicyCommand } from "@aws-sdk/client-lambda";
import { IAMClient, ListRolesCommand, ListRolePoliciesCommand, GetRolePolicyCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import { CloudWatchLogsClient, DescribeLogStreamsCommand, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ApiGatewayV2Client, GetApisCommand, GetRoutesCommand, GetIntegrationsCommand } from "@aws-sdk/client-apigatewayv2";
import { defaultProvider } from '@aws-sdk/credential-provider-node'
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
// import { Output } from "@pulumi/pulumi"; // Currently unused

export interface AWSHelperOptions {
    region?: string;
}

export interface LogStreamOptions {
    orderBy?: "LogStreamName" | "LastEventTime";
    descending?: boolean;
    limit?: number;
}

export interface LogEventOptions {
    startTime?: number;
    endTime?: number;
    limit?: number;
}

/**
 * Pure AWS SDK wrapper - contains no business logic, only AWS API calls
 */
export class AWSHelper {

    
    private s3: S3Client;
    private lambda: LambdaClient;
    private iam: IAMClient;
    private cloudWatchLogs: CloudWatchLogsClient;
    private apiGatewayV2: ApiGatewayV2Client;
    private region: string;

    constructor(options: AWSHelperOptions = {}) {
        this.region = options.region || "us-west-2";
        
        // Initialize AWS clients with consistent configuration
        this.s3 = new S3Client({ region: this.region });
        this.lambda = new LambdaClient({ region: this.region });
        this.iam = new IAMClient({ region: this.region });
        this.cloudWatchLogs = new CloudWatchLogsClient({ region: this.region });
        this.apiGatewayV2 = new ApiGatewayV2Client({ region: this.region });
    }

    // === Lambda Operations ===


    /**
     * Get Lambda function resource-based policy
     */
    async getLambdaResourcePolicy(functionName: string) {
        try {
            const result = await this.lambda.send(new GetPolicyCommand({
                FunctionName: functionName
            }));
            
            if (result.Policy) {
                // Parse the policy document to extract permissions
                const policy = JSON.parse(result.Policy);
                return policy.Statement || [];
            }
            
            return [];
        } catch (error: any) {
            // If there's no policy, Lambda throws ResourceNotFoundException
            if (error.name === 'ResourceNotFoundException') {
                return [];
            }
            throw error;
        }
    }

    async getLambdaFunctionConfigurationByArn(functionArn: string) {
        const functionName = functionArn.split(":").slice(-1)[0];
        const result = await this.lambda.send(new GetFunctionCommand({
            FunctionName: functionName,
        }));

        return result.Configuration || undefined;
    }


    // === IAM Operations ===

    /**
     * List all IAM roles
     */
    async listIAMRoles() {
        const result = await this.iam.send(new ListRolesCommand({ PathPrefix: "/aws-rag-pipeline/" }));
        return result.Roles || [];
    }

    async getIAMRole(roleName: string) {
        const command = new GetRoleCommand({
            RoleName: roleName,
         });

        try {
            const response = await this.iam.send(command);

            return response.Role || undefined;
        } catch (_error) {
            return undefined;
        }
    }

    /**
     * List inline policies for a role
     */
    async listRolePolicies(roleName: string) {
        const result = await this.iam.send(new ListRolePoliciesCommand({
            RoleName: roleName
        }));
        return result.PolicyNames || [];
    }

    /**
     * Get inline policy document for a role
     */
    async getRolePolicy(roleName: string, policyName: string) {
        return await this.iam.send(new GetRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName
        }));
    }

    // === S3 Operations ===

    /**
     * List all S3 buckets
     */
    async listS3Buckets() {
        const result = await this.s3.send(new ListBucketsCommand({}));
        return result.Buckets || [];
    }

    /**
     * Check if S3 bucket exists (more efficient than listing all buckets)
     */
    async bucketExists(bucketName: string): Promise<boolean> {
        try {
            await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
            return true;
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }


    /**
     * Put object to S3
     */
    async putS3Object(bucketName: string, key: string, body: any, contentType?: string) {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: body,
            ...(contentType && { ContentType: contentType })
        });
        return await this.s3.send(command);
    }


    /**
     * Get S3 bucket notification configuration
     */
    async getS3BucketNotificationConfiguration(bucketName: string) {
        return await this.s3.send(new GetBucketNotificationConfigurationCommand({
            Bucket: bucketName
        }));
    }

    // === CloudWatch Logs Operations ===

    /**
     * Describe log streams in a log group
     */
    async describeLogStreams(logGroupName: string, options: LogStreamOptions = {}) {
        const command = new DescribeLogStreamsCommand({
            logGroupName: logGroupName,
            orderBy: options.orderBy || "LastEventTime",
            descending: options.descending ?? true,
            limit: options.limit || 10
        });
        const result = await this.cloudWatchLogs.send(command);
        return result.logStreams || [];
    }

    /**
     * Get log events from a log stream
     */
    async getLogEvents(logGroupName: string, logStreamName: string, options: LogEventOptions = {}) {
        const command = new GetLogEventsCommand({
            logGroupName: logGroupName,
            logStreamName: logStreamName,
            startTime: options.startTime,
            endTime: options.endTime,
            limit: options.limit || 100
        });
        const result = await this.cloudWatchLogs.send(command);
        return result.events || [];
    }

    // === API Gateway Operations ===

    /**
     * Get API Gateway V2 API by name
     */
    async getApiGatewayByName(name: string) {
        const result = await this.apiGatewayV2.send(new GetApisCommand({}));
        const apis = result.Items || [];
        
        return apis.find(api => api.Name === name);
    }

    /**
     * List routes for an API Gateway V2 API
     */
    async listApiGatewayRoutes(apiId: string) {
        const result = await this.apiGatewayV2.send(new GetRoutesCommand({
            ApiId: apiId
        }));
        
        return result.Items || [];
    }

    /**
     * List integrations for an API Gateway V2 API
     */
    async listApiGatewayIntegrations(apiId: string) {
        const result = await this.apiGatewayV2.send(new GetIntegrationsCommand({
            ApiId: apiId
        }));
        
        return result.Items || [];
    }

    // === OpenSearch Methods ===

    /**
     * Clear all documents from an OpenSearch index
     */
    async clearOpenSearchIndex(endpoint: string, indexName: string): Promise<void> {
        const client = new Client({
            ...AwsSigv4Signer({
                getCredentials: defaultProvider(),
                region: this.region,
                service: 'aoss',
            }),
            node: endpoint,
        });

        try {
            // Check if index exists first
            const indexExists = await client.indices.exists({
                index: indexName
            });

            if (!indexExists.body) {
                console.log(`Index ${indexName} does not exist, nothing to clear`);
                return;
            }

            // Delete all documents from the index
            const response = await client.deleteByQuery({
                index: indexName,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });

            console.log(`Cleared ${response.body.deleted || 0} documents from index: ${indexName}`);
        } catch (error: any) {
            if (error.message && error.message.includes('index_not_found_exception')) {
                console.log(`Index ${indexName} does not exist, nothing to clear`);
            } else {
                console.log(`Error clearing index ${indexName}: ${error.message || error}`);
                throw error;
            }
        }
    }

    /**
     * List OpenSearch indices (Note: OpenSearch Serverless has limited index listing capabilities)
     */
    async listOpenSearchIndices(endpoint: string): Promise<string[]> {
        const client = new Client({
            ...AwsSigv4Signer({
                getCredentials: defaultProvider(),
                region: this.region,
                service: 'aoss',
            }),
            node: endpoint,
        });

        try {
            // OpenSearch Serverless doesn't support cat.indices, so we'll try alternative approaches
            // Method 1: Try to list indices using _aliases (limited but sometimes works)
            try {
                const response = await client.indices.getAlias({
                    index: '*'
                });
                return Object.keys(response.body);
            } catch (_aliasError) {
                console.log('Alias-based listing failed, trying stats approach...');
            }

            // Method 2: Try using _stats endpoint
            try {
                const response = await client.indices.stats({
                    index: '*'
                });
                return Object.keys(response.body.indices || {});
            } catch (_statsError) {
                console.log('Stats-based listing failed');
            }

            // Method 3: Return empty array for AOSS (most common case)
            console.log('OpenSearch Serverless has limited index listing. Returning empty array.');
            return [];

        } catch (error: any) {
            console.log(`Error listing indices: ${error.message || error}`);
            // Don't throw error for listing - just return empty array
            return [];
        }
    }


    /**
     * Get document count from an OpenSearch index
     */
    async getOpenSearchIndexDocumentCount(endpoint: string, indexName: string): Promise<number> {
        const client = new Client({
            ...AwsSigv4Signer({
                getCredentials: defaultProvider(),
                region: this.region,
                service: 'aoss',
            }),
            node: endpoint,
        });

        try {
            const response = await client.count({
                index: indexName
            });

            return response.body.count || 0;
        } catch (error: any) {
            if (error.message && error.message.includes('index_not_found_exception')) {
                return 0;
            }
            throw error;
        }
    }

    // === Utility Methods ===

    /**
     * Get the configured region
     */
    getRegion(): string {
        return this.region;
    }

    /**
     * Cleanup method (AWS SDK v3 clients don't need explicit cleanup)
     */
    async cleanup(): Promise<void> {
        // AWS SDK v3 clients don't need explicit cleanup
        // This method is provided for future extensibility
    }
}