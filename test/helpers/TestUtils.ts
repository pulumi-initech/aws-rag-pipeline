// Import removed - not used


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
    hasECRPermissions: boolean;
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
     * Wait for a specified duration (internal use only)
     */
    private static async wait(milliseconds: number): Promise<void> {
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

        const hasECRPermissions = policyDocument.Statement.some((statement: any) => {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            return actions.includes("ecr:GetAuthorizationToken") &&
                   actions.includes("ecr:BatchCheckLayerAvailability") &&
                   actions.includes("ecr:GetDownloadUrlForLayer") &&
                   actions.includes("ecr:BatchGetImage");
        });

        return {
            hasOpenSearchPermissions,
            hasLoggingPermissions,
            hasBedrockPermissions,
            hasECRPermissions,
            statementCount: policyDocument.Statement.length,
            policyDocument
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

// Use native fetch for Node.js 18+
// @ts-ignore - globalThis.fetch is available in Node.js 18+
export const fetch = globalThis.fetch;

// Helper function to query the API
export async function queryAPI(apiEndpoint: string, query: string): Promise<{ success: boolean; data?: any; error?: string; }> {
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
