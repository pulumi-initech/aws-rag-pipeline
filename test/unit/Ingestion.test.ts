import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { Ingestion } from "../../components/Ingestion.ts";


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

    before(() => {
        mockInputBucket = {
            arn: pulumi.output("arn:aws:s3:::test-bucket"),
            id: pulumi.output("test-bucket")
        };
    });

    describe("OpenSearch Vector Store Configuration", () => {

        let ingestion: Ingestion;
        before(() => {
            ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: {
                    type: "opensearch",
                    endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                    indexName: pulumi.output("test-index")
                }
            });
        });
        
        it("should create role with correct name for opensearch", () => {
            // Test that the role was created
            expect(ingestion.role).to.not.be.undefined;
        });

        it("should create lambda function with correct runtime for opensearch", () => {

            return pulumi.all([ingestion.lambda.runtime, ingestion.lambda.handler, ingestion.lambda.environment]).apply(([runtime, handler, environment]) => {
                expect(runtime).to.equal("python3.11");
                expect(handler).to.equal("main.handler");

                expect(environment).to.deep.equal({
                    variables: {
                        VECTOR_STORE_ENDPOINT: "https://test-collection.us-west-2.aoss.amazonaws.com",
                        VECTOR_STORE_TYPE: "opensearch",
                        INDEX_NAME: "test-index",
                        PINECONE_API_KEY: ""
                    }
                });
            });
        });
    });

    describe("Pinecone Vector Store Configuration", () => {

        let ingestion: Ingestion;
        before(() => {
            ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: {
                    type: "pinecone",
                    endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create role with correct name for pinecone",  () => {
            // Test that the role was created
            expect(ingestion.role).to.not.be.undefined;
        })

        it("should create lambda function with correct configuration for pinecone", () => {
            // Test that the Lambda function was created with correct configuration
            return pulumi.all([ingestion.lambda.runtime, ingestion.lambda.handler, ingestion.lambda.environment]).apply(([runtime, handler, environment]) => {
                
                // Check environment variables structure
                expect(environment).to.deep.equal({
                    variables: {
                        VECTOR_STORE_ENDPOINT: "https://test-index.svc.us-west-2.pinecone.io",
                        VECTOR_STORE_TYPE: "pinecone",
                        INDEX_NAME: "test-index",
                        PINECONE_API_KEY: "mock-pinecone-api-key"
                    }
                });
            });
        });
    });


    describe("Lambda Invoke Permission", function() {
        let ingestion: Ingestion;   

        before(function() {
            ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: {
                    type: "opensearch",
                    endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create invoke permission for S3 with correct properties", function () {
            expect(ingestion.invokePermission).to.not.be.undefined;
            return  pulumi.all([ingestion.invokePermission.action, ingestion.invokePermission.function, ingestion.invokePermission.principal, ingestion.invokePermission.sourceArn]).apply(([action, fn, principal, sourceArn]) => {
                expect(action).to.equal("lambda:InvokeFunction");
                expect(fn).to.equal(ingestion.lambda.name);
                expect(principal).to.equal("s3.amazonaws.com");
                expect(sourceArn).to.equal(mockInputBucket.arn);
            });
        });
    });


    describe("S3 Event Notification", () => {
            
        let ingestion: Ingestion;

        before(() => {
            ingestion = new Ingestion("test-ingestion", {
                inputBucket: mockInputBucket,
                vectorStoreConfig: {
                    type: "opensearch",
                    endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create bucket notification", function () {
            expect(ingestion.bucketNotification).to.not.be.undefined;
        });

        it("should have correct bucket name", function () {
            // Test that the bucket notification was created
            return ingestion.bucketNotification.bucket.apply(bucketName => {
                expect(bucketName).to.not.be.undefined;
                expect(bucketName).to.equal(mockInputBucket.name);
            });
        });

        it("should have correct lambda function in notification", function () {
            // Test that the bucket notification was created with the correct Lambda function
            return ingestion.bucketNotification.lambdaFunctions.apply(lambdaFunctions => {
                expect(lambdaFunctions).to.have.lengthOf(1);

                const lambdaFunctionConfig = lambdaFunctions![0];
                expect(lambdaFunctionConfig.lambdaFunctionArn).to.equal(ingestion.lambda.arn);
                expect(lambdaFunctionConfig.events).to.include("s3:ObjectCreated:*");
            });
        });
    });
});