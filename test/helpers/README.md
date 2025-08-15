# Test Helpers

Comprehensive helper classes for AWS operations and test utilities in integration and E2E tests.

## Overview

The test helpers provide clean, consistent APIs for:

- **AWS Client Management**: Centralized initialization of S3, Lambda, IAM, CloudWatch Logs, and API Gateway clients
- **Resource Operations**: Interact with Lambda functions, IAM roles, S3 buckets, and API Gateway resources
- **Inline Policy Analysis**: Parse and analyze IAM inline policies for specific permissions
- **Log Analysis**: Retrieve and analyze CloudWatch logs for processing evidence
- **Test Utilities**: Common operations like waiting, validation, and test data generation
- **Vector Store Operations**: OpenSearch index management and document counting

## Quick Start

```typescript
import { AWSHelper, TestUtils, queryAPI } from "../helpers/index.ts";

// Initialize with default configuration (us-west-2)
const awsHelper = new AWSHelper();

// Or with custom configuration
const awsHelper = new AWSHelper({ region: "us-east-1" });
```

## Core Features

### 1. Lambda Operations

```typescript
// Get Lambda function configuration by ARN
const lambdaConfig = await awsHelper.getLambdaFunctionConfigurationByArn(lambdaArn);
console.log(lambdaConfig?.FunctionName);

// Get Lambda function permissions
const permissions = await awsHelper.getLambdaResourcePolicy("function-name");
console.log(permissions.length);
```

### 2. IAM Inline Policy Analysis

```typescript
// Get IAM role and analyze inline policies
const role = await awsHelper.getIAMRole("role-name");
const policyNames = await awsHelper.listRolePolicies("role-name");
const policy = await awsHelper.getRolePolicy("role-name", policyNames[0]);

// Analyze inline policy permissions
const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);
console.log(policyAnalysis.hasOpenSearchPermissions);
console.log(policyAnalysis.hasLoggingPermissions);
console.log(policyAnalysis.hasBedrockPermissions);
```

### 3. S3 Operations

```typescript
// List S3 buckets
const buckets = await awsHelper.listS3Buckets();
const bucketExists = TestUtils.bucketExists(buckets, "bucket-name");

// Upload object to S3
await awsHelper.putS3Object("bucket-name", "key", "content", "text/plain");

// Get bucket notification configuration
const notification = await awsHelper.getS3BucketNotificationConfiguration("bucket-name");
```

### 4. API Gateway Operations

```typescript
// Get API Gateway by name
const api = await awsHelper.getApiGatewayByName("api-name");

// List API Gateway routes and integrations
const routes = await awsHelper.listApiGatewayRoutes(api.ApiId);
const integrations = await awsHelper.listApiGatewayIntegrations(api.ApiId);

// Query API endpoint
const response = await queryAPI("https://api-endpoint.com", "test query");
console.log(response.success);
```

### 5. CloudWatch Logs

```typescript
// Get log streams and events
const logStreams = await awsHelper.describeLogStreams("/aws/lambda/function-name");
const logEvents = await awsHelper.getLogEvents("/aws/lambda/function-name", "stream-name");

// Collect logs from multiple streams
const logs = await TestUtils.collectLogsFromStreams(
    awsHelper, 
    "/aws/lambda/function-name", 
    logStreams, 
    { searchTerm: "processing", minutes: 5 }
);
```

### 6. Test Utilities

```typescript
// Generate unique test file names
const fileName = TestUtils.generateTestFileName("integration-test");

// Create structured test content
const content = TestUtils.createTestDocumentContent(
    "My Test Document",
    "Additional test content here"
);

// Wait for processing
await TestUtils.waitForProcessing('medium'); // short, medium, long

// Validate pipeline outputs
const validation = TestUtils.validatePipelineOutputs(outputs, "opensearch");
console.log(validation.hasInputBucketName);
```

### 7. OpenSearch Operations

