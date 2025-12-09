import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { ServerlessAccessPolicy } from "../../components/ServerlessAccessPolicy.ts";

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
        if (args.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy") {
            mockState.name = args.inputs.name;
            mockState.type = args.inputs.type;
            mockState.policy = args.inputs.policy;
            mockState.policyVersion = "1.0";
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

describe("ServerlessAccessPolicy Component", () => {
    // Clear resources before each test suite
    beforeEach(() => {
        createdResources.length = 0;
    });

    describe("Policy Creation", () => {
        let policy: ServerlessAccessPolicy;
        const mockLambdaRoleArns = [
            "arn:aws:iam::123456789012:role/ingestion-lambda-role",
            "arn:aws:iam::123456789012:role/query-lambda-role"
        ];

        before(() => {
            policy = new ServerlessAccessPolicy("test-access-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: mockLambdaRoleArns
            });
        });

        it("should create ServerlessAccessPolicy resource", () => {
            expect(policy.policy).to.not.be.undefined;
        });

        it("should use data access policy type", () => {
            return policy.policy.type.apply(type => {
                expect(type).to.equal("data");
            });
        });

        it("should name policy with -dap suffix", () => {
            return policy.policy.name.apply(name => {
                expect(name).to.include("-dap");
                expect(name).to.include("test-collection");
            });
        });
    });

    describe("Policy Document Structure", () => {
        const mockLambdaRoleArns = [
            "arn:aws:iam::123456789012:role/ingestion-lambda-role",
            "arn:aws:iam::123456789012:role/query-lambda-role"
        ];

        before(() => {
            createdResources.length = 0;
            new ServerlessAccessPolicy("test-access-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: mockLambdaRoleArns
            });
        });

        it("should create policy with correct structure", () => {
            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            expect(policyResource).to.not.be.undefined;
            expect(policyResource!.inputs.policy).to.not.be.undefined;
        });

        it("should include collection resource permissions", async () => {
            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            // The policy is a pulumi.Output, so we need to resolve it
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            expect(policyDoc).to.be.an("array");
            expect(policyDoc).to.have.lengthOf(1);
            
            const rules = policyDoc[0].Rules;
            const collectionRule = rules.find((r: any) => r.ResourceType === "collection");
            
            expect(collectionRule).to.not.be.undefined;
            expect(collectionRule.Resource).to.include("collection/test-collection");
            expect(collectionRule.Permission).to.include("aoss:CreateCollectionItems");
            expect(collectionRule.Permission).to.include("aoss:UpdateCollectionItems");
            expect(collectionRule.Permission).to.include("aoss:DescribeCollectionItems");
            expect(collectionRule.Permission).to.include("aoss:DeleteCollectionItems");
        });

        it("should include index resource permissions", async () => {
            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const rules = policyDoc[0].Rules;
            const indexRule = rules.find((r: any) => r.ResourceType === "index");
            
            expect(indexRule).to.not.be.undefined;
            expect(indexRule.Resource).to.include("index/test-collection/*");
            expect(indexRule.Permission).to.include("aoss:CreateIndex");
            expect(indexRule.Permission).to.include("aoss:UpdateIndex");
            expect(indexRule.Permission).to.include("aoss:DescribeIndex");
            expect(indexRule.Permission).to.include("aoss:DeleteIndex");
            expect(indexRule.Permission).to.include("aoss:ReadDocument");
            expect(indexRule.Permission).to.include("aoss:WriteDocument");
        });

        it("should include all Lambda role ARNs as principals", async () => {
            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const principals = policyDoc[0].Principal;
            
            expect(principals).to.be.an("array");
            expect(principals).to.have.lengthOf(2);
            expect(principals).to.include("arn:aws:iam::123456789012:role/ingestion-lambda-role");
            expect(principals).to.include("arn:aws:iam::123456789012:role/query-lambda-role");
        });
    });

    describe("Single Lambda Role", () => {
        it("should handle single Lambda role ARN", async () => {
            createdResources.length = 0;
            
            new ServerlessAccessPolicy("single-role-policy", {
                collectionName: "single-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/single-lambda-role"]
            });

            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const principals = policyDoc[0].Principal;
            
            expect(principals).to.be.an("array");
            expect(principals).to.have.lengthOf(1);
            expect(principals[0]).to.equal("arn:aws:iam::123456789012:role/single-lambda-role");
        });
    });

    describe("Multiple Lambda Roles", () => {
        it("should handle multiple Lambda role ARNs", async () => {
            createdResources.length = 0;
            
            const multipleRoles = [
                "arn:aws:iam::123456789012:role/ingestion-lambda-role",
                "arn:aws:iam::123456789012:role/query-lambda-role",
                "arn:aws:iam::123456789012:role/admin-lambda-role"
            ];

            new ServerlessAccessPolicy("multi-role-policy", {
                collectionName: "multi-collection",
                lambdaRoleArns: multipleRoles
            });

            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const principals = policyDoc[0].Principal;
            
            expect(principals).to.be.an("array");
            expect(principals).to.have.lengthOf(3);
            expect(principals).to.include.members(multipleRoles);
        });
    });

    describe("Collection Name Handling", () => {
        it("should use collection name in policy name", () => {
            const policy = new ServerlessAccessPolicy("test-policy", {
                collectionName: "my-rag-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            return policy.policy.name.apply(name => {
                expect(name).to.include("my-rag-collection");
                expect(name).to.equal("my-rag-collection-dap");
            });
        });

        it("should use collection name in resource patterns", async () => {
            createdResources.length = 0;
            
            new ServerlessAccessPolicy("test-policy", {
                collectionName: "custom-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const rules = policyDoc[0].Rules;
            const collectionRule = rules.find((r: any) => r.ResourceType === "collection");
            const indexRule = rules.find((r: any) => r.ResourceType === "index");
            
            expect(collectionRule.Resource[0]).to.equal("collection/custom-collection");
            expect(indexRule.Resource[0]).to.equal("index/custom-collection/*");
        });
    });

    describe("Component Resource Configuration", () => {
        it("should use correct component resource type", () => {
            const policy = new ServerlessAccessPolicy("test-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            expect(policy).to.be.instanceOf(pulumi.ComponentResource);
        });

        it("should register policy output", () => {
            const policy = new ServerlessAccessPolicy("test-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            expect(policy.policy).to.not.be.undefined;
        });
    });

    describe("Permission Completeness", () => {
        it("should include all required collection permissions", async () => {
            createdResources.length = 0;
            
            new ServerlessAccessPolicy("test-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const rules = policyDoc[0].Rules;
            const collectionRule = rules.find((r: any) => r.ResourceType === "collection");
            
            const requiredPermissions = [
                "aoss:CreateCollectionItems",
                "aoss:UpdateCollectionItems",
                "aoss:DescribeCollectionItems",
                "aoss:DeleteCollectionItems"
            ];
            
            requiredPermissions.forEach(permission => {
                expect(collectionRule.Permission).to.include(permission);
            });
        });

        it("should include all required index permissions", async () => {
            createdResources.length = 0;
            
            new ServerlessAccessPolicy("test-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            const policyResource = createdResources.find(r => 
                r.type === "aws:opensearch/serverlessAccessPolicy:ServerlessAccessPolicy"
            );
            
            const policyStr = await pulumi.output(policyResource!.inputs.policy).promise();
            const policyDoc = JSON.parse(policyStr);
            
            const rules = policyDoc[0].Rules;
            const indexRule = rules.find((r: any) => r.ResourceType === "index");
            
            const requiredPermissions = [
                "aoss:CreateIndex",
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
                "aoss:DeleteIndex",
                "aoss:ReadDocument",
                "aoss:WriteDocument"
            ];
            
            requiredPermissions.forEach(permission => {
                expect(indexRule.Permission).to.include(permission);
            });
        });
    });

    describe("Policy Type Validation", () => {
        it("should always use data policy type", () => {
            const policy = new ServerlessAccessPolicy("test-policy", {
                collectionName: "test-collection",
                lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
            });

            return policy.policy.type.apply(type => {
                expect(type).to.equal("data");
                expect(type).to.not.equal("network");
                expect(type).to.not.equal("encryption");
            });
        });
    });

    describe("Naming Convention", () => {
        it("should follow -dap naming convention", () => {
            const testCases = [
                { collection: "rag-docs", expected: "rag-docs-dap" },
                { collection: "test-collection", expected: "test-collection-dap" },
                { collection: "my-index", expected: "my-index-dap" }
            ];

            testCases.forEach(testCase => {
                const policy = new ServerlessAccessPolicy(`policy-${testCase.collection}`, {
                    collectionName: testCase.collection,
                    lambdaRoleArns: ["arn:aws:iam::123456789012:role/test-role"]
                });

                return policy.policy.name.apply(name => {
                    expect(name).to.equal(testCase.expected);
                });
            });
        });
    });
});
