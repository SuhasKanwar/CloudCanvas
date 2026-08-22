import {
    DescribeInstancesCommand,
    DescribeLaunchTemplatesCommand,
    DescribeSecurityGroupsCommand,
    DescribeSubnetsCommand,
    DescribeVpcsCommand,
    type DescribeInstancesCommandOutput,
    type DescribeLaunchTemplatesCommandOutput,
    type DescribeSecurityGroupsCommandOutput,
    type DescribeSubnetsCommandOutput,
    type DescribeVpcsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
    ListInstanceProfilesCommand,
    type ListInstanceProfilesCommandOutput,
} from "@aws-sdk/client-iam";

export type AwsResourceCatalog = {
    vpcs: Array<{ id: string; name: string; cidrBlock: string }>;
    subnets: Array<{ id: string; name: string; vpcId: string; availabilityZone: string }>;
    securityGroups: Array<{ id: string; name: string; description: string; vpcId: string }>;
    instanceProfiles: Array<{ arn: string; name: string }>;
    launchTemplates: Array<{ id: string; name: string }>;
    instances: Array<{ id: string; name: string; state: string; instanceType: string; vpcId: string; subnetId: string }>;
};

export type AwsCatalogSender = {
    securityGroups: (command: DescribeSecurityGroupsCommand) => Promise<DescribeSecurityGroupsCommandOutput>;
    vpcs: (command: DescribeVpcsCommand) => Promise<DescribeVpcsCommandOutput>;
    subnets: (command: DescribeSubnetsCommand) => Promise<DescribeSubnetsCommandOutput>;
    launchTemplates: (command: DescribeLaunchTemplatesCommand) => Promise<DescribeLaunchTemplatesCommandOutput>;
    instances: (command: DescribeInstancesCommand) => Promise<DescribeInstancesCommandOutput>;
    instanceProfiles: (command: ListInstanceProfilesCommand) => Promise<ListInstanceProfilesCommandOutput>;
};

function name(tags: Array<{ Key?: string | undefined; Value?: string | undefined }> | undefined, fallback: string) {
    return tags?.find((tag) => tag.Key === "Name")?.Value ?? fallback;
}

export class AwsCatalogService {
    constructor(private readonly send: AwsCatalogSender) {}

    async list(): Promise<AwsResourceCatalog> {
        const [vpcPage, subnetPage, securityGroupPage, templatePage, instancePage, profilePage] = await Promise.all([
            this.send.vpcs(new DescribeVpcsCommand({})),
            this.send.subnets(new DescribeSubnetsCommand({})),
            this.send.securityGroups(new DescribeSecurityGroupsCommand({})),
            this.send.launchTemplates(new DescribeLaunchTemplatesCommand({})),
            this.send.instances(new DescribeInstancesCommand({})),
            this.send.instanceProfiles(new ListInstanceProfilesCommand({})),
        ]);
        return {
            vpcs: (vpcPage.Vpcs ?? []).flatMap((vpc) => vpc.VpcId ? [{ id: vpc.VpcId, name: name(vpc.Tags, vpc.VpcId), cidrBlock: vpc.CidrBlock ?? "" }] : []),
            subnets: (subnetPage.Subnets ?? []).flatMap((subnet) => subnet.SubnetId && subnet.VpcId ? [{ id: subnet.SubnetId, name: name(subnet.Tags, subnet.SubnetId), vpcId: subnet.VpcId, availabilityZone: subnet.AvailabilityZone ?? "" }] : []),
            securityGroups: (securityGroupPage.SecurityGroups ?? []).flatMap((group) => group.GroupId && group.VpcId ? [{ id: group.GroupId, name: group.GroupName ?? group.GroupId, description: group.Description ?? "", vpcId: group.VpcId }] : []),
            instanceProfiles: (profilePage.InstanceProfiles ?? []).flatMap((profile) => profile.Arn && profile.InstanceProfileName ? [{ arn: profile.Arn, name: profile.InstanceProfileName }] : []),
            launchTemplates: (templatePage.LaunchTemplates ?? []).flatMap((template) => template.LaunchTemplateId && template.LaunchTemplateName ? [{ id: template.LaunchTemplateId, name: template.LaunchTemplateName }] : []),
            instances: (instancePage.Reservations ?? []).flatMap((reservation) => (reservation.Instances ?? []).flatMap((instance) => instance.InstanceId ? [{ id: instance.InstanceId, name: name(instance.Tags, instance.InstanceId), state: instance.State?.Name ?? "unknown", instanceType: instance.InstanceType ?? "", vpcId: instance.VpcId ?? "", subnetId: instance.SubnetId ?? "" }] : [])),
        };
    }
}
