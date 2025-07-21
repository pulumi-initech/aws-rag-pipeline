# Integration Tests

This directory contains integration tests that deploy actual infrastructure using Pulumi's Automation API and verify the deployment works correctly.

## Test Structure

- `automation.ts` - Helper functions for deploying and managing Pulumi stacks
- `infrastructure.integration.test.ts` - Tests for OpenSearch configuration and conditional IAM policies
- `pinecone.integration.test.ts` - Tests for Pinecone configuration (requires API key)
- `document-processing.integration.test.ts` - End-to-end document processing tests with CloudWatch log verification

## Running Integration Tests

### Prerequisites

1. AWS credentials configured (via `aws configure` or environment variables)
2. Pulumi CLI installed
3. For Pinecone tests: `PINECONE_API_KEY` environment variable set

### Commands

```bash
# Run all integration tests
npm run test:integration

# Run only OpenSearch infrastructure tests
npm run test:integration -- --grep "Infrastructure Integration Tests"

# Run only Pinecone tests (requires PINECONE_API_KEY)
npm run test:integration -- --grep "Pinecone Integration Tests"

# Run only document processing tests
npm run test:integration -- --grep "Document Processing Integration Tests"

# Run unit tests separately
npm run test:unit

# Run all tests (unit + integration)
npm run test:all
```

### Test Timeouts

Integration tests have a 10-minute timeout to allow for infrastructure deployment and cleanup.

## What Gets Tested

### Infrastructure Tests
- ✅ All required resources are deployed
- ✅ S3 bucket is created and accessible
- ✅ Lambda functions are configured correctly
- ✅ IAM roles have proper permissions
- ✅ OpenSearch serverless collection is created
- ✅ S3 bucket notifications are configured
- ✅ API Gateway is properly set up

### Conditional IAM Policy Tests
- ✅ OpenSearch permissions are included when vectorStoreType = "opensearch"
- ✅ Base permissions (logs, bedrock) are always included
- ✅ Policy structure is correct and secure

### Pinecone Configuration Tests
- ✅ Pinecone is configured when vectorStoreType = "pinecone"
- ✅ OpenSearch permissions are NOT included for Pinecone
- ✅ Pinecone endpoint format is correct
- ✅ Policy has fewer statements than OpenSearch (no aoss permissions)

### Document Processing Tests
- ✅ End-to-end document upload and processing
- ✅ Lambda function trigger verification
- ✅ CloudWatch log analysis for processing success
- ✅ Concurrent document processing
- ✅ Lambda function health checks
- ✅ Environment variable validation
- ✅ Error handling for invalid files

## Test Environment

- **AWS Region**: us-west-2
- **Stack Name**: `integration-test` (for OpenSearch), `pinecone-integration-test` (for Pinecone)
- **Timeout**: 600 seconds (10 minutes)
- **Cleanup**: Automatic after tests complete

## CI/CD Integration

The tests are integrated into GitHub Actions:

- **Unit tests**: Run on every push/PR
- **Integration tests**: Run on pushes to main branch only
- **Security**: Dependency auditing and security scanning

## Cost Considerations

Integration tests deploy real AWS resources:

- OpenSearch Serverless collection (pay-per-use)
- Lambda functions (free tier eligible)
- S3 bucket (minimal cost)
- API Gateway (pay-per-request)

Tests clean up all resources after completion to minimize costs.

## Troubleshooting

### Common Issues

1. **Plugin Installation Errors**: Ensure Pulumi CLI is installed and accessible
2. **AWS Permission Errors**: Verify AWS credentials have sufficient permissions
3. **Timeout Errors**: Infrastructure deployment can take 5-10 minutes
4. **Pinecone API Key**: Set `PINECONE_API_KEY` environment variable for Pinecone tests

### Debug Mode

Enable debug logging:

```bash
PULUMI_LOG_LEVEL=debug npm run test:integration
```

### Manual Cleanup

If tests fail and don't clean up:

```bash
# List stacks
pulumi stack ls

# Destroy specific stack
pulumi stack select integration-test
pulumi destroy

# Or for Pinecone tests
pulumi stack select pinecone-integration-test
pulumi destroy
```

## Development

### Adding New Tests

1. Create test file in `test/integration/`
2. Import automation helpers
3. Use `before()` hook for deployment
4. Use `after()` hook for cleanup
5. Add appropriate test timeouts

### Test Structure

```typescript
describe("Your Integration Test", function() {
    this.timeout(600000); // 10 minutes
    
    let outputs: { [key: string]: any };
    
    before(async function() {
        outputs = await deploy();
    });
    
    after(async function() {
        await destroy();
    });
    
    it("should verify something", async () => {
        // Test implementation
    });
});
```