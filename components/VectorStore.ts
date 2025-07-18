import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as pinecone from "@pinecone-database/pulumi";

const current = aws.getCallerIdentity({});
export const accountId = current.then(current => current.accountId);

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
        const collectionName = args.collectionName || `rag-${Math.random().toString(36).substring(2, 8)}`;

        if (vectorStoreType === "opensearch") {
            // OpenSearch Serverless security policies
            const securityPolicies = [
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-encryption-policy`, {
                    name: `${collectionName}-enc`,
                    type: "encryption",
                    policy: JSON.stringify({
                        Rules: [{ ResourceType: "collection", Resource: [`collection/${collectionName}*`] }],
                        AWSOwnedKey: true
                    })
                }, { parent: this }),
                new aws.opensearch.ServerlessSecurityPolicy(`${name}-network-policy`, {
                    name: `${collectionName}-net`,
                    type: "network",
                    policy: JSON.stringify([{
                        Rules: [
                            { ResourceType: "collection", Resource: [`collection/${collectionName}*`] },
                            { ResourceType: "dashboard", Resource: [`collection/${collectionName}*`] }
                        ],
                        AllowFromPublic: true
                    }])
                }, { parent: this })
            ];

            this.collection = new aws.opensearch.ServerlessCollection(`${name}-collection`, {
                name: collectionName,
                type: "VECTORSEARCH",
            }, { parent: this, dependsOn: securityPolicies });

            // Create data access policy with exact collection name
            new aws.opensearch.ServerlessAccessPolicy(`${name}-data-access-policy`, {
                name: `${collectionName}-data`,
                type: "data",
                policy: pulumi.interpolate`[{
                    "Rules": [{
                        "Resource": ["collection/${collectionName}"],
                        "Permission": ["aoss:CreateCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"],
                        "ResourceType": "collection"
                    }, {
                        "Resource": ["index/${collectionName}/*"],
                        "Permission": ["aoss:CreateIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"],
                        "ResourceType": "index"
                    }],
                    "Principal": ["arn:aws:iam::${accountId}:role/ingestion-lambda-role", "arn:aws:iam::${accountId}:role/query-lambda-role"]
                }]`
            }, { parent: this, dependsOn: [this.collection] });

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
        };

        this.registerOutputs({
            endpoint: this.endpoint,
            collectionArn: this.collectionArn,
            indexName: this.indexName,
            config: this.config,
        });
    }

}