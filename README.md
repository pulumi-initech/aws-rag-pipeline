# AWS RAG Pipeline

A Retrieval-Augmented Generation (RAG) pipeline built with Pulumi and TypeScript, supporting both OpenSearch Serverless and Pinecone vector stores with conditional IAM policies.

## Architecture

This project creates a complete RAG pipeline with:

- **Document Ingestion**: S3-triggered Lambda function that processes documents and stores embeddings
- **Query Processing**: API Gateway + Lambda for semantic search and response generation
- **Vector Store**: Support for both OpenSearch Serverless and Pinecone with conditional configuration
- **Security**: Conditional IAM policies that only grant necessary permissions based on vector store type

## Prerequisites

- Pulumi CLI (>= v3): https://www.pulumi.com/docs/get-started/install/
- Node.js (>= 18): https://nodejs.org/
- AWS credentials configured (e.g., via `aws configure` or environment variables)
- For Pinecone: API key configured in Pulumi config

## Getting Started

1. Clone and install dependencies:

   ```bash
   npm install
   ```

2. Configure your project:

   ```bash
   pulumi config set aws:region us-west-2
   
   # For OpenSearch (default)
   pulumi config set vectorStoreType opensearch
   
   # OR for Pinecone
   pulumi config set vectorStoreType pinecone
   pulumi config set pinecone:APIKey your-pinecone-api-key --secret
   ```

3. Preview and deploy your infrastructure:

   ```bash
   pulumi preview
   pulumi up
   ```

4. Test the pipeline:

   ```bash
   # Upload a document to the input S3 bucket
   aws s3 cp document.pdf s3://$(pulumi stack output inputBucketName)/

   # Query the RAG pipeline
   curl -X POST $(pulumi stack output apiEndpoint)/query \
     -H "Content-Type: application/json" \
     -d '{"query": "What is the document about?"}'
   ```

5. Clean up when finished:

   ```bash
   pulumi destroy
   ```

## Project Structure

```
├── components/
│   ├── Ingestion.ts         # Document ingestion component
│   ├── Query.ts             # Query processing component
│   └── VectorStore.ts       # Vector store abstraction
├── lambda/
│   ├── ingestion/           # Document processing Lambda
│   └── query/               # Query processing Lambda
├── test/
│   └── components/          # Unit tests for components
├── index.ts                 # Main Pulumi program
└── README.md
```

## Components

### VectorStore Component
- **OpenSearch**: Creates serverless collection with security policies
- **Pinecone**: Creates index with specified dimensions and metric
- **Configuration**: Returns unified config object for other components

### Ingestion Component
- **S3 Integration**: Listens for object creation events
- **Lambda Function**: Processes documents and generates embeddings
- **Conditional IAM**: Only includes OpenSearch permissions when using OpenSearch

### Query Component
- **API Gateway**: HTTP API for query endpoint
- **Lambda Function**: Handles semantic search and response generation
- **Conditional IAM**: Only includes OpenSearch permissions when using OpenSearch

## Configuration

| Key | Description | Default | Required |
|-----|-------------|---------|----------|
| `aws:region` | AWS region for deployment | `us-west-2` | No |
| `vectorStoreType` | Vector store type (`opensearch` or `pinecone`) | `opensearch` | No |
| `pinecone:APIKey` | Pinecone API key (when using Pinecone) | - | Only for Pinecone |

## Security Features

### Conditional IAM Policies
The pipeline implements conditional IAM policies that only grant permissions based on the vector store type:

- **OpenSearch**: Includes `aoss:APIAccessAll` permissions
- **Pinecone**: Excludes OpenSearch permissions entirely

This follows the principle of least privilege, ensuring components only have access to the resources they actually use.

## Testing

The project includes comprehensive unit and integration tests:

### Unit Tests

Run fast, mocked component tests:

```bash
npm run test:unit
```

### Integration Tests

Run end-to-end infrastructure tests (deploys actual AWS resources):

```bash
# Prerequisites: AWS credentials configured
npm run test:integration

# Run all tests (unit + integration)
npm run test:all
```

### Test Coverage

**Unit Tests** (fast, mocked):
- ✅ Component instantiation and configuration
- ✅ Conditional IAM policies for both vector store types
- ✅ S3 bucket notifications
- ✅ API Gateway setup
- ✅ Lambda function configuration

**Integration Tests** (deploys real infrastructure):
- ✅ Full infrastructure deployment
- ✅ AWS resource creation and configuration
- ✅ Conditional IAM policies in real AWS environment
- ✅ OpenSearch Serverless collection setup
- ✅ S3 bucket notifications with Lambda triggers
- ✅ API Gateway endpoint accessibility
- ✅ Pinecone configuration (when API key provided)
- ✅ End-to-end document processing with CloudWatch log verification
- ✅ Lambda function trigger testing
- ✅ Concurrent document processing
- ✅ Error handling validation

### CI/CD Testing

- **Unit tests**: Run on every push/PR
- **Integration tests**: Run on pushes to main branch
- **Security scanning**: Dependency auditing and security checks

See `test/integration/README.md` for detailed integration test documentation.

## Development

### Adding New Vector Stores

1. Update `VectorStoreArgs` interface in `components/VectorStore.ts`
2. Add new vector store logic in `VectorStore` constructor
3. Update conditional IAM policies in `Ingestion.ts` and `Query.ts`
4. Add corresponding tests

### Lambda Functions

Lambda functions are located in the `lambda/` directory:
- `ingestion/`: Document processing and embedding generation
- `query/`: Semantic search and response generation

## Outputs

After deployment, the following outputs are available:

- `inputBucketName`: S3 bucket for document uploads
- `apiEndpoint`: API Gateway endpoint for queries
- `vectorStoreEndpoint`: Vector store endpoint URL
- `vectorStoreType`: Configured vector store type

## Monitoring

The pipeline includes:
- CloudWatch logs for Lambda functions
- S3 bucket notifications for document processing
- API Gateway access logs

## Cost Optimization

- **OpenSearch Serverless**: Pay-per-use pricing
- **Lambda**: Event-driven execution
- **S3**: Standard storage with lifecycle policies
- **Pinecone**: Supports free tier for development

## Contributing

1. Make changes to components or Lambda functions
2. Add or update tests in `test/components/`
3. Run tests: `npm test`
4. Update documentation as needed

## License

MIT License - see LICENSE file for details.