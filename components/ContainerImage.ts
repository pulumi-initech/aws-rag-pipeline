import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as dockerBuild from "@pulumi/docker-build";

export interface ContainerImageArgs {
    name: string;
    dockerfilePath: string;
    contextPath: string;
    forceDelete?: boolean;
}

export class ContainerImage extends pulumi.ComponentResource {
    public readonly ecrRepository: aws.ecr.Repository;
    public readonly repositoryPolicy: aws.ecr.RepositoryPolicy;
    public readonly image: dockerBuild.Image;
    public readonly imageUri: pulumi.Output<string>;

    constructor(name: string, args: ContainerImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super("rag:ContainerImage", name, {}, opts);

        // Create ECR repository for container image
        this.ecrRepository = new aws.ecr.Repository(`${args.name}-ecr`, {
            forceDelete: args.forceDelete ?? true,
        }, { parent: this });

        const current = aws.getCallerIdentity({});
        const _accountId = current.then(current => current.accountId);
        
        // Create ECR repository policy to allow Lambda access
        this.repositoryPolicy = new aws.ecr.RepositoryPolicy(`${args.name}-ecr-policy`, {
            repository: this.ecrRepository.name,
            policy: pulumi.jsonStringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        AWS: "*"
                    },
                    Action: [
                        "ecr:GetDownloadUrlForLayer",
                        "ecr:BatchGetImage",
                        "ecr:BatchCheckLayerAvailability",
                        "ecr:InitiateLayerUpload",
                        "ecr:UploadLayerPart",
                        "ecr:CompleteLayerUpload",
                        "ecr:PutImage"
                    ]
                }]
            })
        }, { parent: this.ecrRepository });

        // Get ECR authorization token for Docker push
        const authToken = aws.ecr.getAuthorizationTokenOutput({});
        
        // Build and push Docker image
        this.image = new dockerBuild.Image(`${args.name}-image`, {
            dockerfile: {
                location: `${args.contextPath}/Dockerfile`,
            },
            context: {
                location: args.contextPath,
            },
            platforms: [dockerBuild.Platform.Linux_amd64],
            push: true,
            tags: [pulumi.interpolate`${this.ecrRepository.repositoryUrl}:latest`],
            registries: [{
                address: pulumi.interpolate`${this.ecrRepository.repositoryUrl}`.apply(url => url.split('/')[0]),
                username: "AWS",
                password: authToken.password
            }]
        }, { parent: this.ecrRepository });

        // Export the image URI using the image digest/hash instead of latest tag
        this.imageUri = pulumi.interpolate`${this.ecrRepository.repositoryUrl}@${this.image.digest}`;
    }
}