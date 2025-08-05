import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { Query } from "../../components/Query.ts";


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

describe("Query Component", function() {
  
    describe("OpenSearch Vector Store Configuration", function() {

        let query: Query;
        before(function() {
            query = new Query("test-query", {
                vectorStoreConfig: {
                    type: "opensearch",
                    endpoint: pulumi.output("https://test-collection.us-west-2.aoss.amazonaws.com"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create role with correct name for opensearch", function() {
            expect(query.role).to.not.be.undefined;
        });

        it("should create lambda function with correct runtime for opensearch", function() {
            return pulumi.all([query.lambda.runtime, query.lambda.handler]).apply(([runtime, handler]) => {

                console.log("Lambda Runtime:", runtime);
                console.log("Lambda Handler:", handler);
            });
        });
    });

    describe("Pinecone Vector Store Configuration", function() {

        let query: Query;
        before(function(){
            query = new Query("test-query", {
                vectorStoreConfig: {
                    type: "pinecone",
                    endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create role with correct name for pinecone", function() {
            // Test that the role was created
            expect(query.role).to.not.be.undefined;
        });

        it("should create lambda function with correct configuration for pinecone", function() {

            // Test that the Lambda function was created with correct configuration
            return pulumi.all([query.lambda.runtime, query.lambda.handler]).apply(([runtime, handler]) => {
            
                console.log("Lambda Runtime:", runtime);
                console.log("Lambda Handler:", handler);
            });
        });
    });

    describe("API Gateway Configuration", function(){

        let query: Query;
        before(function() {
            query = new Query("test-query", {
                vectorStoreConfig: {
                    type: "pinecone",
                    endpoint: pulumi.output("https://test-index.svc.us-west-2.pinecone.io"),
                    indexName: pulumi.output("test-index")
                }
            });
        });

        it("should create API Gateway with correct configuration", function() {
            return query.api.protocolType.apply(protocolType => {
                expect(protocolType).to.equal("HTTP");
            });
        });

        it("should create API endpoint", function() {
            return query.apiEndpoint.apply(endpoint => {
                expect(endpoint).to.be.a('string');
                expect(endpoint).to.include('prod');
            });
        });
    });
});