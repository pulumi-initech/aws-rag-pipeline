# AWS Test Helper

A comprehensive helper class for AWS SDK operations in integration and E2E tests.

## Overview

The `AWSTestHelper` class encapsulates common AWS SDK patterns found across integration tests, providing a clean, consistent API for:

- **AWS Client Management**: Centralized initialization of S3, Lambda, IAM, and CloudWatch Logs clients
- **Resource Discovery**: Find Lambda functions, IAM roles, and S3 buckets by name patterns
- **Policy Analysis**: Parse and analyze IAM policies for specific permissions
- **Log Analysis**: Retrieve and analyze CloudWatch logs for processing evidence
- **S3 Operations**: Upload, verify, and manage S3 objects
- **Utility Functions**: Common operations like waiting, validation, and test data generation

## Quick Start

```typescript
import { AWSTestHelper } from "../helpers/index.ts";

// Initialize with default configuration (us-west-2)
const awsHelper = new AWSTestHelper();

// Or with custom configuration
const awsHelper = new AWSTestHelper({ region: "us-east-1" });
```

## Core Features

### 1. Resource Discovery

```typescript
// Find Lambda functions
const functions = await awsHelper.findPipelineLambdaFunctions();
console.log(functions.ingestion?.FunctionName);
console.log(functions.query?.FunctionName);

// Find IAM roles
const roles = await awsHelper.findPipelineIAMRoles();
console.log(roles.ingestion?.RoleName);
console.log(roles.query?.RoleName);
```

### 2. Policy Analysis

```typescript
// Analyze IAM role policies
const policyAnalysis = await awsHelper.analyzeRolePolicy("my-role-name");
console.log(policyAnalysis.hasOpenSearchPermissions);
console.log(policyAnalysis.hasLoggingPermissions);
console.log(policyAnalysis.hasBedrockPermissions);
console.log(policyAnalysis.statementCount);
```

### 3. S3 Operations

```typescript
// Upload single document
await awsHelper.uploadDocument("my-bucket", "test.txt", "content");

// Upload multiple documents concurrently
await awsHelper.uploadDocuments("my-bucket", [
    { name: "doc1.txt", content: "content 1" },
    { name: "doc2.txt", content: "content 2" }
]);

// Verify object exists
const metadata = await awsHelper.verifyObject("my-bucket", "test.txt");
console.log(metadata.ContentType);
```

### 4. Log Analysis

```typescript
// Get Lambda function logs
const logs = await awsHelper.getLambdaLogs("my-function", {
    searchTerm: "processing",
    minutes: 5,
    limit: 100
});

// Analyze logs for processing evidence
const analysis = awsHelper.analyzeLogsForProcessing(logs, "test-file.txt");
console.log(analysis.processingFound);
console.log(analysis.successFound);
console.log(analysis.errorFound);
```

### 5. Pipeline Validation

```typescript
// Validate pipeline outputs
const validation = awsHelper.validatePipelineOutputs(outputs, "opensearch");
console.log(validation.hasInputBucketName);
console.log(validation.correctVectorStoreType);
console.log(validation.validEndpointFormat);
```

### 6. Test Utilities

```typescript
// Generate unique test file names
const fileName = awsHelper.generateTestFileName("integration-test");

// Create structured test content
const content = awsHelper.createTestDocumentContent(
    "My Test Document",
    "Additional test content here"
);

// Wait for processing
await awsHelper.waitForProcessing('medium'); // short, medium, long
```

## Method Reference

### Lambda Operations

| Method | Description |
|--------|-------------|
| `findLambdaFunctions(pattern)` | Find functions by name pattern |
| `findPipelineLambdaFunctions()` | Find ingestion and query functions |
| `getLambdaConfiguration(name)` | Get detailed function configuration |
| `validateLambdaConfiguration(config, expected)` | Validate function configuration |

### IAM Operations

| Method | Description |
|--------|-------------|
| `findIAMRoles(pattern)` | Find roles by name pattern |
| `findPipelineIAMRoles()` | Find ingestion and query roles |
| `analyzeRolePolicy(roleName)` | Analyze role policy permissions |

