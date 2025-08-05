import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as pinecone from "@pinecone-database/pulumi";

export interface VectorStoreArgs {
    type?: "opensearch" | "pinecone";
    collectionName?: string;
    indexName?: string;
    dimension?: number;
    metric?: string;
    environment?: string;
}

export interface VectorStoreConfig {
    endpoint: pulumi.Output<string>;
    type: string;
    indexName: pulumi.Output<string>;
    collectionName?: string;
}

export class VectorStore extends pulumi.ComponentResource {
    public readonly endpoint: pulumi.Output<string>;
    public readonly collection?: aws.opensearch.ServerlessCollection;
    public readonly collectionArn?: pulumi.Output<string>;
    public readonly pineconeIndex?: pinecone.PineconeIndex;
    public readonly indexName?: pulumi.Output<string>;
    public readonly config: VectorStoreConfig;

    constructor(name: string, args: VectorStoreArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("rag:VectorStore", name, {}, opts);

        const vectorStoreType = args.type || "opensearch";
     
        if (vectorStoreType === "opensearch") {

            if (!args.collectionName) {
                throw new Error("OpenSearch collection requires a collectionName argument.");
            }

            if (!RegExp(/^[a-z][a-z0-9-]{2,31}$/).test(args.collectionName)) {
                throw new Error("OpenSearch collection names must be 3-32 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.");
            }
            
            // OpenSearch Serverless security policies
            const securityPolicies = [
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-encryption-policy`, {
                    name: `${args.collectionName}-enc`,
                    type: "encryption",
                    policy: JSON.stringify({
                        Rules: [{ ResourceType: "collection", Resource: [`collection/${args.collectionName}`] }],
                        AWSOwnedKey: true
                    })
                }, { parent: this }),
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-network-policy`, {
                    name: `${args.collectionName}-net`,
                    type: "network",
                    policy: JSON.stringify([{
                        Rules: [
                            { ResourceType: "collection", Resource: [`collection/${args.collectionName}`] },
                            { ResourceType: "dashboard", Resource: [`collection/${args.collectionName}`] }
                        ],
                        AllowFromPublic: true
                    }])
                }, { parent: this })
            ];

            this.collection = new aws.opensearch.ServerlessCollection(`${name}-collection`, {
                name: args.collectionName,
                type: "VECTORSEARCH",
            }, { parent: this, dependsOn: securityPolicies, deleteBeforeReplace: true });

            this.endpoint = this.collection.collectionEndpoint;
            this.collectionArn = this.collection.arn;
        } else if (vectorStoreType === "pinecone") {
            
            
            if (!args.dimension) {
                throw new Error("Pinecone index requires a dimension argument.");
            }

            if (!args.indexName){
                throw new Error("Pinecone index requires an indexName argument.");
            }

            // validate index name if provided
            if (args.indexName){
                if(!RegExp(/^[a-z][a-z0-9-]{2,62}$/).test(args.indexName)) {
                    throw new Error("Pinecone index names must be 3-63 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.");
                }       
            }
            
            this.pineconeIndex = new pinecone.PineconeIndex(`${name}-index`, {
                name: args.indexName,
                dimension: args.dimension || 1024,
                metric: (args.metric as any) || "cosine",
                spec: {
                    serverless: {
                        cloud: "aws",
                        region: "us-east-1"  // Use us-east-1 which is supported by free plan
                    }
                }
            }, { parent: this });

            this.endpoint = this.pineconeIndex.host;
            this.indexName = this.pineconeIndex.name;
        } else {
            throw new Error(`Unsupported vector store type: ${vectorStoreType}`);
        }

        // Create the combined config object
        this.config = {
            endpoint: this.endpoint,
            type: vectorStoreType,
            indexName: this.indexName || pulumi.output("rag-documents-v2"),
            collectionName: vectorStoreType === "opensearch" ? args.collectionName : undefined,
        };

        this.registerOutputs({
            config: this.config,
        });
    }

}