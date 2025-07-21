import { PolicyPack, validateResourceOfType } from "@pulumi/policy";

const policyPack = new PolicyPack("rag-pipeline-policies", {
    policies: [
        {
            name: "serverless-access-policy-required-for-opensearch",
            description: "ServerlessAccessPolicy must be created when using OpenSearch vector store",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find OpenSearch collections
                const openSearchCollections = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessCollection:ServerlessCollection"
                );
                
                // Find ServerlessAccessPolicy resources
                const serverlessAccessPolicies = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
                );
                
                // If we have OpenSearch collections, we must have access policies
                if (openSearchCollections.length > 0 && serverlessAccessPolicies.length === 0) {
                    reportViolation("ServerlessAccessPolicy is required when using OpenSearch Serverless collections. " +
                        "Found OpenSearch collections but no corresponding access policies.");
                }
                
                // Verify each OpenSearch collection has a corresponding access policy
                for (const collection of openSearchCollections) {
                    const collectionName = collection.props?.name;
                    if (collectionName) {
                        const hasMatchingPolicy = serverlessAccessPolicies.some(policy => {
                            const policyName = policy.props?.name;
                            // Policy name should include the collection name
                            return policyName && policyName.includes(collectionName);
                        });
                        
                        if (!hasMatchingPolicy) {
                            reportViolation(`OpenSearch collection '${collectionName}' requires a corresponding ServerlessAccessPolicy with matching name pattern.`);
                        }
                    }
                }
            },
        },
        {
            name: "serverless-access-policy-not-allowed-without-opensearch",
            description: "ServerlessAccessPolicy should not be created without OpenSearch collections",
            enforcementLevel: "advisory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find OpenSearch collections
                const openSearchCollections = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessCollection:ServerlessCollection"
                );
                
                // Find ServerlessAccessPolicy resources
                const serverlessAccessPolicies = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
                );
                
                // If we have access policies but no collections, warn
                if (serverlessAccessPolicies.length > 0 && openSearchCollections.length === 0) {
                    reportViolation("ServerlessAccessPolicy found without any OpenSearch Serverless collections. " +
                        "This may indicate unused resources or configuration issues.");
                }
            },
        },
        {
            name: "opensearch-collection-requires-security-policies",
            description: "OpenSearch collections must have encryption and network security policies",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find OpenSearch collections
                const openSearchCollections = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessCollection:ServerlessCollection"
                );
                
                // Find security policies
                const encryptionPolicies = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessSecurityPolicy:ServerlessSecurityPolicy" &&
                    r.props?.type === "encryption"
                );
                
                const networkPolicies = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessSecurityPolicy:ServerlessSecurityPolicy" &&
                    r.props?.type === "network"
                );
                
                for (const collection of openSearchCollections) {
                    const collectionName = collection.props?.name;
                    if (collectionName) {
                        // Check for encryption policy
                        const hasEncryptionPolicy = encryptionPolicies.some(policy => {
                            const policyName = policy.props?.name;
                            return policyName && policyName.includes(collectionName);
                        });
                        
                        // Check for network policy
                        const hasNetworkPolicy = networkPolicies.some(policy => {
                            const policyName = policy.props?.name;
                            return policyName && policyName.includes(collectionName);
                        });
                        
                        if (!hasEncryptionPolicy) {
                            reportViolation(`OpenSearch collection '${collectionName}' requires an encryption security policy`);
                        }
                        
                        if (!hasNetworkPolicy) {
                            reportViolation(`OpenSearch collection '${collectionName}' requires a network security policy`);
                        }
                    }
                }
            },
        },
        {
            name: "pinecone-no-opensearch-resources",
            description: "When using Pinecone, no OpenSearch resources should be created",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find Pinecone resources
                const pineconeResources = resources.filter(r => 
                    r.type.startsWith("pinecone:")
                );
                
                // Find OpenSearch resources
                const openSearchResources = resources.filter(r => 
                    r.type.startsWith("aws:opensearch/")
                );
                
                // If we have Pinecone resources, we shouldn't have OpenSearch resources
                if (pineconeResources.length > 0 && openSearchResources.length > 0) {
                    reportViolation("Found both Pinecone and OpenSearch resources. " +
                        "Only one vector store type should be used per deployment.");
                }
            },
        },
        {
            name: "lambda-roles-exist-for-access-policy",
            description: "Lambda roles must exist before creating ServerlessAccessPolicy",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find ServerlessAccessPolicy resources
                const serverlessAccessPolicies = resources.filter(r => 
                    r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
                );
                
                // Find Lambda roles
                const lambdaRoles = resources.filter(r => 
                    r.type === "aws:iam/role:Role" &&
                    r.props?.name && 
                    r.props.name.includes("lambda-role")
                );
                
                if (serverlessAccessPolicies.length > 0 && lambdaRoles.length === 0) {
                    reportViolation("ServerlessAccessPolicy requires Lambda roles to exist. " +
                        "No Lambda roles found that match expected naming pattern '*lambda-role*'");
                }
            },
        },
        {
            name: "vector-store-type-consistency",
            description: "Vector store configuration should be consistent throughout the stack",
            enforcementLevel: "advisory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources;
                
                // Find both vector store types
                const openSearchResources = resources.filter(r => 
                    r.type.startsWith("aws:opensearch/")
                );
                
                const pineconeResources = resources.filter(r => 
                    r.type.startsWith("pinecone:")
                );
                
                // Count resource types
                const hasOpenSearch = openSearchResources.length > 0;
                const hasPinecone = pineconeResources.length > 0;
                
                if (hasOpenSearch && hasPinecone) {
                    reportViolation("Mixed vector store configuration detected. " +
                        "Consider using only one vector store type for consistency.");
                } else if (!hasOpenSearch && !hasPinecone) {
                    reportViolation("No vector store resources found. " +
                        "RAG pipeline requires either OpenSearch or Pinecone configuration.");
                }
            },
        }
    ],
});

export default policyPack;