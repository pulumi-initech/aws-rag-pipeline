# AWS RAG Pipeline

A Retrieval-Augmented Generation (RAG) pipeline built with Pulumi and TypeScript, supporting both OpenSearch Serverless and Pinecone vector stores with conditional IAM policies. Lambda functions are implemented in Python using LangChain and containerized with Docker for scalable deployment.

## Architecture

This project creates a complete RAG pipeline with:

- **Document Ingestion**: S3-triggered containerized Lambda function (Python) that processes documents and stores embeddings using LangChain and AWS Bedrock
- **Query Processing**: API Gateway + containerized Lambda (Python) for semantic search and response generation using LangChain
- **Vector Store**: Support for both OpenSearch Serverless and Pinecone with conditional configuration
- **Container Infrastructure**: Docker-based Lambda functions with multi-stage builds and ECR repositories
- **Security**: Conditional IAM policies that only grant necessary permissions based on vector store type

## Prerequisites

- Pulumi CLI (>= v3): https://www.pulumi.com/docs/get-started/install/
- Node.js (>= 18): https://nodejs.org/
- Docker: Required for building Lambda container images
- AWS credentials configured (e.g., via `aws configure` or environment variables)
- For Pinecone: API key configured in Pulumi config

## Getting Started

1. Clone and install dependencies:

   ```bash
   pnpm install
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
│   ├── ContainerImage.ts    # Docker container image component
│   ├── Ingestion.ts         # Document ingestion component
│   ├── Query.ts             # Query processing component
│   ├── SecureBucket.ts      # S3 bucket with security policies
│   ├── ServerlessAccessPolicy.ts # OpenSearch security policies
│   └── VectorStore.ts       # Vector store abstraction
├── lambda/
│   ├── ingestion/           # Document processing Lambda (Python)
│   │   ├── Dockerfile       # Container image definition
│   │   ├── main.py          # Lambda function code
│   │   └── requirements.txt # Python dependencies
│   └── query/               # Query processing Lambda (Python)
│       ├── Dockerfile       # Container image definition
│       ├── main.py          # Lambda function code
│       └── requirements.txt # Python dependencies
├── test/
│   ├── e2e/                 # End-to-end tests
│   ├── integration/         # Integration tests
│   ├── unit/                # Unit tests for components
│   └── static/              # Static analysis and policy tests
├── index.ts                 # Main Pulumi program
├── rag-architecture-hld.md  # High-level design documentation
└── README.md
```

## Components

### ContainerImage Component
- **Docker Build**: Multi-stage container builds for Lambda functions
- **ECR Integration**: Pushes images to Amazon ECR repositories
- **Platform Support**: Builds for linux/amd64 architecture

### VectorStore Component
- **OpenSearch**: Creates serverless collection with security policies
- **Pinecone**: Creates index with specified dimensions and metric
- **Configuration**: Returns unified config object for other components

### Ingestion Component
- **S3 Integration**: Listens for object creation events
- **Containerized Lambda**: Python-based function using LangChain for document processing
- **Embedding Generation**: Uses AWS Bedrock Titan embeddings model
- **Conditional IAM**: Only includes OpenSearch permissions when using OpenSearch

### Query Component
- **API Gateway**: HTTP API for query endpoint
- **Containerized Lambda**: Python-based function using LangChain for semantic search
- **RAG Chain**: Implements RetrievalQA chain with custom prompts
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
pnpm run test:unit
```

### Integration Tests

Run end-to-end infrastructure tests (deploys actual AWS resources):

```bash
# Prerequisites: AWS credentials configured
pnpm run test:integration

# Run end-to-end tests
pnpm run test:e2e

# Run all tests (unit + integration + e2e)
pnpm run test:all
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

Lambda functions are containerized Python applications located in the `lambda/` directory:
- `ingestion/`: Document processing and embedding generation using LangChain and AWS Bedrock
- `query/`: Semantic search and response generation using LangChain RetrievalQA chains

Each function includes:
- `main.py`: Lambda handler code
- `Dockerfile`: Multi-stage container build configuration  
- `requirements.txt`: Python dependencies including LangChain and AWS SDK

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
2. Add or update tests in `test/unit/`, `test/integration/`, or `test/e2e/`
3. Run tests: `pnpm test`
4. Run linting: `pnpm run lint`
5. Update documentation as needed

## License

MIT License - see LICENSE file for details.