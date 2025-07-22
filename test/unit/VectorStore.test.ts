import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { VectorStore } from "../../components/VectorStore.ts";

// Set up runtime mocks for Pulumi resources
pulumi.runtime.setMocks({
    newResource: function (args: pulumi.runtime.MockResourceArgs) {
        const mockState = {
            ...args.inputs,
        };
        
        // Add mock endpoints for specific resource types
        if (args.type === "aws:opensearch/serverlessCollection:ServerlessCollection") {
            mockState.collectionEndpoint = `https://${args.inputs.name}.us-west-2.aoss.amazonaws.com`;
        } else if (args.type === "pinecone:index:PineconeIndex") {
            mockState.host = `https://${args.inputs.name}.svc.us-east-1.pinecone.io`;
        }
        
        return {
            id: args.inputs.name + "_id",
            state: mockState
        };
    },
    call: function (args: pulumi.runtime.MockCallArgs) {
        if (args.token === "aws:getCallerIdentity:getCallerIdentity") {
            return { accountId: "123456789012" };
        }
        return args.inputs;
    },
});

describe("VectorStore Component", () => {
    describe("OpenSearch Configuration", () => {
        it("should create vector store with opensearch type", function(done) {
            const vectorStore = new VectorStore("test-store", { type: "opensearch" });
            
            // Test that the config was created with correct type
            try {
                expect(vectorStore.config.type).to.equal("opensearch");
                done();
            } catch (e) {
                done(e);
            }
        });

        it("should create vector store with correct endpoint for opensearch", function(done) {
            const vectorStore = new VectorStore("test-store", { type: "opensearch" });
            
            // Test that the endpoint was created
            vectorStore.endpoint.apply(endpoint => {
                try {
                    expect(endpoint).to.include('aoss.amazonaws.com');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("Pinecone Configuration", () => {
        it("should create vector store with pinecone type", function(done) {
            const vectorStore = new VectorStore("test-store", { 
                type: "pinecone", 
                dimension: 1024,
                metric: "cosine"
            });
            
            // Test that the config was created with correct type
            try {
                expect(vectorStore.config.type).to.equal("pinecone");
                done();
            } catch (e) {
                done(e);
            }
        });

        it("should create vector store with correct endpoint for pinecone", function(done) {
            const vectorStore = new VectorStore("test-store", { 
                type: "pinecone", 
                dimension: 1024,
                metric: "cosine"
            });
            
            // Test that the endpoint was created
            vectorStore.endpoint.apply(endpoint => {
                try {
                    expect(endpoint).to.include('pinecone.io');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("Index Name Generation", () => {
        it("should generate index name for opensearch", function(done) {
            const vectorStore = new VectorStore("test-store", { type: "opensearch" });
            
            // Test that the index name was generated
            vectorStore.config.indexName.apply(indexName => {
                try {
                    expect(indexName).to.be.a('string');
                    expect(indexName).to.include('rag-');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("should generate index name for pinecone", function(done) {
            const vectorStore = new VectorStore("test-store", { 
                type: "pinecone", 
                dimension: 1024,
                metric: "cosine"
            });
            
            // Test that the index name was generated
            vectorStore.config.indexName.apply(indexName => {
                try {
                    expect(indexName).to.be.a('string');
                    expect(indexName).to.include('rag-pipeline-');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});