```typescript
// Clear OpenSearch index
await awsHelper.clearOpenSearchIndex("https://endpoint.aoss.amazonaws.com", "index-name");

// Get document count from index
const count = await awsHelper.getOpenSearchIndexDocumentCount("https://endpoint.aoss.amazonaws.com", "index-name");
console.log(`Index contains ${count} documents`);
```

## Method Reference

### AWSHelper - Lambda Operations

| Method | Description |
|--------|-------------|
| `getLambdaResourcePolicy(functionName)` | Get Lambda function resource-based policy |
| `getLambdaFunctionConfigurationByArn(arn)` | Get Lambda configuration by ARN |

### AWSHelper - IAM Operations

| Method | Description |
|--------|-------------|
| `listIAMRoles()` | List all IAM roles |
| `getIAMRole(roleName)` | Get specific IAM role |
| `listRolePolicies(roleName)` | List inline policies for a role |
| `getRolePolicy(roleName, policyName)` | Get inline policy document |

### AWSHelper - S3 Operations

| Method | Description |
|--------|-------------|
| `listS3Buckets()` | List all S3 buckets |
| `bucketExists(bucketName)` | Check if S3 bucket exists (efficient) |
| `putS3Object(bucket, key, body, contentType?)` | Upload object to S3 |
| `getS3BucketNotificationConfiguration(bucket)` | Get bucket notification config |

### AWSHelper - API Gateway Operations

| Method | Description |
|--------|-------------|
| `getApiGatewayByName(name)` | Get API Gateway V2 API by name |
| `listApiGatewayRoutes(apiId)` | List routes for API Gateway |
| `listApiGatewayIntegrations(apiId)` | List integrations for API Gateway |

### AWSHelper - CloudWatch Logs Operations

| Method | Description |
|--------|-------------|
| `describeLogStreams(logGroup, options?)` | Get log streams in log group |
| `getLogEvents(logGroup, stream, options?)` | Get events from log stream |

### AWSHelper - OpenSearch Operations

| Method | Description |
|--------|-------------|
| `clearOpenSearchIndex(endpoint, indexName)` | Clear all documents from index |
| `listOpenSearchIndices(endpoint)` | List indices (limited in AOSS) |
| `getOpenSearchIndexDocumentCount(endpoint, indexName)` | Get document count |

### TestUtils - Utility Methods

| Method | Description |
|--------|-------------|
| `waitForProcessing(type)` | Wait with predefined timeouts (short/medium/long) |
| `validatePipelineOutputs(outputs, type)` | Validate pipeline outputs structure |
| `generateTestFileName(prefix, extension?)` | Generate unique test file names |
| `createTestDocumentContent(title, content?)` | Create structured test content |
| `bucketExists(buckets, bucketName)` | Check if bucket exists in list |
| `analyzePolicyPermissions(policy)` | Analyze IAM inline policy for permissions |
| `findResourceByNamePattern(resources, field, pattern)` | Find resource by pattern |
| `findRoleByRoleName(roles, roleName)` | Find IAM role by name pattern |

### TestUtils - Log Processing

| Method | Description |
|--------|-------------|
| `collectLogsFromStreams(helper, logGroup, streams, options?)` | Collect logs from multiple streams |
| `parseLogStreamsForEvent(logMessages)` | Parse logs for event messages |
| `parseLogStreamsForProcessing(logs, fileName)` | Parse logs for processing indicators |
| `getLambdaLogGroupName(functionName)` | Get log group name for Lambda |
| `checkForCatastrophicFailures(logs)` | Check logs for timeout/OOM errors |

### TestUtils - Document Management

| Method | Description |
|--------|-------------|
| `uploadDocuments(helper, bucket, documents)` | Upload multiple documents concurrently |
| `clearVectorStoreIndex(helper, type, endpoint, index)` | Clear vector store index |
| `getVectorStoreDocumentCount(helper, type, endpoint, index)` | Get document count from vector store |

### Standalone Functions

| Function | Description |
|----------|-------------|
| `queryAPI(endpoint, query)` | Query API Gateway endpoint with POST request |

## Configuration Options

### AWSHelperOptions

