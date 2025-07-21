import { S3Client, ListBucketsCommand, PutObjectCommand, HeadObjectCommand, GetBucketLocationCommand, GetBucketNotificationConfigurationCommand } from "@aws-sdk/client-s3";
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand, GetPolicyCommand } from "@aws-sdk/client-lambda";
import { IAMClient, ListRolesCommand, ListRolePoliciesCommand, GetRolePolicyCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import { CloudWatchLogsClient, DescribeLogStreamsCommand, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

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
    private region: string;

    constructor(options: AWSHelperOptions = {}) {
        this.region = options.region || "us-west-2";
        
        // Initialize AWS clients with consistent configuration
        this.s3 = new S3Client({ region: this.region });
        this.lambda = new LambdaClient({ region: this.region });
        this.iam = new IAMClient({ region: this.region });
        this.cloudWatchLogs = new CloudWatchLogsClient({ region: this.region });
    }

    // === Lambda Operations ===

    /**
     * List all Lambda functions
     */
    async listLambdaFunctions() {
        const result = await this.lambda.send(new ListFunctionsCommand({}));
        return result.Functions || [];
    }

    /**
     * List Lambda function permissions (resource-based policy)
     */
    async listLambdaPermissions(functionName: string) {
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

    /**
     * Get detailed Lambda function configuration
     */
    async getLambdaFunction(functionName: string) {
        return await this.lambda.send(new GetFunctionCommand({
            FunctionName: functionName
        }));
    }

    // === IAM Operations ===

    /**
     * List all IAM roles
     */
    async listIAMRoles() {
        const result = await this.iam.send(new ListRolesCommand({}));
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
     * Get S3 bucket location
     */
    async getS3BucketLocation(bucketName: string) {
        return await this.s3.send(new GetBucketLocationCommand({ 
            Bucket: bucketName 
        }));
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
     * Get S3 object metadata
     */
    async headS3Object(bucketName: string, key: string) {
        return await this.s3.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
        }));
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