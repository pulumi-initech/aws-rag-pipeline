const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

// Vector store configuration
const vectorStoreType = process.env.VECTOR_STORE_TYPE || 'opensearch';
let vectorClient;

if (vectorStoreType === 'opensearch') {
    const { Client } = require('@opensearch-project/opensearch');
    const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
    const { defaultProvider } = require('@aws-sdk/credential-provider-node');
    
    vectorClient = new Client({
        ...AwsSigv4Signer({
            credentials: defaultProvider(),
            region: process.env.AWS_REGION,
            service: 'aoss',
        }),
        node: process.env.VECTOR_STORE_ENDPOINT,
    });
} else if (vectorStoreType === 'pinecone') {
    const { Pinecone } = require('@pinecone-database/pinecone');
    
    vectorClient = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    });
}

async function generateEmbedding(text) {
    const payload = {
        inputText: text,
    };
    
    const command = new InvokeModelCommand({
        modelId: 'amazon.titan-embed-text-v2:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding;
}

async function searchSimilarDocuments(queryEmbedding, topK = 5) {
    if (vectorStoreType === 'opensearch') {
        return await searchOpenSearch(queryEmbedding, topK);
    } else if (vectorStoreType === 'pinecone') {
        return await searchPinecone(queryEmbedding, topK);
    }
    throw new Error(`Unsupported vector store type: ${vectorStoreType}`);
}

async function searchOpenSearch(queryEmbedding, topK = 5) {
    const indexName = process.env.INDEX_NAME || 'rag-documents-v2';
    const searchQuery = {
        size: topK,
        query: {
            knn: {
                embedding: {
                    vector: queryEmbedding,
                    k: topK
                }
            }
        },
        _source: ['content', 'source', 'chunk_id']
    };
    
    const response = await vectorClient.search({
        index: indexName,
        body: searchQuery
    });
    
    return response.body.hits.hits.map(hit => ({
        content: hit._source.content,
        source: hit._source.source,
        chunk_id: hit._source.chunk_id,
        score: hit._score
    }));
}

async function searchPinecone(queryEmbedding, topK = 5) {
    const indexName = process.env.INDEX_NAME || 'rag-index';
    const index = vectorClient.index(indexName);
    
    const response = await index.query({
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: true
    });
    
    return response.matches.map(match => ({
        content: match.metadata.content,
        source: match.metadata.source,
        chunk_id: match.metadata.chunk_id,
        score: match.score
    }));
}

async function generateResponse(query, context) {
    const prompt = `Human: Use the following context to answer the question. If you cannot answer based on the context, say so.

Context:
${context.map(doc => `- ${doc.content}`).join('\n')}

Question: ${query}`;

    const payload = {
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 2000,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        })
    };
    
    const command = new InvokeModelCommand(payload);
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return responseBody.content[0].text;
}

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        const body = JSON.parse(event.body);
        const query = body.query;
        
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Query is required" })
            };
        }
        
        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);
        
        // Search for similar documents
        const similarDocs = await searchSimilarDocuments(queryEmbedding);
        
        if (!similarDocs || similarDocs.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "No relevant documents found" })
            };
        }
        
        // Generate response using Claude 3 Haiku
        const response = await generateResponse(query, similarDocs);
        
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                query: query,
                response: response,
                sources: similarDocs.map(doc => ({
                    source: doc.source,
                    chunk_id: doc.chunk_id,
                    score: doc.score
                }))
            })
        };
        
    } catch (error) {
        console.error("Error processing query:", error);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Internal server error" })
        };
    }
};
