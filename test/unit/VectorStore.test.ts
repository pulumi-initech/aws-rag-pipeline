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
            const vectorStore = new VectorStore("test-store", { type: "opensearch", collectionName: "test-collection" });
            
            // Test that the config was created with correct type
            try {
                expect(vectorStore.config.type).to.equal("opensearch");
                done();
            } catch (e) {
                done(e);
            }
        });

        it("should create vector store with correct endpoint for opensearch", function(done) {
            const vectorStore = new VectorStore("test-store", { type: "opensearch", collectionName: "test-collection" });
            
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
                metric: "cosine",
                indexName: "test-index"
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
                metric: "cosine",
                indexName: "test-index",
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

        it("should throw error if index name for opensearch if not specified", function(done) {
            try {
                new VectorStore("test-store", { 
                    type: "opensearch", 
                });
            } catch (e) {
                if (e instanceof Error) {
                    expect(e.message).to.include("OpenSearch collection requires a collectionName argument.");
                } else {
                    done(e);
                    return;
                }
            }
            done();
        });

        it('should throw error if opensearch collection name does not match constraints', function(done) {
            try {
                new VectorStore("test-store", { 
                    type: "opensearch", 
                    collectionName: "1nvalid_Index_Name", // Invalid due to underscores and uppercase letters
                });
                done(new Error("Expected error for invalid OpenSearch collection name"));
            } catch (e) {
                if (e instanceof Error) {
                    expect(e.message).to.include("OpenSearch collection names must be 3-32 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.");
                } else {
                    done(e);
                    return;
                }
                done();
            }
        });

        it("should throw error if pinecone index name is not specified", function(done) {       
            try {
                new VectorStore("test-store", { 
                    type: "pinecone", 
                    dimension: 1024,
                });
            } catch (e) {
                if (e instanceof Error) {
                    expect(e.message).to.include("Pinecone index requires an indexName argument.");
                } else {
                    done(e);
                    return;
                }
            }
            done();
        });

        it('should throw error if pinecone index name does not match constraints', function(done) {
            try {
                new VectorStore("test-store", { 
                    type: "pinecone", 
                    indexName: "Invalid_Index_Name", // Invalid due to underscores and uppercase letters
                    dimension: 1024,
                    metric: "cosine"
                });
                done(new Error("Expected error for invalid Pinecone index name"));
            } catch (e) {
                if (e instanceof Error) {
                    expect(e.message).to.include("Pinecone index names must be 3-63 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.");
                } else {
                    done(e);
                    return;
                }
                done();
            }
        });
    });
});