import json
import logging
import os
import boto3
from typing import List, Dict, Any

# LangChain imports
from langchain_community.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
from langchain_community.vectorstores import Pinecone as PineconeVectorStore
from langchain_community.chat_models import BedrockChat
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
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

def create_vector_store():
    """Create vector store instance for querying"""
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

def create_llm():
    """Create Bedrock LLM instance"""
    llm = BedrockChat(
        client=bedrock_runtime,
        model_id="anthropic.claude-3-haiku-20240307-v1:0",
        model_kwargs={
            "max_tokens": 2000,
            "temperature": 0.1,
            "top_p": 0.9
        }
    )
    return llm

def create_qa_chain():
    """Create RetrievalQA chain"""
    vector_store = create_vector_store()
    llm = create_llm()
    
    # Create custom prompt template
    prompt_template = """
    Human: Use the following context to answer the question. If you cannot answer based on the context provided, say so clearly.

    Context:
    {context}

    Question: {question}

    Please provide a clear, concise answer based only on the information provided in the context above.

    Assistant:"""
    
    PROMPT = PromptTemplate(
        template=prompt_template,
        input_variables=["context", "question"]
    )
    
    # Create retrieval QA chain
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 5},
        ),
        chain_type_kwargs={"prompt": PROMPT},
        return_source_documents=True
    )
    
    return qa_chain

def format_response(result: Dict[str, Any]) -> Dict[str, Any]:
    """Format the response with sources"""
    response = {
        "answer": result["result"],
        "sources": []
    }
    
    # Extract source information
    for doc in result.get("source_documents", []):
        source_info = {
            "source": doc.metadata.get("source", "Unknown"),
            "chunk_id": doc.metadata.get("chunk_id", 0),
            "content_preview": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
        }
        response["sources"].append(source_info)
    
    return response

def search_similar_documents(query: str, k: int = 5) -> List[Dict[str, Any]]:
    """Search for similar documents and return raw results"""
    vector_store = create_vector_store()
    
    # Perform similarity search
    docs = vector_store.similarity_search_with_score(query, k=k)
    
    results = []
    for doc, score in docs:
        result = {
            "content": doc.page_content,
            "score": float(score),
            "metadata": doc.metadata
        }
        results.append(result)
        
    logger.info(f"Found {len(results)} similar documents for query: {query} using {VECTOR_STORE_TYPE} vector store")
    return results

def lambda_handler(event, context):
    """Main Lambda handler for document querying"""
    logger.info(f"Received event: {json.dumps(event)}")
    
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        query = body.get('query')
        if not query:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': 'Query parameter is required'
                })
            }
        
        logger.info(f"Processing query: {query}")
        
        # Check if this is a simple similarity search request
        search_only = body.get('search_only', False)
        
        if search_only:
            # Return raw search results without LLM processing
            similar_docs = search_similar_documents(query)
            
            response_data = {
                'query': query,
                'documents': similar_docs,
                'type': 'similarity_search'
            }
        else:
            # Use RetrievalQA chain for full RAG pipeline
            qa_chain = create_qa_chain()
            result = qa_chain({"query": query})
            
            # Format response
            response_data = {
                'query': query,
                'response': result["result"],
                'sources': []
            }
            
            # Add source information
            for doc in result.get("source_documents", []):
                source_info = {
                    "source": doc.metadata.get("source", "Unknown"),
                    "chunk_id": doc.metadata.get("chunk_id", 0),
                    "score": getattr(doc, '_score', 0),
                    "content_preview": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
                }
                response_data["sources"].append(source_info)
        
        logger.info(f"Successfully processed query: {query} using {VECTOR_STORE_TYPE} vector store")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"Error processing query: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'Internal server error'
            })
        }