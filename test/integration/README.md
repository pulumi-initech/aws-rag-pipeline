# Integration Tests

Integration tests that deploy actual infrastructure using Pulumi Automation API and verify deployment correctness.

## Files

- `infrastructure.integration.test.ts` - Core infrastructure and IAM policy validation
- `automation.ts` - Pulumi stack management helpers

## Running Tests

### Prerequisites

- AWS credentials configured
- Pulumi CLI installed
- Integration tests run against the stack specified by `PULUMI_STACK_NAME` environment variable (defaults to `staging`)

### Commands

```bash
# All integration tests
npm run test:integration

# Specific test suites
npm run test:integration -- --grep "Infrastructure Integration Tests"
npm run test:integration -- --grep "Query Lambda Integration"

# Debug mode
PULUMI_LOG_LEVEL=debug npm run test:integration
```

## Test Coverage

### ✅ Core Infrastructure

- Pipeline outputs validation (bucket name, API endpoint)
- S3 bucket creation and accessibility

### ✅ Ingestion Lambda Configuration

- IAM inline policy permissions validation
- Lambda function health state verification
- Environment variables configuration
- S3 bucket notification setup
- Lambda invoke permissions for S3

### ✅ Query Lambda Configuration

- IAM inline policy permissions validation
- Lambda function health state verification
- Environment variables configuration

### ✅ API Gateway Configuration

- API Gateway creation and endpoint validation
- Lambda invoke permissions for API Gateway
- AWS_PROXY integration with Lambda
- POST /query route configuration
- HTTP API response validation

### ✅ Lambda Integration Tests

- **Ingestion**: S3 event processing and CloudWatch logs
- **Query**: API Gateway invocation with log validation and JSON parsing

## Environment

- **Region**: us-east-1
- **Stack**: `staging` (shared with e2e tests)
- **Timeout**: 10 minutes
- **Auto-cleanup**: Yes

## Troubleshooting

### Common Issues

1. **Timeouts**: Infrastructure deployment takes 5-10 minutes
2. **Permissions**: Ensure AWS credentials have admin access
3. **Stack conflicts**: Use unique stack names if running parallel tests

### Manual Cleanup

```bash
pulumi stack select staging
pulumi destroy
```

## Adding Tests

```typescript
describe("New Integration Test", function() {
    this.timeout(600000);
    
    let awsHelper: AWSHelper;
    let outputs: { [key: string]: any };
    
    before(async function() {
        const stack = await select();
        outputs = await stack.outputs();
        awsHelper = new AWSHelper({ region: "us-east-1" });
    });
    
    after(async function() {
        await awsHelper.cleanup();
    });
    
    it("should test something", async () => {
        // Test implementation
    });
});
```

## Cost Notes

Tests deploy real AWS resources but auto-cleanup after completion. Estimated cost per test run: < $0.01.