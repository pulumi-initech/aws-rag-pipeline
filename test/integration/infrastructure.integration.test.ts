import "mocha";
import { expect } from "chai";
import { Stack } from "@pulumi/pulumi/automation/index.js";
import { select } from "./automation.ts";
import { AWSHelper, LambdaS3InvokePermission, TestUtils, queryAPI } from "../helpers/index.ts";
// import { skip } from "node:test"; // Currently unused
import { FunctionConfiguration } from "@aws-sdk/client-lambda";
// import { apigatewayv2 } from "@pulumi/aws"; // Currently unused

describe("Infrastructure Integration Tests", function() {
    // Set longer timeout for infrastructure operations
    this.timeout(600000); // 10 minutes

    let stack: Stack;
    let outputs: { [key: string]: any };

    let awsHelper: AWSHelper;

    this.beforeAll(async function() {
        stack = await select();
        outputs = await stack.outputs();
        
        // Initialize AWS helper - use us-east-1 since that's where the resources are deployed
        awsHelper = new AWSHelper({ region: "us-east-1" });
    });

    this.afterAll(async function() {
        await awsHelper.cleanup();
    });

    describe("Core Infrastructure", () => {
        it("should deploy all required outputs", async () => {
            const validation = TestUtils.validatePipelineOutputs(outputs, "opensearch");
            
            expect(validation.hasInputBucketName, "Pipeline should have inputBucketName output").to.be.true;
            expect(validation.hasApiEndpoint, "Pipeline should have API endpoint output").to.be.true;
        });


        it("should create S3 bucket with proper configuration", async () => {
            const bucketName = outputs.inputBucketName.value;
            
            // Check if bucket exists using direct lookup (more efficient)
            const bucketExists = await awsHelper.bucketExists(bucketName);
            expect(bucketExists, `S3 bucket ${bucketName} should exist`).to.be.true;
            
            // // Verify bucket is accessible
            // const bucketLocation = await awsHelper.getS3BucketLocation(bucketName);
            // expect(bucketLocation.LocationConstraint).to.be.oneOf([null, "us-west-2"]);
        });
    });

    describe("Ingestion Lambda Configuration", () => {

        let ingestionLambda: FunctionConfiguration | undefined;

        before(async () => {
            ingestionLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.ingestionLambdaArn.value);
        });

         it("should include required IAM permissions", async () => {
            // Get all roles and find ingestion role
            const ingestionRole = ingestionLambda?.Role;
            expect(ingestionRole, "Ingestion Lambda should have a role configured").to.not.be.undefined;
            
            // Extract role name from ARN - just the role name part (last segment after /)
            const roleNameMatch = ingestionRole?.match(/\/([^/]+)$/);
            const roleName = roleNameMatch?.[1];
            
            const role = await awsHelper.getIAMRole(roleName as string);
            expect(role, `IAM role ${roleName} should exist`).to.not.be.undefined;

            // Get role policies
            const policyNames = await awsHelper.listRolePolicies(roleName as string);
            expect(policyNames, `Role ${roleName} should have at least one inline policy`).to.have.length.greaterThan(0);
            
            // Get the first policy and analyze it
            const policy = await awsHelper.getRolePolicy(roleName as string, policyNames[0]);
            const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);

            expect(policyAnalysis.hasLoggingPermissions, "Query role policy should have required CloudWatch logging permissions").to.be.true;
            expect(policyAnalysis.hasBedrockPermissions, "Query role policy should have required Bedrock access permissions").to.be.true; 
            expect(policyAnalysis.hasECRPermissions, "Query role policy should have required ECR permissions").to.be.true;

            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";
            if (vectorStoreType === "opensearch") {
                expect(policyAnalysis.hasOpenSearchPermissions, "Policy should include OpenSearch permissions for opensearch vector store").to.be.true;
            } else {
                expect(policyAnalysis.hasOpenSearchPermissions, "Policy should not include OpenSearch permissions for non-opensearch vector store").to.be.false;
            }
        });


        it("should have ingestion Lambda function in healthy state", async () => {
            expect(ingestionLambda, "Ingestion Lambda function should be retrieved").to.not.be.undefined;
            expect(ingestionLambda?.State, "Ingestion Lambda should be in Active state").to.equal("Active");
        });

        it("should have proper environment variables configured", async () => {
            const envVars = ingestionLambda?.Environment?.Variables || {};

            expect(envVars, "Ingestion Lambda should have VECTOR_STORE_ENDPOINT environment variable").to.have.property("VECTOR_STORE_ENDPOINT");
            expect(envVars, "Ingestion Lambda should have VECTOR_STORE_TYPE environment variable").to.have.property("VECTOR_STORE_TYPE");
            expect(envVars, "Ingestion Lambda should have INDEX_NAME environment variable").to.have.property("INDEX_NAME");
            
            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";

            expect(envVars.VECTOR_STORE_TYPE, `VECTOR_STORE_TYPE should be set to ${vectorStoreType}`).to.equal(vectorStoreType);

            if (vectorStoreType === "opensearch") {
                expect(envVars.VECTOR_STORE_ENDPOINT, "OpenSearch endpoint should contain aoss.amazonaws.com").to.include("aoss.amazonaws.com");
            } else if (vectorStoreType === "pinecone") {
                expect(envVars.VECTOR_STORE_ENDPOINT, "Pinecone endpoint should contain pinecone.io").to.include("pinecone.io");
            }
        });

        it("Should have proper S3 bucket notification configuration", async () => {
            const bucketName = outputs.inputBucketName.value;
            
            // Get bucket notification configuration
            const notification = await awsHelper.getS3BucketNotificationConfiguration(bucketName);
            expect(notification, `S3 bucket ${bucketName} should have notification configuration`).to.not.be.undefined;
            expect(notification, "Notification configuration should have LambdaFunctionConfigurations property").to.have.property("LambdaFunctionConfigurations");  
            expect(notification.LambdaFunctionConfigurations, "Should have at least one Lambda function configuration").to.have.length.greaterThan(0);

            const functionConfiguration = notification.LambdaFunctionConfigurations![0];
            expect(functionConfiguration.LambdaFunctionArn, "Lambda function ARN in notification should match ingestion Lambda ARN").to.equals(outputs.ingestionLambdaArn.value);

            const events = functionConfiguration.Events || [];
            expect(events, "Notification should include s3:ObjectCreated:* events").to.include("s3:ObjectCreated:*");
        });

        it("Should have a Lambbda invoke permission for S3", async () => {
            const bucketName = outputs.inputBucketName.value;
            const ingestionLambdaArn = outputs.ingestionLambdaArn.value;

            const functionNameMatch = ingestionLambdaArn.match(/:function:([^:]+)/);
            expect(functionNameMatch, "Should be able to extract function name from ARN").to.not.be.null;
            expect(functionNameMatch, "Function name match should have at least 2 elements").to.have.length.greaterThan(1);
            
            const permissions = await awsHelper.getLambdaResourcePolicy(
                functionNameMatch![1]
            );

            expect(permissions, `Ingestion Lambda ${functionNameMatch![1]} should have resource policies`).to.not.be.undefined;
            expect(permissions, "Should have at least one resource policy").to.have.length.greaterThan(0);

            const policy = TestUtils.findResourceByNamePattern(permissions, "Action", "lambda:InvokeFunction") as LambdaS3InvokePermission;
            expect(policy, "Should find lambda:InvokeFunction permission policy").to.not.be.undefined;

            expect(policy.Principal.Service, "Lambda invoke permission should be granted to S3 service").to.equal("s3.amazonaws.com");
            expect(policy.Condition.ArnLike["AWS:SourceArn"], `Source ARN condition should reference bucket ${bucketName}`).to.include(bucketName);
            
        });
    });

    describe("Query Lambda Configuration", () => {

        let queryLambda: FunctionConfiguration | undefined;

        before(async () => {
            queryLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.queryLambdaArn.value);
        });


         it("should include required IAM permissions", async function() {

            // Get query lambda role name from ARN and fetch role directly
            const queryRole = queryLambda?.Role;
            expect(queryRole, "Query Lambda should have a role configured").to.not.be.undefined;
            
            // Extract role name from ARN - just the role name part (last segment after /)
            const roleNameMatch = queryRole?.match(/\/([^/]+)$/);
            const roleName = roleNameMatch?.[1];

            // At this point roleName is guaranteed to be defined due to the expect check above
            const role = await awsHelper.getIAMRole(roleName as string);
            expect(role, `IAM query role ${roleName} should exist`).to.not.be.undefined;
            
            // Get role policies
            const policyNames = await awsHelper.listRolePolicies(roleName as string);
            const policy = await awsHelper.getRolePolicy(roleName as string, policyNames[0]);
            const policyAnalysis = TestUtils.analyzePolicyPermissions(policy);
            
            expect(policyAnalysis.hasLoggingPermissions, "Query role policy should have required CloudWatch logging permissions").to.be.true;
            expect(policyAnalysis.hasBedrockPermissions, "Query role policy should have required Bedrock access permissions").to.be.true;
            expect(policyAnalysis.hasECRPermissions, "Query role policy should have required ECR permissions").to.be.true;

            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";  
            if (vectorStoreType === "opensearch") {
                expect(policyAnalysis.hasOpenSearchPermissions, "Policy should include OpenSearch permissions for opensearch vector store").to.be.true;
            } else {
                expect(policyAnalysis.hasOpenSearchPermissions, "Policy should not include OpenSearch permissions for non-opensearch vector store").to.be.false;
            }
        });

        it("should have query Lambda function in healthy state", async () => {
            expect(queryLambda, "Query Lambda function should be retrieved").to.not.be.undefined;
            expect(queryLambda?.State, "Query Lambda should be in Active state").to.equal("Active");
        });

        it("should have proper environment variables configured", async () => {
            const envVars = queryLambda?.Environment?.Variables || {};

            expect(envVars, "Query Lambda should have VECTOR_STORE_ENDPOINT environment variable").to.have.property("VECTOR_STORE_ENDPOINT");
            expect(envVars, "Query Lambda should have VECTOR_STORE_TYPE environment variable").to.have.property("VECTOR_STORE_TYPE");
            expect(envVars, "Query Lambda should have INDEX_NAME environment variable").to.have.property("INDEX_NAME");

            const vectorStoreType = (await stack.getConfig("vectorStore")).value || "opensearch";

            expect(envVars.VECTOR_STORE_TYPE, `Query Lambda VECTOR_STORE_TYPE should be set to ${vectorStoreType}`).to.equal(vectorStoreType);

            if (vectorStoreType === "opensearch") {
                expect(envVars.VECTOR_STORE_ENDPOINT, "Query Lambda OpenSearch endpoint should contain aoss.amazonaws.com").to.include("aoss.amazonaws.com");
            } else if (vectorStoreType === "pinecone") {
                expect(envVars.VECTOR_STORE_ENDPOINT, "Query Lambda Pinecone endpoint should contain pinecone.io").to.include("pinecone.io");
            }
        });
    });

    describe("API Gateway Configuration", () => {

        let api: any;

        before(async () => {
            const queryApiName = outputs.queryApiName.value;
            api = await awsHelper.getApiGatewayByName(queryApiName);
        });

        it("should have API Gateway created", async () => {
            expect(api, "API Gateway should be retrieved by name").to.not.be.undefined;
            expect(api?.ApiEndpoint, "API Gateway should have an endpoint URL").to.not.be.undefined;
        });

        it("should have invokeFunction permission for API Gateway", async () => {
            const queryLambdaArn = outputs.queryLambdaArn.value;
            const functionNameMatch = queryLambdaArn.match(/:function:([^:]+)/);

            const permissions = await awsHelper.getLambdaResourcePolicy(
                functionNameMatch![1]
            );

            expect(permissions, `Query Lambda ${functionNameMatch![1]} should have resource policies`).to.not.be.undefined;
            expect(permissions, "Should have at least one resource policy for API Gateway").to.have.length.greaterThan(0);

            const policy = TestUtils.findResourceByNamePattern(permissions, "Action", "lambda:InvokeFunction") as LambdaS3InvokePermission;
            expect(policy, "Should find lambda:InvokeFunction permission policy for API Gateway").to.not.be.undefined;
            expect(policy.Principal.Service, "Lambda invoke permission should be granted to API Gateway service").to.equal("apigateway.amazonaws.com");
            expect(policy.Resource, "Permission resource should reference the query Lambda ARN").to.include(outputs.queryLambdaArn.value);
        });

        it("should have proxy integration with Lambda", async () => {
            const integrations = await awsHelper.listApiGatewayIntegrations(api.ApiId);
            expect(integrations, "API Gateway should have at least one integration").to.have.length.greaterThan(0);

            const integration = integrations.find((i: any) => i.IntegrationType === "AWS_PROXY");
            expect(integration, "Should find AWS_PROXY integration type").to.not.be.undefined;
            expect(integration!.IntegrationUri, "Integration URI should reference the query Lambda ARN").to.include(outputs.queryLambdaArn.value);
        });

        it("should have proper route configured", async () => {
            const routes = await awsHelper.listApiGatewayRoutes(api!.ApiId);
            expect(routes, "API Gateway should have at least one route configured").to.have.length.greaterThan(0);

            const postRoute = routes.find(route => route.RouteKey === "POST /query");
            expect(postRoute, "Should find POST /query route").to.not.be.undefined;
        });

        it("should respond to HTTP POST /query", async () => {
            const endpoint = outputs.queryApiEndpoint.value;
            expect(endpoint, "Query API endpoint should be defined").to.not.be.undefined;

            const response = await queryAPI(endpoint, "test query");

            expect(response.success, "API query should be successful").to.be.true;
            expect(response.data, "API response should contain data").to.not.be.undefined;
        });
    });

   

    describe("Ingestion Lambda Integration", () => {

        let logMessages: string[] = [];
        let bucketName: string;
        let testFileName: string;   

        before(async function() {

            bucketName = outputs.inputBucketName.value;
            testFileName = `test-document-${Date.now()}.txt`; 
            
            const testContent = TestUtils.createTestDocumentContent(testFileName);

            awsHelper.putS3Object(bucketName, testFileName, testContent, "text/plain");

            await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

            // Step 4: Get CloudWatch log group for the Lambda function
            const logGroupName = `/aws/lambda/${outputs.ingestionLambdaArn.value.split(":").slice(-1)[0]}`;

            // Step 5: Get recent log streams

            const logStreams = await awsHelper.describeLogStreams(logGroupName, {
                orderBy: "LastEventTime",
                descending: true,
                limit: 10
            });

            if(logStreams.length){
                logMessages = await TestUtils.collectLogsFromStreams(awsHelper, logGroupName, logStreams, {
                    maxStreams: 5
                });
            }
        });

        it("Should log successful invocation of the ingestion Lambda from S3", async function() {

            expect(logMessages.length).to.be.greaterThan(0, "Should have some log messages");

            const eventMessage = TestUtils.parseLogStreamsForEvent(logMessages);
            expect(eventMessage, "Should find event message in logs").to.not.be.undefined;

            const split = eventMessage!.split("Received event: ");
            const eventJson = split[1] || "{}";
            const event = JSON.parse(eventJson.trim());

            expect(event.Records, "Event should have at least one S3 record").to.have.length.greaterThan(0);
            expect(event.Records[0].s3, "Event record should have S3 object").to.not.be.undefined;
            expect(event.Records[0].s3.bucket.name, `Event should reference bucket ${bucketName}`).to.equal(bucketName);
            expect(event.Records[0].s3.object.key, `Event should reference object ${testFileName}`).to.equal(testFileName);
            
        });

        it("Should process uploaded document and log successful ingestion", async function() {
        
            expect(logMessages.length).to.be.greaterThan(0, "Should have some log messages");

            const {successFound, errorFound} = TestUtils.parseLogStreamsForProcessing(logMessages, testFileName);
            expect(successFound, `Should find successful processing logs for ${testFileName}`).to.be.true;

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

     describe("Query Lambda Integration", () => {
        
        it("should invoke Query lambda via API Gateway and log successful execution", async function() {
            this.timeout(30000); // 30 second timeout for API calls and log processing
            
            const endpoint = outputs.queryApiEndpoint.value;
            const queryLambdaArn = outputs.queryLambdaArn.value;
            const functionNameMatch = queryLambdaArn.match(/:function:([^:]+)/);
            
            expect(functionNameMatch, "Should be able to extract function name from query Lambda ARN").to.not.be.null;
            const functionName = functionNameMatch![1];
            
            // Get log group name
            const logGroupName = TestUtils.getLambdaLogGroupName(functionName);
            
            // Generate unique test query to ensure we find the right log entry
            const timestamp = Date.now();
            const testQuery = `What is artificial intelligence? Test ID: ${timestamp}`;
            
            const response = await queryAPI(endpoint, testQuery);
            
            // Verify API response
            expect(response.success, "Query API call should be successful").to.be.true;
            expect(response.data, "Query API response should contain data").to.not.be.undefined;
            
            // Wait a moment for logs to propagate
            await TestUtils.waitForProcessing('short');
            
            // Get recent log streams
            const logStreams = await awsHelper.describeLogStreams(logGroupName, {
                orderBy: "LastEventTime",
                descending: true,
                limit: 5
            });
            
            expect(logStreams, "Should find at least one log stream for the query Lambda").to.have.length.greaterThan(0);
            
            // Collect logs from recent streams
            const logMessages = await TestUtils.collectLogsFromStreams(
                awsHelper, 
                logGroupName, 
                logStreams, 
                { 
                    searchTerm: "",  // Get all logs
                    minutes: 2,      // Last 2 minutes  
                    limit: 100,      // Max 100 events per stream
                    maxStreams: 3    // Check up to 3 streams
                }
            );
            
            // Verify logs show successful Lambda execution
            expect(logMessages, "Should collect log messages from query Lambda execution").to.have.length.greaterThan(0);
            
            // Check for Lambda execution start/end markers
            const hasStartMarker = logMessages.some(msg => 
                msg.includes("START RequestId") || 
                msg.includes("Received event:")
            );
            
            const hasEndMarker = logMessages.some(msg => 
                msg.includes("END RequestId") ||
                msg.includes("REPORT RequestId")
            );
            
            expect(hasStartMarker, "Should find Lambda execution start marker in logs").to.be.true;
            expect(hasEndMarker, "Should find Lambda execution end marker in logs").to.be.true;
            
            // Check for successful processing (no errors)
            const hasErrors = TestUtils.checkForCatastrophicFailures(logMessages);
            expect(hasErrors, "Should not have catastrophic failures (timeout/OOM) in logs").to.be.false;
            
            // Look for the specific "Received event:" log message and validate it contains our query
            let foundReceivedEvent = false;
            let queryMatched = false;
            let foundSuccessfulProcessing = false;
            
            for (const msg of logMessages) {
                if (msg.includes("Received event:")) {
                    foundReceivedEvent = true;
                    
                    // Extract and parse the JSON body from the log message
                    try {
                        // The log message contains the event JSON after "Received event:"
                        const eventStartIndex = msg.indexOf("{");
                        const eventEndIndex = msg.lastIndexOf("}") + 1;
                        
                        if (eventStartIndex !== -1 && eventEndIndex > eventStartIndex) {
                            const eventJson = msg.substring(eventStartIndex, eventEndIndex);
                            const event = JSON.parse(eventJson);
                            
                            // Validate this is a POST /query request
                            if (event.routeKey === "POST /query" && event.body) {
                                
                                // Parse the body to get the query
                                const requestBody = JSON.parse(event.body);
                                const loggedQuery = requestBody.query;
                                
                                // Verify the query matches what we sent
                                if (loggedQuery === testQuery) {
                                    queryMatched = true;
                                    // Don't break here - continue looking for the success message
                                }
                            }
                        }
                    } catch (parseError) {
                        console.log("Failed to parse event JSON from log message:", parseError);
                    }
                }
                
                // Also look for the successful processing message
                if (msg.includes("Successfully processed query:") && msg.includes(testQuery)) {
                    foundSuccessfulProcessing = true;
                }
            }
            
            expect(foundReceivedEvent, "Should find 'Received event:' log message").to.be.true;
            expect(queryMatched, "Should find our unique test query in the logged event body").to.be.true;
            expect(foundSuccessfulProcessing, "Should find 'Successfully processed query' log message indicating successful completion").to.be.true;
            
        });
    });
});