```typescript
interface AWSHelperOptions {
    region?: string;  // AWS region (default: us-west-2)
}
```

### LogStreamOptions

```typescript
interface LogStreamOptions {
    orderBy?: "LogStreamName" | "LastEventTime";  // Sort order
    descending?: boolean;                          // Descending sort
    limit?: number;                               // Max streams to return
}
```

### LogEventOptions

```typescript
interface LogEventOptions {
    startTime?: number;  // Start time in milliseconds
    endTime?: number;    // End time in milliseconds  
    limit?: number;      // Max events to return
}
```

### PolicyAnalysis

```typescript
interface PolicyAnalysis {
    hasOpenSearchPermissions: boolean;
    hasLoggingPermissions: boolean;
    hasBedrockPermissions: boolean;
    statementCount: number;
    policyDocument: any;
}
```

### ValidationResult

```typescript
interface ValidationResult {
    hasInputBucketName: boolean;
    hasApiEndpoint: boolean;
    hasVectorStoreEndpoint: boolean;
    hasVectorStoreType: boolean;
    correctVectorStoreType: boolean;
    validEndpointFormat: boolean;
}
```

## Usage Examples

### Basic Integration Test

```typescript
import { AWSHelper, TestUtils, queryAPI } from "../helpers/index.ts";

describe("Pipeline Integration Test", () => {
    let awsHelper: AWSHelper;

    beforeAll(async () => {
        awsHelper = new AWSHelper({ region: "us-east-1" });
    });

    afterAll(async () => {
        await awsHelper.cleanup();
    });

    it("should process document end-to-end", async () => {
        // Generate test data
        const fileName = TestUtils.generateTestFileName("integration-test");
        const content = TestUtils.createTestDocumentContent("Test Document");

        // Upload to S3
        await awsHelper.putS3Object("my-bucket", fileName, content, "text/plain");

        // Wait for processing
        await TestUtils.waitForProcessing('medium');

        // Verify via API
        const response = await queryAPI("https://api.example.com", "test query");
        expect(response.success).toBe(true);
    });
});
```

### Inline Policy Validation Test

```typescript
it("should have correct IAM permissions", async () => {
    const roleName = "my-lambda-role";
    
    // Get role inline policy
    const policyNames = await awsHelper.listRolePolicies(roleName);
    const policy = await awsHelper.getRolePolicy(roleName, policyNames[0]);
    
    // Analyze inline policy permissions
    const analysis = TestUtils.analyzePolicyPermissions(policy);
    expect(analysis.hasOpenSearchPermissions).toBe(true);
    expect(analysis.hasBedrockPermissions).toBe(true);
});
```

## Best Practices

1. **Initialize once**: Create the AWSHelper instance in your test's `beforeAll()` hook
2. **Set correct region**: Use the region where your resources are deployed
3. **Handle errors**: The helpers include error handling, but always check return values
4. **Clean up**: Call `awsHelper.cleanup()` in your `afterAll()` hook (though AWS SDK v3 doesn't require it)
5. **Use TestUtils for test logic**: Prefer TestUtils methods for test-specific operations
6. **Batch operations**: Use functions like `uploadDocuments()` for multiple operations
7. **Use proper typing**: Import and use the provided TypeScript interfaces

## Available Test Files

Current integration and E2E tests using these helpers:
- `test/integration/infrastructure.integration.test.ts` - Infrastructure validation
- `test/e2e/complete-pipeline.e2e.test.ts` - End-to-end pipeline testing
- `test/unit/*.test.ts` - Component unit tests

## Benefits

- **Reduced Code Duplication**: Common AWS operations are centralized
- **Better Error Handling**: Consistent error handling across all operations
- **Improved Readability**: Tests focus on business logic, not AWS SDK details
- **Type Safety**: Full TypeScript support with proper interfaces
- **Maintainability**: Changes to AWS patterns only need to be made in one place
- **Comprehensive Testing**: Supports Lambda, IAM, S3, API Gateway, CloudWatch, and OpenSearch operations
- **Flexible Configuration**: Support for different regions and vector store types