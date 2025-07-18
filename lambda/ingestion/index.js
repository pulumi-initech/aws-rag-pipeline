const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');

const s3Client = new S3Client({});
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

async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

function chunkText(text, maxChunkSize = 500) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += (currentChunk.length > 0 ? '. ' : '') + sentence;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

async function storeInOpenSearch(chunks, source) {
    const indexName = process.env.INDEX_NAME || 'rag-documents-v2';
    
    try {
        await vectorClient.indices.create({
            index: indexName,
            body: {
                settings: {
                    index: {
                        "knn": true,
                        "knn.algo_param.ef_search": 100
                    }
                },
                mappings: {
                    properties: {
                        content: { type: 'text' },
                        embedding: { 
                            type: 'knn_vector',
                            dimension: 1024,
                            method: {
                                name: 'hnsw',
                                space_type: 'cosinesimil',
                                engine: 'nmslib'
                            }
                        },
                        source: { type: 'keyword' },
                        chunk_id: { type: 'integer' }
                    }
                }
            }
        });
    } catch (error) {
        if (!error.message.includes('already exists')) {
            throw error;
        }
    }
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await generateEmbedding(chunk);
        
        // Store in OpenSearch
        await vectorClient.index({
            index: indexName,
            body: {
                content: chunk,
                embedding: embedding,
                source: source,
                chunk_id: i
            }
        });
    }
}

async function storeInPinecone(chunks, source) {
    const indexName = process.env.INDEX_NAME || 'rag-index';
    const index = vectorClient.index(indexName);
    
    // Process each chunk
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await generateEmbedding(chunk);
        
        vectors.push({
            id: `${source}-${i}`,
            values: embedding,
            metadata: {
                content: chunk,
                source: source,
                chunk_id: i
            }
        });
    }
    
    // Upsert vectors to Pinecone
    await index.upsert(vectors);
}

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        for (const record of event.Records) {
            const bucket = record.s3.bucket.name;
            const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
            
            console.log(`Processing file: ${key} from bucket: ${bucket}`);
            
            // Get the object from S3
            const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
            const s3Response = await s3Client.send(getObjectCommand);
            
            // Convert stream to string
            const content = await streamToString(s3Response.Body);
            
            // Create chunks
            const chunks = chunkText(content);
            
            if (vectorStoreType === 'opensearch') {
                await storeInOpenSearch(chunks, key);
            } else if (vectorStoreType === 'pinecone') {
                await storeInPinecone(chunks, key);
            }
            
            console.log(`Successfully processed ${chunks.length} chunks from ${key}`);
            
            console.log(`Successfully processed ${chunks.length} chunks from ${key}`);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify('Successfully processed documents')
        };
        
    } catch (error) {
        console.error('Error processing documents:', error);
        throw error;
    }
};