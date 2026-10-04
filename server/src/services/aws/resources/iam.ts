import {
    AttachRolePolicyCommand,
    CreateRoleCommand,
    DeleteRoleCommand,
    DetachRolePolicyCommand,
    ListAttachedRolePoliciesCommand,
    PutRolePermissionsBoundaryCommand,
    DeleteRolePermissionsBoundaryCommand,
    UpdateAssumeRolePolicyCommand,
    UpdateRoleCommand,
    DeleteRolePolicyCommand,
    ListRolePoliciesCommand,
    ListInstanceProfilesForRoleCommand,
    type AttachRolePolicyCommandOutput,
    type CreateRoleCommandOutput,
    type DeleteRoleCommandOutput,
    type DetachRolePolicyCommandOutput,
    type ListAttachedRolePoliciesCommandOutput,
    type PutRolePermissionsBoundaryCommandOutput,
    type DeleteRolePermissionsBoundaryCommandOutput,
    type UpdateAssumeRolePolicyCommandOutput,
    type UpdateRoleCommandOutput,
    type DeleteRolePolicyCommandOutput,
    type ListRolePoliciesCommandOutput,
    type ListInstanceProfilesForRoleCommandOutput,
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
    update: (command: UpdateRoleCommand) => Promise<UpdateRoleCommandOutput>;
    updateTrust: (command: UpdateAssumeRolePolicyCommand) => Promise<UpdateAssumeRolePolicyCommandOutput>;
    putBoundary: (command: PutRolePermissionsBoundaryCommand) => Promise<PutRolePermissionsBoundaryCommandOutput>;
    deleteBoundary: (command: DeleteRolePermissionsBoundaryCommand) => Promise<DeleteRolePermissionsBoundaryCommandOutput>;
    listInline: (command: ListRolePoliciesCommand) => Promise<ListRolePoliciesCommandOutput>;
    deleteInline: (command: DeleteRolePolicyCommand) => Promise<DeleteRolePolicyCommandOutput>;
    listProfiles: (command: ListInstanceProfilesForRoleCommand) => Promise<ListInstanceProfilesForRoleCommandOutput>;
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
        const profiles: string[] = [];
        let profileMarker: string | undefined;
        do {
            const page = await this.send.listProfiles(new ListInstanceProfilesForRoleCommand({ RoleName: roleName, Marker: profileMarker }));
            profiles.push(...(page.InstanceProfiles ?? []).flatMap((profile) => profile.InstanceProfileName ? [profile.InstanceProfileName] : []));
            profileMarker = page.IsTruncated ? page.Marker : undefined;
        } while (profileMarker);
        if (profiles.length) {
            throw new Error(`IAM role ${roleName} is attached to instance profile${profiles.length > 1 ? "s" : ""} ${profiles.join(", ")}. Remove those associations before deleting the role.`);
        }
        let marker: string | undefined;
        const attachedArns = new Set<string>();
        do {
            const attached = await this.send.listAttached(new ListAttachedRolePoliciesCommand({ RoleName: roleName, Marker: marker }));
            for (const policy of attached.AttachedPolicies ?? []) if (policy.PolicyArn) attachedArns.add(policy.PolicyArn);
            marker = attached.IsTruncated ? attached.Marker : undefined;
        } while (marker);
        for (const policyArn of attachedArns) await this.send.detach(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
        let inlineMarker: string | undefined;
        const inlineNames = new Set<string>();
        do {
            const inline = await this.send.listInline(new ListRolePoliciesCommand({ RoleName: roleName, Marker: inlineMarker }));
            for (const policyName of inline.PolicyNames ?? []) inlineNames.add(policyName);
            inlineMarker = inline.IsTruncated ? inline.Marker : undefined;
        } while (inlineMarker);
        for (const policyName of inlineNames) await this.send.deleteInline(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }));
        await this.send.delete(new DeleteRoleCommand({ RoleName: roleName }));
        return { region: this.region, roleName };
    }

    async updateRole(request: IamRoleRequest, roleName: string): Promise<IamRoleResult> {
        if (!roleName || request.roleName !== roleName) throw new Error("An IAM role cannot be renamed.");
        const assumeRolePolicyDocument = request.trustedService
            ? JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: request.trustedService }, Action: "sts:AssumeRole" }] })
            : request.assumeRolePolicyDocument;
        if (!assumeRolePolicyDocument) throw new Error("Select the AWS service that can assume this IAM role.");

        await this.send.update(new UpdateRoleCommand({
            RoleName: roleName,
            ...(request.description !== undefined && { Description: request.description }),
            ...(request.maxSessionDuration !== undefined && { MaxSessionDuration: request.maxSessionDuration }),
        }));
        await this.send.updateTrust(new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: assumeRolePolicyDocument }));

        let marker: string | undefined;
        const attachedArns = new Set<string>();
        do {
            const attached = await this.send.listAttached(new ListAttachedRolePoliciesCommand({ RoleName: roleName, Marker: marker }));
            for (const policy of attached.AttachedPolicies ?? []) if (policy.PolicyArn) attachedArns.add(policy.PolicyArn);
            marker = attached.IsTruncated ? attached.Marker : undefined;
        } while (marker);
        const desiredArns = new Set(request.managedPolicyArns ?? []);
        for (const policyArn of attachedArns) {
            if (!desiredArns.has(policyArn)) await this.send.detach(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
        }
        for (const policyArn of desiredArns) {
            if (!attachedArns.has(policyArn)) await this.send.attach(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
        }

        if (request.permissionsBoundaryArn) {
            await this.send.putBoundary(new PutRolePermissionsBoundaryCommand({ RoleName: roleName, PermissionsBoundary: request.permissionsBoundaryArn }));
        } else {
            try {
                await this.send.deleteBoundary(new DeleteRolePermissionsBoundaryCommand({ RoleName: roleName }));
            } catch (error) {
                if (!(error instanceof Error) || !error.name.includes("NoSuchEntity")) throw error;
            }
        }
        return { region: this.region, roleName, roleArn: undefined, roleId: undefined };
    }
}
