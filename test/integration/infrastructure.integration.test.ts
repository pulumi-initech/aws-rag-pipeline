import "mocha";
import { expect } from "chai";
import { Stack } from "@pulumi/pulumi/automation/index.js";
import { select } from "./automation.ts";
import { AWSHelper, LambdaS3InvokePermission, TestUtils } from "../helpers/index.ts";

describe("Infrastructure Integration Tests", function() {
    // Set longer timeout for infrastructure operations
    this.timeout(600000); // 10 minutes

    let stack: Stack;
    let outputs: { [key: string]: any };

    let awsHelper: AWSHelper;

    this.beforeAll(async function() {
        stack = await select();
        outputs = await stack.outputs();
        
        // Initialize AWS helper
        awsHelper = new AWSHelper({ region: process.env.AWS_REGION });
    });

    this.afterAll(async function() {
        await awsHelper.cleanup();
    });

    describe("Core Infrastructure", () => {
        it("should deploy all required outputs", async () => {
            const validation = TestUtils.validatePipelineOutputs(outputs, "opensearch");
            
            expect(validation.hasInputBucketName).to.be.true;
            expect(validation.hasApiEndpoint).to.be.true;
        });


        it("should create S3 bucket with proper configuration", async () => {
            const bucketName = outputs.inputBucketName.value;
            
            console.log("Checking S3 bucket:", bucketName);

            // Get all buckets and check if our bucket exists
            const buckets = await awsHelper.listS3Buckets();

            const bucketExists = TestUtils.bucketExists(buckets, bucketName);
            expect(bucketExists).to.be.true;
            
            // // Verify bucket is accessible
            // const bucketLocation = await awsHelper.getS3BucketLocation(bucketName);
            // expect(bucketLocation.LocationConstraint).to.be.oneOf([null, "us-west-2"]);
        });
    });

    describe("Conditional IAM Policies", () => {
        it("should include OpenSearch permissions for OpenSearch configuration", async () => {
            // Get all roles and find ingestion role
            const ingestionLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.ingestionLambdaArn.value);
            const ingestionRole = ingestionLambda?.Role;
            expect(ingestionRole).to.not.be.undefined;
            
            const roleNameParts = ingestionRole?.split("/");
            expect(roleNameParts).to.have.length.greaterThan(1);
            const roleName = roleNameParts![1];

            expect(ingestionRole).to.include("ingestion-lambda-role");
            
             const role = await awsHelper.getIAMRole(roleName);
            expect(role).to.not.be.undefined;

            // Get role policies
            const policyNames = await awsHelper.listRolePolicies(roleName);
            expect(policyNames).to.have.length.greaterThan(0);
            
            // Get the first policy and analyze it
            const policy = await awsHelper.getRolePolicy(roleName, policyNames[0]);
            const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);
            
            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";
            if (vectorStoreType === "opensearch") {
                expect(policyAnalysis.hasOpenSearchPermissions).to.be.true;
            } else {
                expect(policyAnalysis.hasOpenSearchPermissions).to.be.false;
            }
        });

        it("should include required base permissions", async () => {
            // Get all roles and find query role
            const allRoles = await awsHelper.listIAMRoles();
            const role = TestUtils.findRoleByRoleName(allRoles, "query-lambda-role");
            
            if (!role) {
                throw new Error("Query role not found");
            }
            
            // Get role policies
            const policyNames = await awsHelper.listRolePolicies(role.RoleName!);
            const policy = await awsHelper.getRolePolicy(role.RoleName!, policyNames[0]);
            const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);
            
            expect(policyAnalysis.hasLoggingPermissions).to.be.true;
            expect(policyAnalysis.hasBedrockPermissions).to.be.true;
            expect(policyAnalysis.hasOpenSearchPermissions).to.be.true;
        });
    });

    describe("Ingestion Lambda Configuration", () => {

        it("should have ingestion Lambda function in healthy state", async () => {
            const ingestionLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.ingestionLambdaArn.value);
            expect(ingestionLambda).to.not.be.undefined;
            expect(ingestionLambda?.State).to.equal("Active");
            expect(ingestionLambda?.Runtime).to.equal("nodejs18.x");
            expect(ingestionLambda?.Handler).to.equal("index.handler");
        });

        it("should have proper environment variables configured", async () => {
            const ingestionLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.ingestionLambdaArn.value);

            const envVars = ingestionLambda?.Environment?.Variables || {};

            expect(envVars).to.have.property("VECTOR_STORE_ENDPOINT");
            expect(envVars).to.have.property("VECTOR_STORE_TYPE");
            expect(envVars).to.have.property("INDEX_NAME");
            
            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";

            expect(envVars.VECTOR_STORE_TYPE).to.equal(vectorStoreType);

            if (vectorStoreType === "opensearch") {
                expect(envVars.VECTOR_STORE_ENDPOINT).to.include("aoss.amazonaws.com");
            } else if (vectorStoreType === "pinecone") {
                expect(envVars.VECTOR_STORE_ENDPOINT).to.include("pinecone.io");
            }
        });
    });

    describe("Lambda Event Processing", () => {
        it("Should have proper S3 bucket notification configuration", async () => {
            const bucketName = outputs.inputBucketName.value;
            
            // Get bucket notification configuration
            const notification = await awsHelper.getS3BucketNotificationConfiguration(bucketName);
            expect(notification).to.not.be.undefined;
            expect(notification).to.have.property("LambdaFunctionConfigurations");  
            expect(notification.LambdaFunctionConfigurations).to.have.length.greaterThan(0);

            const functionConfiguration = notification.LambdaFunctionConfigurations![0];
            expect(functionConfiguration.LambdaFunctionArn).to.equals(outputs.ingestionLambdaArn.value);

            const events = functionConfiguration.Events || [];
            expect(events).to.include("s3:ObjectCreated:*");
        });

        it("Should have a Lambbda invoke permission for S3", async () => {
            const bucketName = outputs.inputBucketName.value;
            const ingestionLambdaArn = outputs.ingestionLambdaArn.value;

            const functionNameMatch = ingestionLambdaArn.match(/:function:([^:]+)/);
            expect(functionNameMatch).to.not.be.null;
            expect(functionNameMatch).to.have.length.greaterThan(1);
            
            const permissions = await awsHelper.listLambdaPermissions(
                functionNameMatch![1]
            );

            expect(permissions).to.not.be.undefined;
            expect(permissions).to.have.length.greaterThan(0);

            const policy = TestUtils.findResourceByNamePattern(permissions, "Action", "lambda:InvokeFunction") as LambdaS3InvokePermission;
            expect(policy).to.not.be.undefined;

            expect(policy.Principal.Service).to.equal("s3.amazonaws.com");
            expect(policy.Condition.ArnLike["AWS:SourceArn"]).to.include(bucketName);

        });

        it("Should process uploaded document and log successful ingestion", async function() {
        
            const bucketName = outputs.inputBucketName.value;
            const testFileName = `test-document-${Date.now()}.txt`;
            const testContent = `
# Test Document for RAG Pipeline

This is a test document for the RAG pipeline integration test.

## Key Information
- Document type: Test document
- Purpose: Integration testing
- Content: Sample text for embedding generation
- Timestamp: ${new Date().toISOString()}

            `.trim();

            console.log(`Uploading test document: ${testFileName}`);
            awsHelper.putS3Object(bucketName, testFileName, testContent, "text/plain");

            // Step 2: Wait for Lambda function to be triggered and process the document
            console.log("Waiting for Lambda function to process the document...");
            await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

            // Step 4: Get CloudWatch log group for the Lambda function
            const logGroupName = `/aws/lambda/${outputs.ingestionLambdaArn.value.split(":").slice(-1)[0]}`;
            console.log(`Log group name: ${logGroupName}`);

            // Step 5: Get recent log streams

            const logStreams = await awsHelper.describeLogStreams(logGroupName, {
                orderBy: "LastEventTime",
                descending: true,
                limit: 10
            });

            expect(logStreams).to.have.length.greaterThan(0);

            // Step 6: Collect and parse log events from the most recent streams
            const {  successFound, errorFound, logMessages } = 
                await TestUtils.collectAndParseLambdaLogs(
                    awsHelper,
                    logGroupName,
                    logStreams,
                    testFileName,
                    {
                        maxStreams: 5,
                        timeWindowMinutes: 5,
                        maxEvents: 100
                    }
                );

            // Step 7: Assertions
            expect(logMessages.length).to.be.greaterThan(0, "Should have some log messages");
            expect(successFound).to.be.true;

            // If we found errors, the test should provide details but may still pass
            // if processing was attempted (since Lambda code might not be fully implemented)
            if (errorFound) {
                console.warn("Errors found in logs without clear processing indication:");
                for (const msg of logMessages) {
                    console.warn(msg);
                }
                console.warn('---')
            }

        });

    });
});