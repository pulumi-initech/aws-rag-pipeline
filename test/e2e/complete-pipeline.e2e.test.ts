import "mocha";
import { expect } from "chai";
import { select } from "../helpers/automation.ts";
import { AWSHelper } from "../helpers/AWSHelper.ts";
import { queryAPI, TestUtils } from "../helpers/TestUtils.ts";

describe("Complete RAG Pipeline E2E Tests", function() {

    let outputs: { [key: string]: any };
    let awsHelper: AWSHelper;

    before(async function() {
        const stack = await select();
        outputs = await stack.outputs();

        // Initialize AWS helper with correct region
        awsHelper = new AWSHelper({ region: "us-east-1" });

        console.log(`Found stack ${stack.name}, with outputs:\n`, JSON.stringify(outputs, null, 2));
        
    });

    after(async function() {
        if (awsHelper) {
            console.log("Cleaning up AWS helper resources...");
            await awsHelper.cleanup();
            console.log("AWS helper cleanup completed");
        }
    });

    describe("Complete Document-to-Query Pipeline", () => {

        let bucketName: string;
        let documentFileName: string;
        let indexName: string;
        const logMessages: string[] = [];
        let apiEndpoint: string;
        before(async function() {
            // Extract output values with proper error handling
            try {
                bucketName = outputs.inputBucketName?.value;
                apiEndpoint = outputs.queryApiEndpoint?.value; 
                indexName = outputs.indexName?.value;

                if (!bucketName || !apiEndpoint || !indexName) {
                    throw new Error(`Missing required output values: bucketName=${bucketName}, apiEndpoint=${apiEndpoint}, indexName=${indexName}`);
                }

                console.log(`Using bucketName: ${bucketName}`);
                console.log(`Using apiEndpoint: ${apiEndpoint}`);
                console.log(`Using indexName: ${indexName}`);

                const indices = await awsHelper.listOpenSearchIndices(apiEndpoint);
                for (const index of indices) {
                    console.log(`Found OpenSearch index: ${index}`);
                }
                
                await awsHelper.clearOpenSearchIndex(
                    apiEndpoint,
                    indexName
                );
                console.log("Cleared OpenSearch index for clean test environment");
            } catch (error) {
                console.error("Error in test setup:", error);
                throw error;
            }

            documentFileName = TestUtils.generateTestFileName("healthcare-ai-document");
            
            // Create a comprehensive test document using TestUtils
            const testDocument = TestUtils.createTestDocumentContent(
                "The Future of Artificial Intelligence in Healthcare",
                `## Key Technologies
- **Machine Learning**: Predictive analytics for patient outcomes
- **Natural Language Processing**: Automated medical record analysis
- **Computer Vision**: Medical imaging and diagnostic support
- **Robotics**: Surgical assistance and rehabilitation

## Benefits and Applications

### Diagnostic Accuracy
AI systems can analyze medical images with 95% accuracy, often exceeding human specialists.
Early detection of diseases like cancer has improved by 40% with AI assistance.

### Treatment Personalization
- Genomic analysis enables personalized medicine
- Drug discovery accelerated by AI algorithms
- Treatment protocols optimized for individual patients

### Administrative Efficiency
Healthcare facilities report 30% reduction in administrative costs through AI automation.
Patient scheduling and resource allocation have become more efficient.

## Challenges and Considerations

### Patient data protection remains paramount. HIPAA compliance is essential for all AI implementations.
Blockchain technology offers potential solutions for secure data sharing.

### Initial investment in AI infrastructure can be substantial, averaging $2-5 million per hospital.
However, ROI typically achieved within 2-3 years.

### Healthcare professionals require comprehensive training on AI tools.
Change management strategies are crucial for successful implementation.

## Future Outlook

The global AI in healthcare market is projected to reach $102 billion by 2028.
Integration with IoT devices and wearable technology will further enhance capabilities.

## Conclusion

AI in healthcare represents a paradigm shift toward more precise, efficient, and personalized medical care.
While challenges exist, the benefits far outweigh the risks when implemented thoughtfully.

Keywords: artificial intelligence, healthcare, machine learning, medical AI, diagnostics`
            );

            console.log(`Uploading document: ${documentFileName}`);
            
            try {
                // Upload the test document using AWSHelper
                await awsHelper.putS3Object(bucketName, documentFileName, testDocument, "text/plain");
                console.log("Document uploaded successfully");

                console.log("Waiting for ingestion Lambda to process the document...");
                
                // Wait for document processing using TestUtils
                await TestUtils.waitForProcessing('medium');
                console.log("Processing wait completed");
            } catch (error) {
                console.error("Error during document upload or processing:", error);
                throw error;
            }

        });
        
        it("should process document and successfully answer queries about it", async function() {
            // Extended timeout for this comprehensive test
            this.timeout(600000); // 10 minutes

            // Test various queries about the document content
            const testQueries = [
                {
                    query: "What can you tell me about the future of AI in healthcare?",
                    expectedKeywords: ["artificial intelligence", "AI", "healthcare", "medical"]
                },
                {
                    query: "What are some Challenges and Considerations around use of AI in healthcare?",
                    expectedKeywords: ["data", "ROI", "training"]
                },
                {
                    query: "What are the key benefits of AI in healthcare?",
                    expectedKeywords: ["precise", "personalized", "efficient", "benefits"]
                },
                {
                    query: "What is the projected market size for AI in healthcare?",
                    expectedKeywords: ["102 billion", "2028", "market", "global"]
                }
            ];

            let successfulQueries = 0;
            const queryResponses: Array<{query: string, response: any, success: boolean}> = [];

            for (const testQuery of testQueries) {
                console.log(`\nTesting query: "${testQuery.query}"`);
                
                try {
                    const queryResponse = await queryAPI(apiEndpoint, testQuery.query);
                    
                    if (queryResponse.success) {
                        const responseText = JSON.stringify(queryResponse.data).toLowerCase();
                        console.log(`Response: ${queryResponse.data["response"]}`);
                        // Check if response contains expected keywords
                        const keywordMatches = testQuery.expectedKeywords.filter((keyword: string) => 
                            responseText.includes(keyword.toLowerCase())
                        );
                        
                        const querySuccess = keywordMatches.length > 0;
                        if (querySuccess) {
                            successfulQueries++;
                            console.log(`✓ Query successful. Found keywords: ${keywordMatches.join(", ")}`);
                        } else {
                            console.log(`⚠ Query returned response but no expected keywords found`);
                        }
                        
                        queryResponses.push({
                            query: testQuery.query,
                            response: queryResponse.data,
                            success: querySuccess
                        });
                    } else {
                        console.log(`✗ Query failed: ${queryResponse.error}`);
                        queryResponses.push({
                            query: testQuery.query,
                            response: queryResponse.error,
                            success: false
                        });
                    }
                } catch (error) {
                    console.log(`✗ Query error: ${error}`);
                    queryResponses.push({
                        query: testQuery.query,
                        response: error,
                        success: false
                    });
                }
                
                // Wait between queries to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            console.log(`\n=== STEP 5: Verify Query Function Logs ===`);
            
            // Check query Lambda logs using helpers
            const queryFunction = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.queryLambdaArn.value);

            if (queryFunction) {
                const queryLogGroupName = TestUtils.getLambdaLogGroupName(queryFunction.FunctionName!);
                const queryLogStreams = await awsHelper.describeLogStreams(queryLogGroupName, {
                    orderBy: "LastEventTime",
                    descending: true,
                    limit: 5
                });

                const queryLogMessages = await TestUtils.collectLogsFromStreams(
                    awsHelper,
                    queryLogGroupName,
                    queryLogStreams,
                    {
                        maxStreams: 5,
                    }
                );

                console.log(`Found ${queryLogMessages.length} query log messages`);
            }

            console.log(`\n=== RESULTS SUMMARY ===`);
            console.log(`Document: ${documentFileName}`);
            console.log(`Successful queries: ${successfulQueries}/${testQueries.length}`);
            console.log(`Overall success rate: ${((successfulQueries / testQueries.length) * 100).toFixed(1)}%`);

            // Print query results
            // queryResponses.forEach((result, index) => {
            //     console.log(`\nQuery ${index + 1}: ${result.query}`);
            //     console.log(`Success: ${result.success ? '✓' : '✗'}`);
            //     if (result.success && typeof result.response === 'object') {
            //         console.log(`Response: ${JSON.stringify(result.response).substring(0, 200)}...`);
            //     }
            // });

            // Assertions for the complete pipeline
            expect(successfulQueries, "Should have at least one successful query").to.be.greaterThan(0);
            
            // Check for catastrophic failures in logs
            const hasCatastrophicFailures = TestUtils.checkForCatastrophicFailures(logMessages);
            if (hasCatastrophicFailures) {
                console.log("\n⚠️ Warning: Catastrophic failures detected in Lambda logs");
            }
            
            // If we have both processing and successful queries, the pipeline is working
            if (successfulQueries > 0) {
                console.log("\n🎉 Complete RAG pipeline successfully validated!");
            } else {
                console.log("\n⚠️ Pipeline validation incomplete - check Lambda implementations");
            }
        });
    });

    describe("Multiple Document Handling", () => {
        let multiBucketName: string;
        let multiApiEndpoint: string;
        let multiIndexName: string;

        before(async function() {
            // Extract output values with proper error handling
            try {
                multiBucketName = outputs.inputBucketName?.value;
                multiApiEndpoint = outputs.queryApiEndpoint?.value; 
                multiIndexName = outputs.indexName?.value;

                if (!multiBucketName || !multiApiEndpoint || !multiIndexName) {
                    throw new Error(`Missing required output values for multi-doc test: bucketName=${multiBucketName}, apiEndpoint=${multiApiEndpoint}, indexName=${multiIndexName}`);
                }

                console.log("Setting up multiple document test environment");
                await awsHelper.clearOpenSearchIndex(
                    multiApiEndpoint,
                    multiIndexName
                );
                console.log("Cleared OpenSearch index for clean test environment");
            } catch (error) {
                console.error("Error in multi-doc test setup:", error);
                throw error;
            }
        });
        it("should handle multiple documents and maintain query context", async function() {
            this.timeout(480000); // 8 minutes

            // Use the properly scoped variables from the before block
            const bucketName = multiBucketName;
            const apiEndpoint = multiApiEndpoint;

            // Create multiple unrelated documents using TestUtils
            const documents = [
                {
                    name: TestUtils.generateTestFileName("climate-change-report"),
                    content: TestUtils.createTestDocumentContent(
                        "Global Climate Change Impact Report 2024",
                        `## Rising Sea Levels
The global average sea level has risen 8-9 inches since 1880.
Coastal cities face increasing flood risks by 2050.
Miami and Venice are among the most vulnerable locations.

## Temperature Changes
Global temperatures have increased 1.1°C since pre-industrial times.
The Arctic is warming twice as fast as the global average.
2023 was recorded as the hottest year on record globally.

## Economic Impact
Climate change costs the global economy $23 trillion annually.
Renewable energy investment reached $1.8 trillion in 2023.
Green technology jobs increased by 12% in the past year.

## Environmental Consequences
Arctic ice is melting at 13% per decade.
Ocean acidification has increased 30% since industrial revolution.
Extreme weather events cost $90 billion in damages in 2023.`
                    )
                },
                {
                    name: TestUtils.generateTestFileName("space-exploration"),
                    content: TestUtils.createTestDocumentContent(
                        "Mars Exploration Mission Updates 2024",
                        `## Recent Discoveries
Mars rover Perseverance found organic compounds in ancient lake bed.
Evidence suggests Mars had flowing water 3.7 billion years ago.
Jezero Crater shows signs of past microbial life.

## Future Missions
NASA plans crewed Mars mission by 2035.
SpaceX Starship completed successful orbital test in 2024.
Artemis program will establish lunar base by 2028.

## Technical Achievements
Mars helicopter Ingenuity completed 72 flights, exceeding expectations.
Sample return mission scheduled for 2031 launch window.
New propulsion technology reduces Mars travel time to 6 months.

## International Cooperation
ESA-NASA joint mission to Jupiter's moons launches 2026.
China's Mars rover Zhurong discovered water ice deposits.
Private space companies invested $14.5 billion in exploration.`
                    )
                }
            ];

            console.log(`\n=== Uploading Multiple Documents ===`);
            
            try {
                // Upload all documents using TestUtils
                await TestUtils.uploadDocuments(awsHelper, bucketName, documents);
                console.log(`Uploaded ${documents.length} documents successfully`);

                // Wait for processing
                console.log("\nWaiting for multi-document processing...");
                await TestUtils.waitForProcessing('medium');
                console.log("Multi-document processing wait completed");
            } catch (error) {
                console.error("Error during multi-document upload or processing:", error);
                throw error;
            }

            console.log(`\n=== Testing Cross-Document Queries ===`);
            
            // Test queries that should find information from specific documents
            const crossDocumentQueries = [
                {
                    query: "What are the economic impacts of climate change?",
                    expectedContent: ["$23 trillion", "economy", "renewable energy", "trillion"]
                },
                {
                    query: "When is the planned crewed mission to Mars?",
                    expectedContent: ["2035", "NASA", "crewed", "Mars"]
                },
                {
                    query: "How much has sea level risen since 1880?",
                    expectedContent: ["8-9 inches", "1880", "sea level", "risen"]
                },
                {
                    query: "What technical achievements were made by Mars helicopter?",
                    expectedContent: ["Ingenuity", "72 flights", "helicopter", "Mars"]
                },
                {
                    query: "What evidence of past water was found on Mars?",
                    expectedContent: ["flowing water", "3.7 billion", "Jezero Crater", "ancient"]
                },
                {
                    query: "How much do extreme weather events cost annually?",
                    expectedContent: ["$90 billion", "damages", "extreme weather", "2023"]
                }
            ];

            let crossDocumentSuccesses = 0;

            for (const testQuery of crossDocumentQueries) {
                console.log(`\nTesting cross-document query: "${testQuery.query}"`);
                
                try {
                    const response = await queryAPI(apiEndpoint, testQuery.query);
                    
                    if (response.success) {
                        const responseText = JSON.stringify(response.data["response"]).toLowerCase();
                        console.log(`Response: ${response.data["response"]}`);
                       
                        const matches = testQuery.expectedContent.filter((content: string) => 
                            responseText.includes(content.toLowerCase())
                        );
                        
                        if (matches.length > 0) {
                            crossDocumentSuccesses++;
                            console.log(`✓ Found content: ${matches.join(", ")}`);
                        } else {
                            console.log(`⚠ Response received but no expected content found`);
                        }
                    } else {
                        console.log(`✗ Query failed: ${response.error}`);
                    }
                } catch (error) {
                    console.log(`✗ Query error: ${error}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            console.log(`\nCross-document query results: ${crossDocumentSuccesses}/${crossDocumentQueries.length}`);
            
            // Verify multiple documents were processed
            expect(crossDocumentSuccesses, "Should successfully query across multiple documents").to.be.greaterThan(0);
        });
    });
});