// Import removed - not used

export interface LogAnalysis {
    processingFound: boolean;
    successFound: boolean;
    errorFound: boolean;
    logCount: number;
}

export interface ValidationResult {
    hasInputBucketName: boolean;
    hasApiEndpoint: boolean;
    hasVectorStoreEndpoint: boolean;
    hasVectorStoreType: boolean;
    correctVectorStoreType: boolean;
    validEndpointFormat: boolean;
}

export interface PolicyAnalysis {
    hasOpenSearchPermissions: boolean;
    hasLoggingPermissions: boolean;
    hasBedrockPermissions: boolean;
    statementCount: number;
    policyDocument: any;
}

 export interface LambdaS3InvokePermission {
    Sid: string;
    Effect: string;
    Principal: {
        Service: string;
    };
    Action: string;
    Resource: string;
    Condition: {
        ArnLike: {
            [key: string]: string;
        };
    };
}
/**
 * Test utilities - contains business logic and test-specific helpers
 */
export class TestUtils {
    /**
     * Wait for a specified duration
     */
    static async wait(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    /**
     * Wait for processing with common timeout patterns
     */
    static async waitForProcessing(type: 'short' | 'medium' | 'long' = 'medium'): Promise<void> {
        const timeouts = {
            short: 15000,   // 15 seconds
            medium: 30000,  // 30 seconds
            long: 90000     // 90 seconds
        };
        return this.wait(timeouts[type]);
    }

    /**
     * Find resources by name pattern
     */
    static findResourceByNamePattern<T>(
        resources: T[], 
        nameField: keyof T, 
        pattern: string
    ): T | undefined {
        return resources.filter(resource => {
            const name = resource[nameField];
            return typeof name === 'string' && name.includes(pattern);
        })[0];
    }

    /**
     * Find single resource by name pattern
     */
    static findSingleResourceByNamePattern<T>(
        resources: T[], 
        nameField: keyof T, 
        pattern: string
    ): T | undefined {
        return resources.find(resource => {
            const name = resource[nameField];
            return typeof name === 'string' && name.includes(pattern);
        });
    }

    /**
     * Find pipeline Lambda functions (ingestion and query)
     */
    static findPipelineLambdaFunctions(functions: any[]) {
        const ingestionFunction = this.findSingleResourceByNamePattern(
            functions, 
            'FunctionName', 
            'ingestion-lambda'
        );
        const queryFunction = this.findSingleResourceByNamePattern(
            functions, 
            'FunctionName', 
            'query-lambda'
        );

        return {
            ingestion: ingestionFunction,
            query: queryFunction,
            all: functions
        };
    }

    /**
     * Find pipeline IAM roles (ingestion and query)
     */
    static findRoleByRoleName(roles: any[], role: string) {
        const found = this.findSingleResourceByNamePattern(
            roles, 
            'RoleName', 
            role
        );

        return found;
    }

    /**
     * Check if S3 bucket exists in bucket list
     */
    static bucketExists(buckets: any[], bucketName: string): boolean {
        return buckets.some(bucket => bucket.Name === bucketName);
    }

    /**
     * Analyze IAM policy for common permissions
     */
    static analyzePolicyPermissions(policy: any): PolicyAnalysis {
        const policyDocument = JSON.parse(decodeURIComponent(policy.PolicyDocument!));

        // Analyze policy for common permissions
        const hasOpenSearchPermissions = policyDocument.Statement.some((statement: any) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.some((action: string) => action.includes("aoss:"));
        });

        const hasLoggingPermissions = policyDocument.Statement.some((statement: any) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.includes("logs:CreateLogGroup") &&
                   actions.includes("logs:CreateLogStream") &&
                   actions.includes("logs:PutLogEvents");
        });

