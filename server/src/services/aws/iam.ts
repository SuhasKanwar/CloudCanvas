import {
    CreateRoleCommand,
    DeleteRoleCommand,
    type CreateRoleCommandOutput,
    type DeleteRoleCommandOutput,
} from "@aws-sdk/client-iam";

export type IamRoleRequest = {
    roleName: string;
    assumeRolePolicyDocument: string;
    description?: string;
    path?: string;
};

export type IamRoleResult = {
    region: string;
    roleName: string;
    roleArn: string | undefined;
    roleId: string | undefined;
};

export type IamDeleteResult = {
    region: string;
    roleName: string;
};

export type IamCommandSender = {
    create: (command: CreateRoleCommand) => Promise<CreateRoleCommandOutput>;
    delete: (command: DeleteRoleCommand) => Promise<DeleteRoleCommandOutput>;
};

export class IamService {
    constructor(private readonly send: IamCommandSender, private readonly region: string) {}

    async createRole(request: IamRoleRequest): Promise<IamRoleResult> {
        if (!request.roleName) throw new Error("roleName is required to create an IAM role.");
        if (!request.assumeRolePolicyDocument) throw new Error("assumeRolePolicyDocument is required to create an IAM role.");
        const result = await this.send.create(new CreateRoleCommand({
            RoleName: request.roleName,
            AssumeRolePolicyDocument: request.assumeRolePolicyDocument,
            ...(request.description && { Description: request.description }),
            ...(request.path && { Path: request.path }),
        }));
        return {
            region: this.region,
            roleName: result.Role?.RoleName ?? request.roleName,
            roleArn: result.Role?.Arn,
            roleId: result.Role?.RoleId,
        };
    }

    async deleteRole(roleName: string): Promise<IamDeleteResult> {
        if (!roleName) throw new Error("roleName is required to delete an IAM role.");
        await this.send.delete(new DeleteRoleCommand({ RoleName: roleName }));
        return { region: this.region, roleName };
    }
}