### S3 Operations

| Method | Description |
|--------|-------------|
| `bucketExists(name)` | Check if bucket exists |
| `uploadDocument(bucket, key, content, type)` | Upload single document |
| `uploadDocuments(bucket, docs)` | Upload multiple documents |
| `verifyObject(bucket, key)` | Verify object exists and get metadata |
| `getBucketNotificationConfiguration(bucket)` | Get notification config |

### CloudWatch Logs Operations

| Method | Description |
|--------|-------------|
| `getRecentLogs(logGroup, options)` | Get recent logs from log group |
| `getLambdaLogs(functionName, options)` | Get Lambda function logs |
| `analyzeLogsForProcessing(logs, fileName)` | Analyze logs for processing evidence |

### Utility Methods

| Method | Description |
|--------|-------------|
| `wait(milliseconds)` | Wait for specified duration |
| `waitForProcessing(type)` | Wait with predefined timeouts |
| `validatePipelineOutputs(outputs, type)` | Validate pipeline outputs |
| `generateTestFileName(prefix, extension)` | Generate unique test file names |
| `createTestDocumentContent(title, content)` | Create structured test content |

## Configuration Options

### LogSearchOptions

```typescript
interface LogSearchOptions {
    searchTerm?: string;  // Filter logs by search term
    minutes?: number;     // How far back to search (default: 5)
    limit?: number;       // Max events per stream (default: 100)
}
```

### PolicyAnalysisResult

```typescript
interface PolicyAnalysisResult {
    hasOpenSearchPermissions: boolean;
    hasLoggingPermissions: boolean;
    hasBedrockPermissions: boolean;
    statementCount: number;
    policyDocument: any;
}
```

## Migration Guide

### Before (without helper)

```typescript
// Initialize multiple clients
const s3 = new S3Client({ region: "us-west-2" });
const lambda = new LambdaClient({ region: "us-west-2" });
const iam = new IAMClient({ region: "us-west-2" });

// Find Lambda functions
const functions = await lambda.send(new ListFunctionsCommand({}));
const ingestionFunction = functions.Functions?.find(f => 
    f.FunctionName?.includes("ingestion-lambda")
);

// Upload document
await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: testFileName,
    Body: testContent,
    ContentType: "text/plain"
}));

// Get logs
const logStreams = await cloudWatchLogs.send(new DescribeLogStreamsCommand({
    logGroupName: logGroupName,
    orderBy: "LastEventTime",
    descending: true,
    limit: 10
}));
// ... more complex log processing
```

### After (with helper)

```typescript
// Initialize helper
const awsHelper = new AWSTestHelper({ region: "us-west-2" });

// Find Lambda functions
const functions = await awsHelper.findPipelineLambdaFunctions();
const ingestionFunction = functions.ingestion;

// Upload document
await awsHelper.uploadDocument(bucketName, testFileName, testContent);

// Get logs
const logs = await awsHelper.getLambdaLogs(ingestionFunction.FunctionName!, {
    searchTerm: testFileName,
    minutes: 5
});
```

## Best Practices

1. **Initialize once**: Create the helper instance in your test's `before()` hook
2. **Use specific methods**: Prefer `findPipelineLambdaFunctions()` over `findLambdaFunctions()`
3. **Handle errors**: The helper includes error handling, but always check return values
4. **Clean up**: Call `awsHelper.cleanup()` in your `after()` hook
5. **Use type safety**: TypeScript definitions are included for all methods

## Examples

See the example files for complete test refactoring:
- `test/integration/infrastructure.integration.test.example.ts`
- `test/e2e/document-processing.refactored.example.ts`

## Benefits

- **Reduced Code Duplication**: Common patterns are centralized
- **Better Error Handling**: Consistent error handling across all operations
- **Improved Readability**: Tests focus on business logic, not AWS SDK details
- **Type Safety**: Full TypeScript support with proper typing
- **Maintainability**: Changes to AWS patterns only need to be made in one place
- **Consistency**: All tests use the same patterns and configurations