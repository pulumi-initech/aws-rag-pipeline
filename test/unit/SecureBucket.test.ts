import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { SecureBucket } from "../../components/SecureBucket.ts";

// Track created resources for validation
const createdResources: { type: string; name: string; inputs: any }[] = [];

// Set up runtime mocks for Pulumi resources
pulumi.runtime.setMocks({
    newResource: function (args: pulumi.runtime.MockResourceArgs) {
        // Store resource creation info for validation
        createdResources.push({
            type: args.type,
            name: args.name,
            inputs: args.inputs
        });

        const mockState = {
            ...args.inputs,
        };
        
        // Add specific mock outputs based on resource type
        if (args.type === "aws:s3/bucketV2:BucketV2") {
            mockState.id = args.inputs.bucketPrefix ? `${args.inputs.bucketPrefix}${Date.now()}` : `mock-bucket-${args.name}`;
            mockState.arn = `arn:aws:s3:::${mockState.id}`;
            mockState.bucket = mockState.id;
        } else if (args.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2") {
            mockState.bucket = args.inputs.bucket;
            mockState.rules = args.inputs.rules;
        } else if (args.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock") {
            mockState.bucket = args.inputs.bucket;
            mockState.blockPublicAcls = args.inputs.blockPublicAcls;
            mockState.blockPublicPolicy = args.inputs.blockPublicPolicy;
            mockState.ignorePublicAcls = args.inputs.ignorePublicAcls;
            mockState.restrictPublicBuckets = args.inputs.restrictPublicBuckets;
        } else if (args.type === "aws:s3/bucketLoggingV2:BucketLoggingV2") {
            mockState.bucket = args.inputs.bucket;
            mockState.targetBucket = args.inputs.targetBucket;
            mockState.targetPrefix = args.inputs.targetPrefix;
        }
        
        return {
            id: mockState.id || args.name,
            state: mockState,
        };
    },
    call: function (_args: pulumi.runtime.MockCallArgs) {
        // Mock function calls if needed
        return {};
    },
});

