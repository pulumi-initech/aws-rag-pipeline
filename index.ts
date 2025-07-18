import * as pulumi from "@pulumi/pulumi";
import { SecureBucket, VectorStore, Ingestion, Query } from "./components";

// Read configuration
const config = new pulumi.Config();
const vectorStoreType = config.get("vectorStore") || "opensearch";

// Create secure input bucket
const inputBucket = new SecureBucket("input");

// Create vector store
const vectorStore = new VectorStore("vector-store", {
    type: vectorStoreType as "opensearch" | "pinecone"
});

// Create ingestion pipeline
const ingestion = new Ingestion("ingestion", {
    inputBucket: inputBucket.bucket,
    vectorStoreConfig: vectorStore.config,
});

// Create query service
const query = new Query("query", {
    vectorStoreConfig: vectorStore.config,
});

// Export outputs
export const inputBucketName = inputBucket.bucketName;
export const queryApiEndpoint = query.apiEndpoint;