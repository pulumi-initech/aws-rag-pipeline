import json
import logging
import os
import boto3
from typing import List, Dict, Any
from urllib.parse import unquote_plus

# LangChain imports
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_aws import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
from langchain_community.vectorstores import Pinecone as PineconeVectorStore
from langchain.docstore.document import Document
import pinecone

# AWS SDK
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
import boto3

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
OPENSEARCH_ENDPOINT = os.environ.get("VECTOR_STORE_ENDPOINT")
INDEX_NAME = os.environ.get("INDEX_NAME", "rag-documents-v2")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
VECTOR_STORE_TYPE = os.environ.get("VECTOR_STORE_TYPE", "opensearch")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY")
PINECONE_ENVIRONMENT = os.environ.get("PINECONE_ENVIRONMENT", "us-east-1-aws")

# Initialize AWS clients
bedrock_runtime = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3_client = boto3.client("s3", region_name=AWS_REGION)

def create_opensearch_client():
    """Create OpenSearch client with AWS authentication"""
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, AWS_REGION, 'aoss')
    
    client = OpenSearch(
        hosts=[{'host': OPENSEARCH_ENDPOINT.replace('https://', ''), 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        pool_maxsize=20,
    )
    return client

def create_vector_store():
    """Create vector store instance"""
    # Initialize embeddings
    embeddings = BedrockEmbeddings(
        client=bedrock_runtime,
        model_id="amazon.titan-embed-text-v2:0"
    )
    
    if VECTOR_STORE_TYPE == "opensearch":
        
        # Create AWS auth for vector store
        credentials = boto3.Session().get_credentials()
        auth = AWSV4SignerAuth(credentials, AWS_REGION, 'aoss')
        
        # Create vector store
        vector_store = OpenSearchVectorSearch(
            index_name=INDEX_NAME,
            embedding_function=embeddings,
            opensearch_url=OPENSEARCH_ENDPOINT,
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            service='aoss'
        )
        return vector_store
    
    elif VECTOR_STORE_TYPE == "pinecone":
        if not PINECONE_API_KEY:
            raise ValueError("PINECONE_API_KEY environment variable is required for Pinecone")
        
        # Initialize Pinecone
        pinecone.init(
            api_key=PINECONE_API_KEY,
            environment=PINECONE_ENVIRONMENT
        )
        
        # Create vector store
        vector_store = PineconeVectorStore.from_existing_index(
            index_name=INDEX_NAME,
            embedding=embeddings
        )
        return vector_store
    
    else:
        raise ValueError(f"Unsupported vector store type: {VECTOR_STORE_TYPE}")

def create_index_if_not_exists():
    """Create index with proper mappings if it doesn't exist"""
    if VECTOR_STORE_TYPE == "opensearch":
        client = create_opensearch_client()
        
        try:
            # Check if index exists
            if not client.indices.exists(index=INDEX_NAME):
                logger.info(f"Creating OpenSearch index: {INDEX_NAME}")
                vector_field = "vector_field"
                dim = 1024  # Dimension for Titan embeddings
                index_body = {
                    "settings": {
                        "index": {
                            "knn": True,
                            "knn.algo_param.ef_search": 100
                        }
                    },
                    "mappings": {
                        "properties": {
                            vector_field: {
                                "type": "knn_vector",
                                "dimension": dim,
                                "method": {
                                    "name": "hnsw",
                                    "space_type": "cosinesimil",
                                    "engine": "nmslib"
                                }
                            },
                            "text": {"type": "text"},
                            "metadata": {
                                "properties": {
                                    "source": {"type": "keyword"},
                                    "chunk_id": {"type": "integer"},
                                    "page": {"type": "integer"}
                                }
                            }
                        }
                    }
                }
                
                client.indices.create(index=INDEX_NAME, body=index_body)
                logger.info(f"OpenSearch index {INDEX_NAME} created successfully")
            else:
                logger.info(f"OpenSearch index {INDEX_NAME} already exists")
                
        except Exception as e:
            logger.error(f"Error creating OpenSearch index: {str(e)}")
            if "already exists" not in str(e).lower():
                raise
    
    elif VECTOR_STORE_TYPE == "pinecone":
        if not PINECONE_API_KEY:
            raise ValueError("PINECONE_API_KEY environment variable is required for Pinecone")
        
        # Initialize Pinecone
        pinecone.init(
            api_key=PINECONE_API_KEY,
            environment=PINECONE_ENVIRONMENT
        )
        
        try:
            # Check if index exists
            if INDEX_NAME not in pinecone.list_indexes():
                logger.info(f"Creating Pinecone index: {INDEX_NAME}")
                
                # Create index with 1024 dimensions for Titan embeddings
                pinecone.create_index(
                    name=INDEX_NAME,
                    dimension=1024,
                    metric="cosine"
                )
                logger.info(f"Pinecone index {INDEX_NAME} created successfully")
            else:
                logger.info(f"Pinecone index {INDEX_NAME} already exists")
                
        except Exception as e:
            logger.error(f"Error creating Pinecone index: {str(e)}")
            if "already exists" not in str(e).lower():
                raise

def load_document_from_s3(bucket: str, key: str) -> List[Document]:
    """Load document from S3 using LangChain"""
    try:
        # Get object from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        
        # Create LangChain document
        document = Document(
            page_content=content,
            metadata={
                "source": f"s3://{bucket}/{key}",
                "bucket": bucket,
                "key": key,
                "content_type": response.get('ContentType', 'text/plain')
            }
        )
        
        return [document]
        
    except Exception as e:
        logger.error(f"Error loading document from S3: {str(e)}")
        raise

def chunk_documents(documents: List[Document]) -> List[Document]:
    """Split documents into chunks using LangChain text splitter"""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    
    chunks = text_splitter.split_documents(documents)
    
    # Add chunk metadata
    for i, chunk in enumerate(chunks):
        chunk.metadata.update({
            "chunk_id": i,
            "chunk_size": len(chunk.page_content)
        })
    
    logger.info(f"Created {len(chunks)} chunks from {len(documents)} documents")
    return chunks

def store_chunks_in_vector_store(chunks: List[Document]):
    """Store document chunks in vector store with embeddings"""
    vector_store = create_vector_store()
    
    # Extract texts and metadata
    texts = [chunk.page_content for chunk in chunks]
    metadatas = [chunk.metadata for chunk in chunks]
    
    # Add to vector store (embeddings are generated automatically)
    vector_store.add_texts(texts=texts, metadatas=metadatas)
    
    logger.info(f"Successfully stored {len(chunks)} chunks with embeddings in {VECTOR_STORE_TYPE} vector store")

def lambda_handler(event, context):
    """Main Lambda handler for document ingestion"""
    logger.info(f"Received event: {json.dumps(event)}")
    
    try:
        # Create index if it doesn't exist
        create_index_if_not_exists()
        
        # Process S3 events
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3':
                # Extract S3 information
                bucket = record['s3']['bucket']['name']
                key = unquote_plus(record['s3']['object']['key'])
                
                logger.info(f"Processing document: s3://{bucket}/{key}")
                
                # Load document from S3
                documents = load_document_from_s3(bucket, key)
                
                # Chunk documents
                chunks = chunk_documents(documents)
                
                # Store in vector store
                store_chunks_in_vector_store(chunks)
                
                logger.info(f"Successfully processed document: {key}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Documents processed successfully',
                'processed_records': len(event.get('Records', []))
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing documents: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'message': 'Failed to process documents'
            })
        }