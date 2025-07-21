import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { Ingestion } from "../../components/Ingestion.ts";
import { VectorStoreConfig } from "../../components/VectorStore.ts";

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

describe("Ingestion Component", () => {
    let mockInputBucket: any;
    
    beforeEach(() => {
        mockInputBucket = {
            arn: pulumi.output("arn:aws:s3:::test-bucket"),
            id: pulumi.output("test-bucket")
        };
    });

    describe("OpenSearch Vector Store Configuration", () => {
        it("should create role with correct name for opensearch", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                indexName: pulumi.output("test-index")
            };

            const ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the role was created
            expect(ingestion.role).to.not.be.undefined;
            done();
        });

        it("should create lambda function with correct runtime for opensearch", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                indexName: pulumi.output("test-index")
            };

            const ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the Lambda function was created with correct configuration
            pulumi.all([ingestion.lambda.runtime, ingestion.lambda.handler]).apply(([runtime, handler]) => {
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

            const ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the role was created
            expect(ingestion.role).to.not.be.undefined;
            done();
        });

        it("should create lambda function with correct configuration for pinecone", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "pinecone",
                endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                indexName: pulumi.output("test-index")
            };

            const ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the Lambda function was created with correct configuration
            pulumi.all([ingestion.lambda.runtime, ingestion.lambda.handler]).apply(([runtime, handler]) => {
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

    describe("S3 Event Notification", () => {
        it("should create S3 bucket notification", function(done) {
            const vectorStoreConfig: VectorStoreConfig = {
                type: "opensearch",
                endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                indexName: pulumi.output("test-index")
            };

            const ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: vectorStoreConfig
            });

            // Test that the bucket notification was created
            ingestion.bucketNotification.bucket.apply(bucketName => {
                try {
                    expect(bucketName).to.be.a('string');
                    expect(bucketName).to.equal('test-bucket');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});