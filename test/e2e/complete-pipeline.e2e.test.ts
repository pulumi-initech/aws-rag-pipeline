import "mocha";
import { expect } from "chai";
import { select } from "./automation.ts";
import { AWSHelper } from "../helpers/AWSHelper.ts";
import { TestUtils } from "../helpers/TestUtils.ts";

// Use native fetch for Node.js 18+
// @ts-ignore - globalThis.fetch is available in Node.js 18+
const fetch = globalThis.fetch;

// Helper function to query the API
async function queryAPI(apiEndpoint: string, query: string): Promise<{success: boolean, data?: any, error?: string}> {
    try {
        const response = await fetch(`${apiEndpoint}/query`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ query })
        });

        if (response.ok) {
            const data = await response.json();
            return { success: true, data };
        } else {
            const errorText = await response.text();
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }
    } catch (error) {
        return { success: false, error: `Network error: ${error}` };
    }
}

describe("Complete RAG Pipeline E2E Tests", function() {

    let outputs: { [key: string]: any };
    let awsHelper: AWSHelper;

    before(async function() {
        console.log("Deploying complete RAG pipeline infrastructure...");
        const stack = await select();
        outputs = await stack.outputs();

        // Initialize AWS helper with correct region
        awsHelper = new AWSHelper({ region: "us-east-1" });

        console.log(`Found stack ${stack.name}, with outputs:\n`, outputs);
    });

    describe("Complete Document-to-Query Pipeline", () => {
        it("should process document and successfully answer queries about it", async function() {
            // Extended timeout for this comprehensive test
            this.timeout(600000); // 10 minutes

            const bucketName = outputs.inputBucketName.value;
            const apiEndpoint = outputs.queryApiEndpoint.value;
            const documentFileName = TestUtils.generateTestFileName("healthcare-ai-document");
            
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

### Data Privacy
Patient data protection remains paramount. HIPAA compliance is essential for all AI implementations.
Blockchain technology offers potential solutions for secure data sharing.

### Implementation Costs
Initial investment in AI infrastructure can be substantial, averaging $2-5 million per hospital.
However, ROI typically achieved within 2-3 years.

### Training and Adoption
Healthcare professionals require comprehensive training on AI tools.
Change management strategies are crucial for successful implementation.

## Future Outlook

The global AI in healthcare market is projected to reach $102 billion by 2028.
Integration with IoT devices and wearable technology will further enhance capabilities.

## Conclusion

AI in healthcare represents a paradigm shift toward more precise, efficient, and personalized medical care.
While challenges exist, the benefits far outweigh the risks when implemented thoughtfully.

Keywords: artificial intelligence, healthcare, machine learning, medical AI, diagnostics`
            );

            console.log(`\n=== STEP 1: Upload Document ===`);
            console.log(`Uploading document: ${documentFileName}`);
            
            // Upload the test document using AWSHelper
            await awsHelper.putS3Object(bucketName, documentFileName, testDocument, "text/plain");
            console.log("Document uploaded successfully");

            console.log(`\n=== STEP 2: Wait for Document Processing ===`);
            console.log("Waiting for ingestion Lambda to process the document...");
            
            // Wait for document processing using TestUtils
            await TestUtils.waitForProcessing('short');

            console.log(`\n=== STEP 3: Verify Document Processing ===`);
            
            // Find and verify the ingestion Lambda processed the document
            const ingestionLambda = await awsHelper.getLambdaFunctionConfigurationByArn(outputs.ingestionLambdaArn.value);

            const ingestionLogGroupName = TestUtils.getLambdaLogGroupName(ingestionLambda!.FunctionName!);

            // Get log streams and analyze processing logs using helpers
            const logStreams = await awsHelper.describeLogStreams(ingestionLogGroupName, {
                orderBy: "LastEventTime",
                descending: true,
                limit: 5
            });

            const logAnalysis = await TestUtils.collectAndParseLambdaLogs(
                awsHelper,
                ingestionLogGroupName,
                logStreams,
                documentFileName,
                {
                    maxStreams: 3,
                    timeWindowMinutes: 5,
                    maxEvents: 100
                }
            );

            console.log(`Found ${logAnalysis.logMessages.length} ingestion log messages`);
            console.log(`Processing evidence: ${logAnalysis.successFound ? '✓' : '✗'}`);
            
            if (!logAnalysis.successFound && logAnalysis.logMessages.length > 0) {
                console.log("Processing evidence not found in logs. Sample logs:");
                logAnalysis.logMessages.slice(0, 3).forEach((log, i) => {
                    console.log(`${i + 1}. ${log.substring(0, 100)}...`);
                });
            }

            const processingEvidence = logAnalysis.successFound;

            console.log(`\n=== STEP 4: Test Query API ===`);
            
            // Test various queries about the document content
            const testQueries = [
                {
                    query: "What is the main topic of this document?",
                    expectedKeywords: ["artificial intelligence", "AI", "healthcare", "medical"]
                },
                {
                    query: "What are the key benefits of AI in healthcare?",
                    expectedKeywords: ["diagnostic accuracy", "personalization", "efficiency", "95%"]
                },
                {
                    query: "What challenges does AI in healthcare face?",
                    expectedKeywords: ["data privacy", "HIPAA", "implementation costs", "training"]
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
                
                const queryLogAnalysis = await TestUtils.collectAndParseLambdaLogs(
                    awsHelper,
                    queryLogGroupName,
                    queryLogStreams,
                    "query",
                    {
                        maxStreams: 3,
                        timeWindowMinutes: 3,
                        maxEvents: 50
                    }
                );
                
                console.log(`Found ${queryLogAnalysis.logMessages.length} query log messages`);
                console.log(`Query processing evidence found: ${queryLogAnalysis.successFound ? '✓' : '✗'}`);
            }

            console.log(`\n=== RESULTS SUMMARY ===`);
            console.log(`Document: ${documentFileName}`);
            console.log(`Processing evidence: ${processingEvidence ? '✓' : '✗'}`);
            console.log(`Successful queries: ${successfulQueries}/${testQueries.length}`);
            console.log(`Overall success rate: ${((successfulQueries / testQueries.length) * 100).toFixed(1)}%`);

            // Print query results
            queryResponses.forEach((result, index) => {
                console.log(`\nQuery ${index + 1}: ${result.query}`);
                console.log(`Success: ${result.success ? '✓' : '✗'}`);
                if (result.success && typeof result.response === 'object') {
                    console.log(`Response: ${JSON.stringify(result.response).substring(0, 200)}...`);
                }
            });

            // Assertions for the complete pipeline
            expect(processingEvidence || logAnalysis.logMessages.length > 0, "Should find evidence of document processing").to.be.true;
            expect(successfulQueries, "Should have at least one successful query").to.be.greaterThan(0);
            
            // Check for catastrophic failures in logs
            const hasCatastrophicFailures = TestUtils.checkForCatastrophicFailures(logAnalysis.logMessages);
            if (hasCatastrophicFailures) {
                console.log("\n⚠️ Warning: Catastrophic failures detected in Lambda logs");
            }
            
            // If we have both processing and successful queries, the pipeline is working
            if (processingEvidence && successfulQueries > 0) {
                console.log("\n🎉 Complete RAG pipeline successfully validated!");
            } else if (successfulQueries > 0) {
                console.log("\n✅ Pipeline partially validated - queries working");
            } else {
                console.log("\n⚠️ Pipeline validation incomplete - check Lambda implementations");
            }
        });

        it("should handle multiple documents and maintain query context", async function() {
            this.timeout(480000); // 8 minutes

            const bucketName = outputs.inputBucketName.value;
            const apiEndpoint = outputs.queryApiEndpoint.value;

            // Create multiple related documents using TestUtils
            const documents = [
                {
                    name: TestUtils.generateTestFileName("healthcare-ai-part1"),
                    content: TestUtils.createTestDocumentContent(
                        "Healthcare AI - Part 1: Diagnostics",
                        `AI in medical diagnostics has achieved remarkable success rates.
Radiology AI systems now detect lung cancer with 94% accuracy.
Dermatology AI can identify skin cancer better than dermatologists.
Cardiology AI predicts heart attacks 5 years in advance.

Key diagnostic applications:
- Medical imaging analysis
- Pathology slide examination  
- ECG interpretation
- Blood test analysis`
                    )
                },
                {
                    name: TestUtils.generateTestFileName("healthcare-ai-part2"),
                    content: TestUtils.createTestDocumentContent(
                        "Healthcare AI - Part 2: Treatment",
                        `AI-powered treatment recommendations are transforming patient care.
Precision medicine uses AI to analyze genetic profiles.
Drug discovery AI reduces development time from 10 years to 3 years.
Robotic surgery AI improves precision by 40%.

Treatment innovations:
- Personalized therapy selection
- Dose optimization
- Surgical assistance
- Recovery monitoring`
                    )
                }
            ];

            console.log(`\n=== Uploading Multiple Documents ===`);
            
            // Upload all documents using TestUtils
            await TestUtils.uploadDocuments(awsHelper, bucketName, documents);
            console.log(`Uploaded ${documents.length} documents successfully`);

            // Wait for processing
            console.log("\nWaiting for multi-document processing...");
            await TestUtils.waitForProcessing('short');

            console.log(`\n=== Testing Cross-Document Queries ===`);
            
            // Test queries that should find information across documents
            const crossDocumentQueries = [
                {
                    query: "What are the accuracy rates mentioned for AI diagnostics?",
                    expectedContent: ["94%", "accuracy", "lung cancer", "radiology"]
                },
                {
                    query: "How does AI improve drug discovery and surgery?",
                    expectedContent: ["3 years", "10 years", "40%", "precision", "surgical"]
                },
                {
                    query: "What are the main healthcare AI applications mentioned?",
                    expectedContent: ["diagnostic", "treatment", "medical imaging", "drug discovery"]
                }
            ];

            let crossDocumentSuccesses = 0;

            for (const testQuery of crossDocumentQueries) {
                console.log(`\nTesting cross-document query: "${testQuery.query}"`);
                
                try {
                    const response = await queryAPI(apiEndpoint, testQuery.query);
                    
                    if (response.success) {
                        const responseText = JSON.stringify(response.data).toLowerCase();
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
            
            // Count processing events for uploaded documents
            const functions = await awsHelper.listLambdaFunctions();
            const pipelineFunctions = TestUtils.findPipelineLambdaFunctions(functions);
            const ingestionFunction = pipelineFunctions.ingestion;
            
            if (ingestionFunction) {
                const ingestionLogGroupName = TestUtils.getLambdaLogGroupName(ingestionFunction.FunctionName!);
                const logStreams = await awsHelper.describeLogStreams(ingestionLogGroupName);
                const logAnalysis = await TestUtils.collectAndParseLambdaLogs(
                    awsHelper,
                    ingestionLogGroupName,
                    logStreams,
                    "healthcare-ai",
                    { timeWindowMinutes: 5 }
                );
                
                const documentNames = documents.map(d => d.name);
                const processedCount = TestUtils.countProcessingEvents(logAnalysis.logMessages, documentNames);
                console.log(`Documents processed: ${processedCount}/${documents.length}`);
            }
            
            // Verify multiple documents were processed
            expect(crossDocumentSuccesses, "Should successfully query across multiple documents").to.be.greaterThan(0);
        });
    });
});