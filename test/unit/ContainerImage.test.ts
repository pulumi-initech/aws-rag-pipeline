import "mocha";
// import { expect } from "chai";
import * as pulumi from "@pulumi/pulumi";
// import { ContainerImage } from "../../components/ContainerImage.ts";

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
    // let _containerImage: ContainerImage;

    // Tests will be added here
});