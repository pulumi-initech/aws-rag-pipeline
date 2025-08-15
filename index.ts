import * as pulumi from "@pulumi/pulumi";
import { SecureBucket, VectorStore, Ingestion, Query, ServerlessAccessPolicy } from "./components/index.ts";

// Read configuration
const config = new pulumi.Config();
const vectorStoreType = config.get("vectorStore") || "opensearch";
const pineconeConfig = vectorStoreType === "pinecone" ? new pulumi.Config("pinecone") : undefined;

// Create secure input bucket
const inputBucket = new SecureBucket("input");

// Create vector store
const vectorStore = new VectorStore("vector-store", {
    type: vectorStoreType as "opensearch" | "pinecone",
    collectionName: config.require("collectionName"),
});

// Create ingestion pipeline
const ingestion = new Ingestion("ingestion", {
    inputBucket: inputBucket.bucket,
    vectorStoreConfig: vectorStore.config,
});

// Create query service
const query = new Query("query", {
    vectorStoreConfig: vectorStore.config,
    pineconeConfig: vectorStoreType === "pinecone" && pineconeConfig ? {
        APIKey: pineconeConfig.get("APIKey") || "",
        Environment: pineconeConfig.get("Environment") || "us-east-1-aws",
    } : undefined,
});

// Create ServerlessAccessPolicy if using OpenSearch
if (vectorStoreType === "opensearch") {
    new ServerlessAccessPolicy("opensearch-access", {
        collectionName: vectorStore.config.collectionName || "rag-collection",
        lambdaRoleArns: [ingestion.role.arn, query.role.arn]
    });
}

// Export outputs
export const inputBucketName = inputBucket.bucketName;
export const ingestionLambdaArn = ingestion.lambdaArn;
export const queryLambdaArn = query.lambdaArn;
export const queryApiName = query.apiName;
export const queryApiEndpoint = query.apiEndpoint;
export const indexName = vectorStore.config.indexName;