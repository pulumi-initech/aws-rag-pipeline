# RAG Pipeline Policy Pack

This directory contains a Pulumi CrossGuard Policy Pack for validating RAG pipeline infrastructure.

## Policy Pack

### `policy-pack.ts`
The main policy pack that contains validation rules for:
- **ServerlessAccessPolicy Creation**: Ensures ServerlessAccessPolicy is created when using OpenSearch
- **Vector Store Consistency**: Validates that only one vector store type is used
- **Security Policy Requirements**: Ensures proper encryption and network policies for OpenSearch
- **Resource Dependencies**: Validates that required dependencies exist

## Policies

### 1. `serverless-access-policy-required-for-opensearch`
- **Level**: Mandatory
- **Description**: Ensures ServerlessAccessPolicy is created when OpenSearch collections exist
- **Validates**: ServerlessAccessPolicy exists for each OpenSearch collection

### 2. `serverless-access-policy-not-allowed-without-opensearch`
- **Level**: Advisory
- **Description**: Warns when ServerlessAccessPolicy exists without OpenSearch collections
- **Validates**: No orphaned access policies

### 3. `serverless-access-policy-type-validation`
- **Level**: Mandatory
- **Description**: Ensures ServerlessAccessPolicy has type 'data'
- **Validates**: Policy type is correctly set

### 4. `serverless-access-policy-naming-convention`
- **Level**: Advisory
- **Description**: Enforces naming conventions for access policies
- **Validates**: Policy names end with '-dap' (data access policy)

### 5. `opensearch-collection-requires-security-policies`
- **Level**: Mandatory
- **Description**: Ensures OpenSearch collections have encryption and network policies
- **Validates**: Required security policies exist for collections

### 6. `pinecone-no-opensearch-resources`
- **Level**: Mandatory
- **Description**: Prevents mixing Pinecone and OpenSearch resources
- **Validates**: Only one vector store type is used

### 7. `lambda-roles-exist-for-access-policy`
- **Level**: Mandatory
- **Description**: Ensures Lambda roles exist before creating access policies
- **Validates**: Required Lambda roles are present

### 8. `vector-store-type-consistency`
- **Level**: Advisory
- **Description**: Validates vector store configuration consistency
- **Validates**: Proper vector store configuration exists

## Usage

### Install the Policy Pack

```bash
cd test/static
npm install
```

### Enable the Policy Pack

```bash
# Enable locally during development
pulumi policy enable ./test/static rag-pipeline-policies

# Or publish to Pulumi Cloud
pulumi policy publish ./test/static
```

### Run Infrastructure with Policy Validation

```bash
# Run pulumi up with policy validation
pulumi up --policy-pack ./test/static

# Or if published to Pulumi Cloud
pulumi up --policy-pack rag-pipeline-policies
```

### Test the Policy Pack

```bash
cd test/static
pulumi policy test policy-tests.ts
```

## Test Scenarios

The `policy-tests.ts` file contains comprehensive test scenarios:

### Valid Configurations
- ✅ OpenSearch with proper ServerlessAccessPolicy
- ✅ Pinecone configuration without OpenSearch resources

### Invalid Configurations
- ❌ OpenSearch collection without ServerlessAccessPolicy
- ❌ Mixed OpenSearch and Pinecone resources
- ❌ ServerlessAccessPolicy with wrong type
- ❌ ServerlessAccessPolicy without Lambda roles
- ❌ No vector store resources

## Key Validation Logic

### ServerlessAccessPolicy Creation Check
```typescript
// Find OpenSearch collections
const openSearchCollections = resources.filter(r => 
    r.type === "aws:opensearch/serverlessCollection:ServerlessCollection"
);

// Find ServerlessAccessPolicy resources
const serverlessAccessPolicies = resources.filter(r => 
    r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
);

// If we have OpenSearch collections, we must have access policies
if (openSearchCollections.length > 0 && serverlessAccessPolicies.length === 0) {
    reportViolation("ServerlessAccessPolicy is required when using OpenSearch Serverless collections");
}
```

### Vector Store Type Consistency
```typescript
const hasOpenSearch = openSearchResources.length > 0;
const hasPinecone = pineconeResources.length > 0;

if (hasOpenSearch && hasPinecone) {
    reportViolation("Mixed vector store configuration detected. Use only one vector store type.");
}
```

## Integration

This policy pack integrates with the main RAG pipeline by:
1. Validating the conditional logic in `index.ts`
2. Ensuring proper resource creation based on `vectorStoreType`
3. Enforcing security best practices
4. Preventing configuration errors

The policies specifically validate that when `vectorStoreType === "opensearch"`, the appropriate ServerlessAccessPolicy is created, which aligns with the conditional logic in the main infrastructure code.