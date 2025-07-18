import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { Query } from "../../components/Query";
import { VectorStoreConfig } from "../../components/VectorStore";

// Set up runtime mocks for Pulumi resources
pulumi.runtime.setMocks({
    newResource: function (args: pulumi.runtime.MockResourceArgs) {
        return {
            id: args.inputs.name + "_id",
            state: {
                ...args.inputs,
            }
        };
    },
    call: function (args: pulumi.runtime.MockCallArgs) {
        return args.inputs;
    },
});

describe("Query Component", () => {
    describe("OpenSearch Vector Store Configuration", () => {
        it("should create role with correct name for opensearch", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                indexName: pulumi.output("test-index")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the role was created with correct name
            query.role.name.apply(roleName => {
                try {
                    expect(roleName).to.equal("query-lambda-role");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("should create lambda function with correct runtime for opensearch", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                indexName: pulumi.output("test-index")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the Lambda function was created with correct configuration
            pulumi.all([query.lambda.runtime, query.lambda.handler]).apply(([runtime, handler]) => {
                try {
                    expect(runtime).to.equal("nodejs18.x");
                    expect(handler).to.equal("index.handler");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("Pinecone Vector Store Configuration", () => {
        it("should create role with correct name for pinecone", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "pinecone",
                endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                indexName: pulumi.output("test-index")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the role was created with correct name
            query.role.name.apply(roleName => {
                try {
                    expect(roleName).to.equal("query-lambda-role");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("should create lambda function with correct configuration for pinecone", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "pinecone",
                endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                indexName: pulumi.output("test-index")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the Lambda function was created with correct configuration
            pulumi.all([query.lambda.runtime, query.lambda.handler]).apply(([runtime, handler]) => {
                try {
                    expect(runtime).to.equal("nodejs18.x");
                    expect(handler).to.equal("index.handler");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    describe("API Gateway Configuration", () => {
        it("should create API Gateway with correct configuration", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test.aoss.amazonaws.com"),
                indexName: pulumi.output("test")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the API Gateway was created
            query.api.protocolType.apply(protocolType => {
                try {
                    expect(protocolType).to.equal("HTTP");
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });

        it("should create API endpoint", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test.aoss.amazonaws.com"),
                indexName: pulumi.output("test")
            };

            const query = new Query("test-query", {
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the API endpoint was created
            query.apiEndpoint.apply(endpoint => {
                try {
                    expect(endpoint).to.be.a('string');
                    expect(endpoint).to.include('prod');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});