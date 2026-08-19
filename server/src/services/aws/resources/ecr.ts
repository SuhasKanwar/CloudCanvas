import {
    CreateRepositoryCommand,
    DeleteRepositoryCommand,
    type CreateRepositoryCommandOutput,
    type DeleteRepositoryCommandOutput,
    type ImageTagMutability,
} from "@aws-sdk/client-ecr";

export type EcrRepositoryRequest = {
    repositoryName: string;
    imageTagMutability?: ImageTagMutability;
    scanOnPush?: boolean;
};

export type EcrRepositoryResult = {
    region: string;
    repositoryName: string;
    repositoryArn: string | undefined;
    repositoryUri: string | undefined;
};

export type EcrDeleteResult = {
    region: string;
    repositoryName: string;
};

export type EcrCommandSender = {
    create: (command: CreateRepositoryCommand) => Promise<CreateRepositoryCommandOutput>;
    delete: (command: DeleteRepositoryCommand) => Promise<DeleteRepositoryCommandOutput>;
};

export class EcrService {
    constructor(private readonly send: EcrCommandSender, private readonly region: string) {}

    async createRepository(request: EcrRepositoryRequest): Promise<EcrRepositoryResult> {
        if (!request.repositoryName) throw new Error("repositoryName is required to create an ECR repository.");
        const result = await this.send.create(new CreateRepositoryCommand({
            repositoryName: request.repositoryName,
            ...(request.imageTagMutability && { imageTagMutability: request.imageTagMutability }),
            ...(request.scanOnPush !== undefined && { imageScanningConfiguration: { scanOnPush: request.scanOnPush } }),
        }));
        return {
            region: this.region,
            repositoryName: result.repository?.repositoryName ?? request.repositoryName,
            repositoryArn: result.repository?.repositoryArn,
            repositoryUri: result.repository?.repositoryUri,
        };
    }

    async deleteRepository(repositoryName: string): Promise<EcrDeleteResult> {
        if (!repositoryName) throw new Error("repositoryName is required to delete an ECR repository.");
        await this.send.delete(new DeleteRepositoryCommand({ repositoryName, force: true }));
        return { region: this.region, repositoryName };
    }
}
