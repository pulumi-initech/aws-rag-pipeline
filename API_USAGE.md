# RAG Pipeline API Usage

## Overview

This RAG (Retrieval-Augmented Generation) pipeline processes documents and enables semantic search with AI-powered responses using AWS services.

## Architecture

- **Document Ingestion**: S3 bucket triggers Lambda function to process uploaded documents
- **Vector Storage**: OpenSearch Serverless for storing document embeddings
- **Query Processing**: API Gateway + Lambda for handling search queries
- **AI Integration**: Amazon Bedrock for embeddings and text generation

## Usage

### 1. Document Upload

Upload documents to the S3 input bucket:

```bash
aws s3 cp sample-document.txt s3://INPUT_BUCKET_NAME/
```

The ingestion Lambda will automatically:
- Process the document
- Split into chunks
- Generate embeddings using Amazon Titan
- Store in OpenSearch

### 2. Query API

Send POST requests to the query endpoint:

```bash
curl -X POST "QUERY_API_ENDPOINT/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is AWS Lambda?"}'
```

**Response format:**
```json
{
  "query": "What is AWS Lambda?",
  "response": "AWS Lambda is a serverless compute service...",
  "sources": [
    {
      "source": "sample-document.txt",
      "chunk_id": 0,
      "score": 0.8
    }
  ]
}
```

## Configuration

Set vector store type in `Pulumi.dev.yaml`:

```yaml
config:
  aws-rag-pipeline:vectorStore: "opensearch"  # or "pinecone"
```

## Deployment

```bash
pulumi up
```

After deployment, use the output values:
- `queryApiEndpoint`: API Gateway endpoint for queries
- `inputBucketName`: S3 bucket name for document uploads