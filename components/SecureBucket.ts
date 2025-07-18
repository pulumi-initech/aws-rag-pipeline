import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface SecureBucketArgs {
    name?: string;
    encryptionKey?: aws.kms.Key;
}

export class SecureBucket extends pulumi.ComponentResource {
    public readonly bucket: aws.s3.BucketV2;
    public readonly bucketName: pulumi.Output<string>;
    public readonly bucketArn: pulumi.Output<string>;

    constructor(name: string, args: SecureBucketArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("rag:SecureBucket", name, {}, opts);

        // Create the S3 bucket
        this.bucket = new aws.s3.BucketV2(`${name}-bucket`, {
            bucket: args.name,
            tags: {
                Name: `${name}-secure-bucket`,
                Environment: "production",
                Security: "encrypted",
            },
        }, { parent: this });

        // Configure server-side encryption with default AWS managed KMS key
        new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-encryption`, {
            bucket: this.bucket.id,
            rules: [{
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: "aws:kms",
                },
                bucketKeyEnabled: true,
            }],
        }, { parent: this.bucket });

        // Block all public access
        new aws.s3.BucketPublicAccessBlock(`${name}-public-access-block`, {
            bucket: this.bucket.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
        }, { parent: this.bucket });

        // Enable access logging
        const accessLogBucket = new aws.s3.BucketV2(`${name}-access-logs`, {
            bucket: `${name}-access-logs`,
            tags: {
                Name: `${name}-access-logs`,
                Purpose: "s3-access-logging",
            },
        }, { parent: this.bucket });

        new aws.s3.BucketLoggingV2(`${name}-logging`, {
            bucket: this.bucket.id,
            targetBucket: accessLogBucket.id,
            targetPrefix: "access-logs/",
        }, { parent: this.bucket });

        this.bucketName = this.bucket.id;
        this.bucketArn = this.bucket.arn;

        this.registerOutputs({
            bucketName: this.bucketName,
            bucketArn: this.bucketArn
        });
    }
}