import "mocha";
import { expect } from "chai";
import { select } from "./automation.ts";
import { AWSHelper, TestUtils } from "../helpers/index.ts";
import { ApiGatewayV2Client, GetApiCommand } from "@aws-sdk/client-apigatewayv2";

describe("RAG Pipeline Integration Tests", function() {
    // Set longer timeout for infrastructure operations
    this.timeout(600000); // 10 minutes

    let outputs: { [key: string]: any };
    let awsHelper: AWSHelper;
    let apiGateway: ApiGatewayV2Client;

    this.beforeAll(async function() {
        outputs = await select();
        
        // Initialize AWS helper and specific clients
        awsHelper = new AWSHelper({ region: process.env.AWS_REGION });
        apiGateway = new ApiGatewayV2Client({ region: process.env.AWS_REGION });

    });

    this.afterAll(async function() {
        await awsHelper.cleanup();
    });

    describe("Infrastructure Deployment", () => {
        it("should deploy all required resources", async function () {

            this.skip();
            const validation = TestUtils.validatePipelineOutputs(outputs, "opensearch");
            
            expect(validation.hasInputBucketName).to.be.true;
            expect(validation.hasApiEndpoint).to.be.true;
            expect(validation.hasVectorStoreEndpoint).to.be.true;
            expect(validation.hasVectorStoreType).to.be.true;
        });

        it("should configure OpenSearch as vector store", async function () {

            this.skip();
            const validation = TestUtils.validatePipelineOutputs(outputs, "opensearch");
            expect(validation.correctVectorStoreType).to.be.true;
            expect(validation.validEndpointFormat).to.be.true;
        });

        it("should create accessible S3 bucket", async function () {
            this.skip();

            const bucketName = outputs.inputBucketName.value;
            expect(bucketName).to.be.a("string");
            
            // Verify bucket exists
            const buckets = await awsHelper.listS3Buckets();
            const bucketExists = TestUtils.bucketExists(buckets, bucketName);
            expect(bucketExists).to.be.true;
        });

        it("should create accessible API Gateway", async function () {

            this.skip();

            const apiEndpoint = outputs.apiEndpoint?.value || outputs.queryApiEndpoint;
            expect(apiEndpoint).to.be.a("string");
            expect(apiEndpoint).to.include("execute-api");
            
            // Extract API ID from endpoint
            const apiId = apiEndpoint.split("//")[1].split(".")[0];
            
            // Verify API exists
            const api = await apiGateway.send(new GetApiCommand({ ApiId: apiId }));
            expect(api.Name).to.include("query-api");
            expect(api.ProtocolType).to.equal("HTTP");
        });
    });

    describe("Document Processing Pipeline", () => {
        it("should process uploaded documents", async function() {
            // Skip this test if we don't have actual Lambda code
            this.skip();
            
            const bucketName = outputs.inputBucketName.value;
            const testDocument = "Test document content for RAG pipeline processing.";
            
            // Upload test document
            await awsHelper.putS3Object(bucketName, "test-document.txt", testDocument, "text/plain");
            
            // Wait for processing (in a real scenario, you might poll for completion)
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            // Verify document was processed (would need to check vector store)
            // This would require actual implementation in Lambda functions
        });

        it("should handle multiple document formats", async function() {
            this.skip(); // Skip until Lambda functions are implemented
        });
    });

    describe("Query API", () => {
        it("should respond to HEAD request", async function() {
            this.skip();


        });

        it("should handle query requests", async function() {
            
            this.skip();

            const apiEndpoint = outputs.queryApiEndpoint?.value || outputs.queryApiEndpoint;
            
            const response = await fetch(`${apiEndpoint}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: "What is the test document about?"
                })
            });
            
            expect(response.status).to.equal(200);
            
            const result = await response.json();
            expect(result).to.have.property("answer");
        });

        it("should return proper error for invalid requests", async function() {
            // Skip this test if we don't have actual Lambda code
            
            this.skip();
            
            const apiEndpoint = outputs.queryApiEndpoint?.value || outputs.queryApiEndpoint;
            
            const response = await fetch(`${apiEndpoint}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    // Missing required query field
                })
            });
            
            expect(response.status).to.equal(400);
        });
    });
 
    describe("Security and Permissions", () => {
        it("should have proper IAM roles configured", async function () {
            this.skip();

            // Check that Lambda functions have proper IAM roles
            const allFunctions = await awsHelper.listLambdaFunctions();
            const functions = TestUtils.findPipelineLambdaFunctions(allFunctions);
            
            expect(functions.ingestion).to.not.be.undefined;
            expect(functions.query).to.not.be.undefined;
            expect(functions.ingestion?.Role).to.include("ingestion-lambda-role");
            expect(functions.query?.Role).to.include("query-lambda-role");
        });

        it("should restrict access to vector store based on configuration", async function (){

            this.skip();

            // Get all roles and find pipeline roles
            const allRoles = await awsHelper.listIAMRoles();
            const role = TestUtils.findRoleByRoleName(allRoles, "ingestion-lambda-role");
            if (role) {
                const policyNames = await awsHelper.listRolePolicies(role.RoleName!);
                if (policyNames.length > 0) {
                    const policy = await awsHelper.getRolePolicy(role.RoleName!, policyNames[0]);
                    const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);
                    expect(policyAnalysis.hasOpenSearchPermissions).to.be.true;
                }
            }
        });
    });
});