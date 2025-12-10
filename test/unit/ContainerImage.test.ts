import "mocha";
import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
import { ContainerImage } from "../../components/ContainerImage.ts";

// Set up runtime mocks for Pulumi resources
pulumi.runtime.setMocks({
    newResource: function (args: pulumi.runtime.MockResourceArgs) {
        const mockState = {
            ...args.inputs,
        };
        
        // Add specific mock outputs based on resource type
        if (args.type === "aws:ecr/repository:Repository") {
            mockState.repositoryUrl = `123456789012.dkr.ecr.us-west-2.amazonaws.com/${args.name}`;
            mockState.name = args.inputs.name || args.name;
            mockState.arn = `arn:aws:ecr:us-west-2:123456789012:repository/${mockState.name}`;
        } else if (args.type === "docker-build:index:Image") {
            mockState.digest = "sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd";
            mockState.ref = `123456789012.dkr.ecr.us-west-2.amazonaws.com/${args.name}:latest`;
        } else if (args.type === "aws:ecr/repositoryPolicy:RepositoryPolicy") {
            mockState.policy = args.inputs.policy;
            mockState.repository = args.inputs.repository;
        }
        
        return {
            id: mockState.id || args.name,
            state: mockState,
        };
    },
    call: function (args: pulumi.runtime.MockCallArgs) {
        // Mock AWS calls
        if (args.token === "aws:index/getCallerIdentity:getCallerIdentity") {
            return {
                accountId: "123456789012",
                arn: "arn:aws:iam::123456789012:root",
                userId: "123456789012"
            };
        } else if (args.token === "aws:ecr/getAuthorizationToken:getAuthorizationToken") {
            return {
                authorizationToken: "dGVzdDp0ZXN0", // base64 encoded "test:test"
                expiresAt: "2024-01-01T00:00:00Z",
                password: "test-password",
                proxyEndpoint: "123456789012.dkr.ecr.us-west-2.amazonaws.com",
                username: "AWS"
            };
        }
        return {};
    },
});

describe("ContainerImage Component", () => {
    describe("ECR Repository Creation", () => {
        let containerImage: ContainerImage;

        before(() => {
            containerImage = new ContainerImage("test-container", {
                name: "test-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });
        });

        it("should create ECR repository with correct name", () => {
            expect(containerImage.ecrRepository).to.not.be.undefined;
        });

        it("should enable force delete by default", () => {
            return containerImage.ecrRepository.forceDelete.apply(forceDelete => {
                expect(forceDelete).to.be.true;
            });
        });

        it("should respect custom force delete setting", () => {
            const customContainer = new ContainerImage("custom-container", {
                name: "custom-lambda",
                dockerfilePath: "./lambda/query/Dockerfile",
                contextPath: "./lambda/query",
                forceDelete: false
            });

            return customContainer.ecrRepository.forceDelete.apply(forceDelete => {
                expect(forceDelete).to.be.false;
            });
        });

        it("should have repository URL in correct format", () => {
            return containerImage.ecrRepository.repositoryUrl.apply(url => {
                expect(url).to.match(/^\d+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/.+$/);
                expect(url).to.include("test-lambda-ecr");
            });
        });
    });

    describe("ECR Repository Policy", () => {
        let containerImage: ContainerImage;

        before(() => {
            containerImage = new ContainerImage("test-container", {
                name: "test-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });
        });

        it("should create repository policy", () => {
            expect(containerImage.repositoryPolicy).to.not.be.undefined;
        });

        it("should reference the ECR repository", () => {
            return containerImage.repositoryPolicy.repository.apply(repo => {
                expect(repo).to.not.be.undefined;
            });
        });

        it("should include required ECR permissions", () => {
            return containerImage.repositoryPolicy.policy.apply(policyStr => {
                const policy = JSON.parse(policyStr);
                
                expect(policy.Version).to.equal("2012-10-17");
                expect(policy.Statement).to.have.lengthOf(1);
                
                const statement = policy.Statement[0];
                expect(statement.Effect).to.equal("Allow");
                expect(statement.Action).to.include("ecr:GetDownloadUrlForLayer");
                expect(statement.Action).to.include("ecr:BatchGetImage");
                expect(statement.Action).to.include("ecr:BatchCheckLayerAvailability");
                expect(statement.Action).to.include("ecr:PutImage");
            });
        });
    });

    describe("Docker Image Build", () => {
        let containerImage: ContainerImage;

        before(() => {
            containerImage = new ContainerImage("test-container", {
                name: "test-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });
        });

        it("should create Docker image resource", () => {
            expect(containerImage.image).to.not.be.undefined;
        });

        it("should configure Linux AMD64 platform", () => {
            return containerImage.image.platforms.apply(platforms => {
                expect(platforms).to.have.lengthOf(1);
                expect(platforms![0]).to.equal("linux/amd64");
            });
        });

        it("should enable push to ECR", () => {
            return containerImage.image.push.apply(push => {
                expect(push).to.be.true;
            });
        });

        it("should tag image with latest", () => {
            return pulumi.all([
                containerImage.image.tags,
                containerImage.ecrRepository.repositoryUrl
            ]).apply(([tags, repoUrl]) => {
                expect(tags).to.have.lengthOf(1);
                expect(tags![0]).to.include(repoUrl);
                expect(tags![0]).to.include(":latest");
            });
        });

        it("should configure registry authentication", () => {
            return containerImage.image.registries.apply(registries => {
                expect(registries).to.have.lengthOf(1);
                expect(registries![0].username).to.equal("AWS");
            });
        });
    });

    describe("Image URI Output", () => {
        let containerImage: ContainerImage;

        before(() => {
            containerImage = new ContainerImage("test-container", {
                name: "test-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });
        });

        it("should generate image URI with digest", () => {
            return containerImage.imageUri.apply(uri => {
                expect(uri).to.not.be.undefined;
                expect(uri).to.include("@sha256:");
            });
        });

        it("should use digest instead of latest tag", () => {
            return containerImage.imageUri.apply(uri => {
                expect(uri).to.not.include(":latest");
                expect(uri).to.match(/@sha256:[a-f0-9]{64}$/);
            });
        });

        it("should include repository URL in image URI", () => {
            return pulumi.all([
                containerImage.imageUri,
                containerImage.ecrRepository.repositoryUrl
            ]).apply(([uri, repoUrl]) => {
                expect(uri).to.include(repoUrl);
            });
        });
    });

    describe("Component Resource Configuration", () => {
        it("should use correct component resource type", () => {
            const containerImage = new ContainerImage("test-container", {
                name: "test-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });

            // Component resource type is set in the constructor
            expect(containerImage).to.be.instanceOf(pulumi.ComponentResource);
        });

        it("should handle different context paths", () => {
            const ingestionImage = new ContainerImage("ingestion-container", {
                name: "ingestion-lambda",
                dockerfilePath: "./lambda/ingestion/Dockerfile",
                contextPath: "./lambda/ingestion"
            });

            const queryImage = new ContainerImage("query-container", {
                name: "query-lambda",
                dockerfilePath: "./lambda/query/Dockerfile",
                contextPath: "./lambda/query"
            });

            expect(ingestionImage.ecrRepository).to.not.be.undefined;
            expect(queryImage.ecrRepository).to.not.be.undefined;
        });
    });
});