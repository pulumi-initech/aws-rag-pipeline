import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface ServerlessAccessPolicyArgs {
    collectionName: pulumi.Input<string>;
    lambdaRoleArns: pulumi.Input<string>[];
}

export class ServerlessAccessPolicy extends pulumi.ComponentResource {
    public readonly policy: aws.opensearch.ServerlessAccessPolicy;

    constructor(name: string, args: ServerlessAccessPolicyArgs, opts?: pulumi.ComponentResourceOptions) {
        super("rag:ServerlessAccessPolicy", name, {}, opts);

        this.policy = new aws.opensearch.ServerlessAccessPolicy(`${name}-dap`, {
            name: `${args.collectionName}-dap`,
            type: "data",
            policy: pulumi.interpolate`[{
                "Rules": [{
                    "Resource": ["collection/${args.collectionName}"],
                    "Permission": ["aoss:CreateCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"],
                    "ResourceType": "collection"
                }, {
                    "Resource": ["index/${args.collectionName}/*"],
                    "Permission": ["aoss:CreateIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"],
                    "ResourceType": "index"
                }],
                "Principal": [${pulumi.output(args.lambdaRoleArns).apply(arns => arns.map(arn => `"${arn}"`).join(", "))}]
            }]`
        }, { parent: this});

        this.registerOutputs({
            policy: this.policy
        });
    }
}