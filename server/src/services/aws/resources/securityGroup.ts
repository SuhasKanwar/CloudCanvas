import {
    AuthorizeSecurityGroupIngressCommand,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    type AuthorizeSecurityGroupIngressCommandOutput,
    type CreateSecurityGroupCommandOutput,
    type DeleteSecurityGroupCommandOutput,
} from "@aws-sdk/client-ec2";

export type SecurityGroupIngressRule = { protocol: "tcp" | "udp" | "icmp" | "-1"; fromPort?: number; toPort?: number; cidrIpv4: string; description?: string };
export type SecurityGroupRequest =
    | { mode: "existing"; groupId: string; groupName?: string }
    | { mode?: "create"; groupName: string; description: string; vpcId: string; ingressRules?: SecurityGroupIngressRule[] };

export type SecurityGroupResult = { region: string; securityGroupId: string; groupName: string };
export type SecurityGroupSender = {
    create: (command: CreateSecurityGroupCommand) => Promise<CreateSecurityGroupCommandOutput>;
    authorizeIngress: (command: AuthorizeSecurityGroupIngressCommand) => Promise<AuthorizeSecurityGroupIngressCommandOutput>;
    delete: (command: DeleteSecurityGroupCommand) => Promise<DeleteSecurityGroupCommandOutput>;
};

export class SecurityGroupService {
    constructor(private readonly send: SecurityGroupSender, private readonly region: string) {}

    async create(request: SecurityGroupRequest): Promise<SecurityGroupResult> {
        if (request.mode === "existing") return { region: this.region, securityGroupId: request.groupId, groupName: request.groupName ?? request.groupId };
        const result = await this.send.create(new CreateSecurityGroupCommand({ GroupName: request.groupName, Description: request.description, VpcId: request.vpcId }));
        if (!result.GroupId) throw new Error("AWS did not return a security group ID.");
        for (const rule of request.ingressRules ?? []) {
            await this.send.authorizeIngress(new AuthorizeSecurityGroupIngressCommand({
                GroupId: result.GroupId,
                IpPermissions: [{ IpProtocol: rule.protocol, ...(rule.protocol !== "-1" && { FromPort: rule.fromPort, ToPort: rule.toPort }), IpRanges: [{ CidrIp: rule.cidrIpv4, ...(rule.description && { Description: rule.description }) }] }],
            }));
        }
        return { region: this.region, securityGroupId: result.GroupId, groupName: request.groupName };
    }

    async delete(groupId: string): Promise<{ region: string; securityGroupId: string }> {
        await this.send.delete(new DeleteSecurityGroupCommand({ GroupId: groupId }));
        return { region: this.region, securityGroupId: groupId };
    }
}
