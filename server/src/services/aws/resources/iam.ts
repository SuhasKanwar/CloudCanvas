import {
    AttachRolePolicyCommand,
    CreateRoleCommand,
    DeleteRoleCommand,
    DetachRolePolicyCommand,
    ListAttachedRolePoliciesCommand,
    type AttachRolePolicyCommandOutput,
    type CreateRoleCommandOutput,
    type DeleteRoleCommandOutput,
    type DetachRolePolicyCommandOutput,
    type ListAttachedRolePoliciesCommandOutput,
} from "@aws-sdk/client-iam";

export type IamRoleRequest = {
    roleName: string;
    trustedService?: "ec2.amazonaws.com" | "lambda.amazonaws.com" | "ecs-tasks.amazonaws.com";
    // Kept for previously saved graphs; new roles use trustedService from the form.
    assumeRolePolicyDocument?: string;
    managedPolicyArns?: string[];
    description?: string;
    path?: string;
    maxSessionDuration?: number;
    permissionsBoundaryArn?: string;
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
    attach: (command: AttachRolePolicyCommand) => Promise<AttachRolePolicyCommandOutput>;
    listAttached: (command: ListAttachedRolePoliciesCommand) => Promise<ListAttachedRolePoliciesCommandOutput>;
    detach: (command: DetachRolePolicyCommand) => Promise<DetachRolePolicyCommandOutput>;
    delete: (command: DeleteRoleCommand) => Promise<DeleteRoleCommandOutput>;
};

export class IamService {
    constructor(private readonly send: IamCommandSender, private readonly region: string) {}

    async createRole(request: IamRoleRequest): Promise<IamRoleResult> {
        if (!request.roleName) throw new Error("roleName is required to create an IAM role.");
        const assumeRolePolicyDocument = request.trustedService
            ? JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: request.trustedService }, Action: "sts:AssumeRole" }] })
            : request.assumeRolePolicyDocument;
        if (!assumeRolePolicyDocument) throw new Error("Select the AWS service that can assume this IAM role.");
        const result = await this.send.create(new CreateRoleCommand({
            RoleName: request.roleName,
            AssumeRolePolicyDocument: assumeRolePolicyDocument,
            ...(request.description && { Description: request.description }),
            ...(request.path && { Path: request.path }),
            ...(request.maxSessionDuration && { MaxSessionDuration: request.maxSessionDuration }),
            ...(request.permissionsBoundaryArn && { PermissionsBoundary: request.permissionsBoundaryArn }),
        }));
        for (const policyArn of request.managedPolicyArns ?? []) {
            await this.send.attach(new AttachRolePolicyCommand({ RoleName: request.roleName, PolicyArn: policyArn }));
        }
        return {
            region: this.region,
            roleName: result.Role?.RoleName ?? request.roleName,
            roleArn: result.Role?.Arn,
            roleId: result.Role?.RoleId,
        };
    }

    async deleteRole(roleName: string): Promise<IamDeleteResult> {
        if (!roleName) throw new Error("roleName is required to delete an IAM role.");
        let marker: string | undefined;
        do {
            const attached = await this.send.listAttached(new ListAttachedRolePoliciesCommand({ RoleName: roleName, Marker: marker }));
            for (const policy of attached.AttachedPolicies ?? []) {
                if (policy.PolicyArn) await this.send.detach(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn }));
            }
            marker = attached.IsTruncated ? attached.Marker : undefined;
        } while (marker);
        await this.send.delete(new DeleteRoleCommand({ RoleName: roleName }));
        return { region: this.region, roleName };
    }
}