        const hasBedrockPermissions = policyDocument.Statement.some((statement: any) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.includes("bedrock:InvokeModel");
        });

        return {
            hasOpenSearchPermissions,
            hasLoggingPermissions,
            hasBedrockPermissions,
            statementCount: policyDocument.Statement.length,
            policyDocument
        };
    }

    /**
     * Analyze logs for processing evidence
     */
    static analyzeLogsForProcessing(logs: string[], fileName: string): LogAnalysis {
        const processingFound = logs.some(log => 
            log.includes(fileName) || 
            log.includes("processed") || 
            log.includes("ingested") ||
            log.includes("completed")
        );

        const successFound = logs.some(log => 
            log.includes("successfully") || 
            log.includes("completed") ||
            log.includes("processed") ||
            log.includes("ingested")
        );

        const errorFound = logs.some(log => 
            log.includes("ERROR") || 
            log.includes("Failed") ||
            log.includes("Exception") ||
            log.includes("Error:")
        );

        return {
            processingFound,
            successFound,
            errorFound,
            logCount: logs.length
        };
    }

    /**
     * Validate pipeline outputs structure and content
     */
    static validatePipelineOutputs(outputs: any, expectedVectorStoreType: string = "opensearch"): ValidationResult {

        const results = {
            hasInputBucketName: Object.prototype.hasOwnProperty.call(outputs, "inputBucketName"),
            hasApiEndpoint: Object.prototype.hasOwnProperty.call(outputs, "apiEndpoint") || Object.prototype.hasOwnProperty.call(outputs, "queryApiEndpoint"),
            hasVectorStoreEndpoint: Object.prototype.hasOwnProperty.call(outputs, "vectorStoreEndpoint"),
            hasVectorStoreType: Object.prototype.hasOwnProperty.call(outputs, "vectorStoreType") || Object.prototype.hasOwnProperty.call(outputs, "configuredVectorStoreType"),
           correctVectorStoreType: false,
            validEndpointFormat: false
        };

        // Check vector store type
        const vectorStoreType = outputs.vectorStoreType?.value || outputs.configuredVectorStoreType;
        results.correctVectorStoreType = vectorStoreType === expectedVectorStoreType;

        // Check endpoint format
        const endpoint = outputs.vectorStoreEndpoint?.value || outputs.vectorStoreEndpoint;
        if (expectedVectorStoreType === "opensearch") {
            results.validEndpointFormat = endpoint?.includes("aoss.amazonaws.com") || false;
        } else if (expectedVectorStoreType === "pinecone") {
            results.validEndpointFormat = endpoint?.includes("pinecone.io") || false;
        }

        return results;
    }

    /**
     * Validate Lambda function configuration
     */
    static validateLambdaConfiguration(
        functionConfig: any, 
        expectedConfig: {
            runtime?: string;
            handler?: string;
            state?: string;
            environment?: Record<string, string>;
        }
    ) {
        const config = functionConfig.Configuration || functionConfig;
        const results = {
            runtime: config.Runtime === expectedConfig.runtime,
            handler: config.Handler === expectedConfig.handler,
            state: config.State === expectedConfig.state,
            environment: true
        };

        // Check environment variables if provided
        if (expectedConfig.environment) {
            const envVars = config.Environment?.Variables || {};
            for (const [key, value] of Object.entries(expectedConfig.environment)) {
                if (envVars[key] !== value) {
                    results.environment = false;
                    break;
                }
            }
        }

        return results;
    }

    /**
     * Generate unique test file name
     */
    static generateTestFileName(prefix: string = "test-document", extension: string = "txt"): string {
        const timestamp = Date.now();
        return `${prefix}-${timestamp}.${extension}`;
    }

    /**
     * Create comprehensive test document content
     */
    static createTestDocumentContent(title: string, additionalContent: string = ""): string {
        const timestamp = Date.now();
        return `
# ${title}

## Test Document Information
- Created: ${new Date().toISOString()}
- Test ID: ${timestamp}
- Purpose: Integration testing for RAG pipeline

## Content
This is a test document for the RAG pipeline integration tests.
It contains structured content to verify document processing capabilities.

${additionalContent}

## Keywords
test, document, integration, pipeline, processing, verification

---
Document ID: ${timestamp}
        `.trim();
    }

    /**
     * Collect all log messages from multiple log streams
     */
    static async collectLogsFromStreams(
        awsHelper: any, 
        logGroupName: string, 
        logStreams: any[], 
        options: { 
            searchTerm?: string; 
            minutes?: number; 
            limit?: number;
            maxStreams?: number;
        } = {}
    ): Promise<string[]> {
        const {
            searchTerm = "",
            minutes = 5,
            limit = 100,
            maxStreams = 3
        } = options;

        const allLogs: string[] = [];
        const cutoffTime = Date.now() - (minutes * 60 * 1000);

        for (const logStream of logStreams.slice(0, maxStreams)) {
            try {
                const logEvents = await awsHelper.getLogEvents(
                    logGroupName,
                    logStream.logStreamName!,
                    {
                        startTime: cutoffTime,
                        limit: limit
                    }
                );

                for (const event of logEvents) {
                    if (event.message && (searchTerm === "" || event.message.includes(searchTerm))) {
                        allLogs.push(event.message);
                    }
                }
            } catch (error) {
                console.log(`Could not read log stream ${logStream.logStreamName}: ${error}`);
            }
        }

        return allLogs;
    }

    /**
     * Get Lambda function log group name
     */
    static getLambdaLogGroupName(functionName: string): string {
        return `/aws/lambda/${functionName}`;
    }

    /**
     * Upload multiple documents concurrently
     */
    static async uploadDocuments(
        awsHelper: any,
        bucketName: string, 
        documents: Array<{name: string, content: string, contentType?: string}>
    ): Promise<void> {
        const uploadPromises = documents.map(doc => 
            awsHelper.putS3Object(bucketName, doc.name, doc.content, doc.contentType || "text/plain")
        );
        await Promise.all(uploadPromises);
    }

    /**
     * Check for catastrophic Lambda failures in logs
     */
    static checkForCatastrophicFailures(logs: string[]): boolean {
        return logs.some(msg => 
            msg.includes("TIMEOUT") || 
            msg.includes("OUT_OF_MEMORY") ||
            msg.includes("Task timed out")
        );
    }

    /**
     * Count processing events for specific files in logs
     */
    static countProcessingEvents(logs: string[], fileNames: string[]): number {
        return fileNames.reduce((count, fileName) => {
            return count + (logs.some(msg => msg.includes(fileName)) ? 1 : 0);
        }, 0);
    }

    /**
     * Clear vector store index based on type
     */
    static async clearVectorStoreIndex(
        awsHelper: any,
        vectorStoreType: string,
        endpoint: string,
        indexName: string
    ): Promise<void> {
        if (vectorStoreType === 'opensearch') {
            await awsHelper.clearOpenSearchIndex(endpoint, indexName);
        } else if (vectorStoreType === 'pinecone') {
            console.log('Pinecone index clearing not implemented yet');
            // TODO: Implement Pinecone index clearing
        } else {
            throw new Error(`Unsupported vector store type: ${vectorStoreType}`);
        }
    }

    /**
     * Get document count from vector store
     */
    static async getVectorStoreDocumentCount(
        awsHelper: any,
        vectorStoreType: string,
        endpoint: string,
        indexName: string
    ): Promise<number> {
        if (vectorStoreType === 'opensearch') {
            return await awsHelper.getOpenSearchIndexDocumentCount(endpoint, indexName);
        } else if (vectorStoreType === 'pinecone') {
            console.log('Pinecone document count not implemented yet');
            return 0;
            // TODO: Implement Pinecone document count
        } else {
            throw new Error(`Unsupported vector store type: ${vectorStoreType}`);
        }
    }

    /**
     * Setup clean test environment by clearing vector store
     */
    static async setupCleanTestEnvironment(
        awsHelper: any,
        outputs: any,
        vectorStoreType: string = 'opensearch'
    ): Promise<void> {
        try {
            const endpoint = outputs.vectorStoreEndpoint?.value || outputs.vectorStoreEndpoint;
            const indexName = outputs.indexName?.value || 'rag-documents-v2';
            
            console.log(`Setting up clean test environment for ${vectorStoreType}...`);
            console.log(`Endpoint: ${endpoint}`);
            console.log(`Index: ${indexName}`);
            
            // Get document count before clearing
            const docCountBefore = await this.getVectorStoreDocumentCount(
                awsHelper, vectorStoreType, endpoint, indexName
            );
            
            console.log(`Documents before clearing: ${docCountBefore}`);
            
            if (docCountBefore > 0) {
                await this.clearVectorStoreIndex(awsHelper, vectorStoreType, endpoint, indexName);
                console.log('Vector store index cleared for clean test state');
                
                // Wait a moment for the operation to complete
                await this.wait(2000);
                
                // Verify clearing worked
                const docCountAfter = await this.getVectorStoreDocumentCount(
                    awsHelper, vectorStoreType, endpoint, indexName
                );
                console.log(`Documents after clearing: ${docCountAfter}`);
            } else {
                console.log('Index already empty, no clearing needed');
            }
        } catch (error: any) {
            console.log(`Error setting up clean test environment: ${error.message || error}`);
            // Don't fail the test setup for index clearing issues
        }
    }

    /**
     * Parse log streams for an event message
     */
    static parseLogStreamsForEvent(logMessages: string[]): string | undefined {
        let eventMessage: string | undefined = undefined;
        for (const message of logMessages) {
            if (message.includes("Received event: ")) {
                eventMessage = message;
            }
        }
        return eventMessage;;
    }


    /**
     * Parse log streams for processing indicators
     */
    static parseLogStreamsForProcessing(
        logMessages: string[],
        testFileName: string
    ): {
        successFound: boolean;
        errorFound: boolean;
    } {
        let successFound = false;
        let errorFound = false;

        for (const message of logMessages) {
            // Check for processing indicators
            if (message.includes(testFileName)) {
                 console.debug(`Found processing log: ${message}`);
            }

            // Check for success indicators
            if (message.includes("Successfully processed")) {
                successFound = true;
            }

            // Check for error indicators
            if (message.includes("ERROR") || 
                message.includes("Failed") ||
                message.includes("Exception") ||
                message.includes("Error:")) {
                errorFound = true;
               // console.debug(`Found error log: ${message}`);
            }
        }

        // We expect to find either processing logs or at least some Lambda execution logs
        const hasRelevantLogs = logMessages.some(msg => 
                                   msg.includes("START RequestId") || 
                                   msg.includes("END RequestId") ||
                                   msg.includes(testFileName)
                               );

        return {
            successFound: successFound && hasRelevantLogs,
            errorFound
        };
    }
}