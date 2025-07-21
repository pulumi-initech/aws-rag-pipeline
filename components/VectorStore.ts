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
    public readonly collectionName?: string;

    constructor(name: string, args: VectorStoreArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("rag:VectorStore", name, {}, opts);

        const vectorStoreType = args.type || "opensearch";
        this.collectionName =  args.collectionName || `rag-collection`;

        if (vectorStoreType === "opensearch") {
            // OpenSearch Serverless security policies
            const securityPolicies = [
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-encryption-policy`, {
                    name: `${this.collectionName}-enc`,
                    type: "encryption",
                    policy: JSON.stringify({
                        Rules: [{ ResourceType: "collection", Resource: [`collection/${this.collectionName}*`] }],
                        AWSOwnedKey: true
                    })
                }, { parent: this }),
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-network-policy`, {
                    name: `${this.collectionName}-net`,
                    type: "network",
                    policy: JSON.stringify([{
                        Rules: [
                            { ResourceType: "collection", Resource: [`collection/${this.collectionName}*`] },
                            { ResourceType: "dashboard", Resource: [`collection/${this.collectionName}*`] }
                        ],
                        AllowFromPublic: true
                    }])
                }, { parent: this })
            ];

            this.collection = new aws.opensearch.ServerlessCollection(`${name}-collection`, {
                name: this.collectionName,
                type: "VECTORSEARCH",
            }, { parent: this, dependsOn: securityPolicies });

            this.endpoint = this.collection.collectionEndpoint;
            this.collectionArn = this.collection.arn;
        } else if (vectorStoreType === "pinecone") {
            const indexName = args.indexName || `rag-pipeline-${Math.random().toString(36).substring(2, 11)}`;
            
            this.pineconeIndex = new pinecone.PineconeIndex(`${name}-index`, {
                name: indexName,
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
            collectionName: vectorStoreType === "opensearch" ? this.collectionName : undefined,
        };

        this.registerOutputs({
            config: this.config,
        });
    }

}