describe("SecureBucket Component", () => {
    // Clear resources before each test suite
    beforeEach(() => {
        createdResources.length = 0;
    });

    describe("Bucket Creation", () => {
        let secureBucket: SecureBucket;

        before(() => {
            secureBucket = new SecureBucket("test-secure-bucket", {
                name: "test-input"
            });
        });

        it("should create S3 bucket with correct configuration", () => {
            expect(secureBucket.bucket).to.not.be.undefined;
        });

        it("should use bucket prefix from args", () => {
            return secureBucket.bucket.bucketPrefix.apply(prefix => {
                expect(prefix).to.equal("test-input-");
            });
        });

        it("should enable force destroy", () => {
            return secureBucket.bucket.forceDestroy.apply(forceDestroy => {
                expect(forceDestroy).to.be.true;
            });
        });

        it("should include required tags", () => {
            return secureBucket.bucket.tags.apply(tags => {
                expect(tags).to.have.property("Name", "test-input");
                expect(tags).to.have.property("Environment", "production");
                expect(tags).to.have.property("Security", "encrypted");
            });
        });

        it("should export bucket name output", () => {
            return secureBucket.bucketName.apply(name => {
                expect(name).to.not.be.undefined;
                expect(name).to.be.a("string");
            });
        });

        it("should export bucket ARN output", () => {
            return secureBucket.bucketArn.apply(arn => {
                expect(arn).to.not.be.undefined;
                expect(arn).to.match(/^arn:aws:s3:::.+$/);
            });
        });
    });

    describe("Encryption Configuration", () => {
        before(() => {
            createdResources.length = 0;
            new SecureBucket("test-secure-bucket", {
                name: "test-encrypted"
            });
        });

        it("should create encryption configuration", () => {
            const encryptionResources = createdResources.filter(r => 
                r.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
            );
            expect(encryptionResources).to.have.lengthOf(1);
        });

        it("should use AWS KMS encryption", () => {
            const encryptionResource = createdResources.find(r => 
                r.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
            );
            
            expect(encryptionResource).to.not.be.undefined;
            expect(encryptionResource!.inputs.rules).to.have.lengthOf(1);
            expect(encryptionResource!.inputs.rules[0].applyServerSideEncryptionByDefault.sseAlgorithm).to.equal("aws:kms");
        });

        it("should enable bucket key", () => {
            const encryptionResource = createdResources.find(r => 
                r.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
            );
            
            expect(encryptionResource!.inputs.rules[0].bucketKeyEnabled).to.be.true;
        });
    });

    describe("Public Access Block", () => {
        before(() => {
            createdResources.length = 0;
            new SecureBucket("test-secure-bucket", {
                name: "test-public-block"
            });
        });

        it("should create public access block configuration", () => {
            const publicAccessResources = createdResources.filter(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            expect(publicAccessResources).to.have.lengthOf(1);
        });

        it("should block all public ACLs", () => {
            const publicAccessResource = createdResources.find(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            
            expect(publicAccessResource!.inputs.blockPublicAcls).to.be.true;
        });

        it("should block public policy", () => {
            const publicAccessResource = createdResources.find(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            
            expect(publicAccessResource!.inputs.blockPublicPolicy).to.be.true;
        });

        it("should ignore public ACLs", () => {
            const publicAccessResource = createdResources.find(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            
            expect(publicAccessResource!.inputs.ignorePublicAcls).to.be.true;
        });

        it("should restrict public buckets", () => {
            const publicAccessResource = createdResources.find(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            
            expect(publicAccessResource!.inputs.restrictPublicBuckets).to.be.true;
        });
    });

    describe("Access Logging", () => {
        before(() => {
            createdResources.length = 0;
            new SecureBucket("test-secure-bucket", {
                name: "test-logging"
            });
        });

        it("should create access log bucket", () => {
            const logBuckets = createdResources.filter(r => 
                r.type === "aws:s3/bucketV2:BucketV2" && 
                r.name.includes("access-logs")
            );
            expect(logBuckets).to.have.lengthOf(1);
        });

        it("should configure log bucket with correct prefix", () => {
            const logBucket = createdResources.find(r => 
                r.type === "aws:s3/bucketV2:BucketV2" && 
                r.name.includes("access-logs")
            );
            
            expect(logBucket!.inputs.bucketPrefix).to.equal("test-logging-logs-");
        });

        it("should tag log bucket appropriately", () => {
            const logBucket = createdResources.find(r => 
                r.type === "aws:s3/bucketV2:BucketV2" && 
                r.name.includes("access-logs")
            );
            
            expect(logBucket!.inputs.tags).to.have.property("Purpose", "s3-access-logging");
        });

        it("should create logging configuration", () => {
            const loggingResources = createdResources.filter(r => 
                r.type === "aws:s3/bucketLoggingV2:BucketLoggingV2"
            );
            expect(loggingResources).to.have.lengthOf(1);
        });

        it("should configure logging with correct target prefix", () => {
            const loggingResource = createdResources.find(r => 
                r.type === "aws:s3/bucketLoggingV2:BucketLoggingV2"
            );
            
            expect(loggingResource!.inputs.targetPrefix).to.equal("access-logs/");
        });
    });

    describe("Component Resource Configuration", () => {
        it("should use correct component resource type", () => {
            const secureBucket = new SecureBucket("test-secure-bucket", {
                name: "test-component"
            });

            expect(secureBucket).to.be.instanceOf(pulumi.ComponentResource);
        });

        it("should handle empty args", () => {
            const secureBucket = new SecureBucket("test-secure-bucket-no-args");

            expect(secureBucket.bucket).to.not.be.undefined;
            expect(secureBucket.bucketName).to.not.be.undefined;
            expect(secureBucket.bucketArn).to.not.be.undefined;
        });

        it("should register outputs correctly", () => {
            const secureBucket = new SecureBucket("test-secure-bucket", {
                name: "test-outputs"
            });

            return pulumi.all([
                secureBucket.bucketName,
                secureBucket.bucketArn
            ]).apply(([name, arn]) => {
                expect(name).to.not.be.undefined;
                expect(arn).to.not.be.undefined;
            });
        });
    });

    describe("Security Best Practices", () => {
        before(() => {
            createdResources.length = 0;
            new SecureBucket("test-secure-bucket", {
                name: "test-security"
            });
        });

        it("should create all required security resources", () => {
            const mainBucket = createdResources.filter(r => 
                r.type === "aws:s3/bucketV2:BucketV2" && !r.name.includes("access-logs")
            );
            const encryption = createdResources.filter(r => 
                r.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
            );
            const publicAccess = createdResources.filter(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            const logging = createdResources.filter(r => 
                r.type === "aws:s3/bucketLoggingV2:BucketLoggingV2"
            );

            expect(mainBucket).to.have.lengthOf(1);
            expect(encryption).to.have.lengthOf(1);
            expect(publicAccess).to.have.lengthOf(1);
            expect(logging).to.have.lengthOf(1);
        });

        it("should enforce encryption at rest", () => {
            const encryptionResource = createdResources.find(r => 
                r.type === "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2"
            );
            
            expect(encryptionResource).to.not.be.undefined;
            expect(encryptionResource!.inputs.rules[0].applyServerSideEncryptionByDefault.sseAlgorithm).to.equal("aws:kms");
        });

        it("should prevent public access", () => {
            const publicAccessResource = createdResources.find(r => 
                r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock"
            );
            
            expect(publicAccessResource!.inputs.blockPublicAcls).to.be.true;
            expect(publicAccessResource!.inputs.blockPublicPolicy).to.be.true;
            expect(publicAccessResource!.inputs.ignorePublicAcls).to.be.true;
            expect(publicAccessResource!.inputs.restrictPublicBuckets).to.be.true;
        });

        it("should enable audit logging", () => {
            const loggingResource = createdResources.find(r => 
                r.type === "aws:s3/bucketLoggingV2:BucketLoggingV2"
            );
            
            expect(loggingResource).to.not.be.undefined;
            expect(loggingResource!.inputs.targetBucket).to.not.be.undefined;
        });
    });
});