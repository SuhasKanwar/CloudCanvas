import {
    DescribeInstancesCommand,
    DescribeImagesCommand,
    DescribeKeyPairsCommand,
    DescribeLaunchTemplatesCommand,
    DescribeSecurityGroupsCommand,
    DescribeSubnetsCommand,
    DescribeVpcsCommand,
    type DescribeInstancesCommandOutput,
    type DescribeImagesCommandOutput,
    type DescribeKeyPairsCommandOutput,
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
    warnings: string[];
    vpcs: Array<{ id: string; name: string; cidrBlock: string }>;
    subnets: Array<{ id: string; name: string; vpcId: string; availabilityZone: string }>;
    securityGroups: Array<{ id: string; name: string; description: string; vpcId: string }>;
    instanceProfiles: Array<{ arn: string; name: string }>;
    launchTemplates: Array<{ id: string; name: string }>;
    instances: Array<{ id: string; name: string; state: string; instanceType: string; vpcId: string; subnetId: string }>;
    keyPairs: Array<{ id: string; name: string; fingerprint: string }>;
    images: Array<{ id: string; name: string; description: string; rootDeviceName: string }>;
};

export type AwsCatalogSender = {
    securityGroups: (command: DescribeSecurityGroupsCommand) => Promise<DescribeSecurityGroupsCommandOutput>;
    vpcs: (command: DescribeVpcsCommand) => Promise<DescribeVpcsCommandOutput>;
    subnets: (command: DescribeSubnetsCommand) => Promise<DescribeSubnetsCommandOutput>;
    launchTemplates: (command: DescribeLaunchTemplatesCommand) => Promise<DescribeLaunchTemplatesCommandOutput>;
    instances: (command: DescribeInstancesCommand) => Promise<DescribeInstancesCommandOutput>;
    images: (command: DescribeImagesCommand) => Promise<DescribeImagesCommandOutput>;
    keyPairs: (command: DescribeKeyPairsCommand) => Promise<DescribeKeyPairsCommandOutput>;
    instanceProfiles: (command: ListInstanceProfilesCommand) => Promise<ListInstanceProfilesCommandOutput>;
};

function name(tags: Array<{ Key?: string | undefined; Value?: string | undefined }> | undefined, fallback: string) {
    return tags?.find((tag) => tag.Key === "Name")?.Value ?? fallback;
}

export class AwsCatalogService {
    constructor(private readonly send: AwsCatalogSender) {}

    async list(): Promise<AwsResourceCatalog> {
        const [vpcResult, subnetResult, securityGroupResult, templateResult, instanceResult, profileResult, keyPairResult, al2023Result, amzn2Result, windowsResult] = await Promise.allSettled([
            this.send.vpcs(new DescribeVpcsCommand({})),
            this.send.subnets(new DescribeSubnetsCommand({})),
            this.send.securityGroups(new DescribeSecurityGroupsCommand({})),
            this.send.launchTemplates(new DescribeLaunchTemplatesCommand({})),
            this.send.instances(new DescribeInstancesCommand({})),
            this.send.instanceProfiles(new ListInstanceProfilesCommand({})),
            this.send.keyPairs(new DescribeKeyPairsCommand({})),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["al2023-ami-2023.*-kernel-6.1-x86_64"] }, { Name: "state", Values: ["available"] }] })),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["amzn2-ami-hvm-*-x86_64-gp2"] }, { Name: "state", Values: ["available"] }] })),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["Windows_Server-2022-English-Full-Base-*"] }, { Name: "state", Values: ["available"] }] })),
        ]);
        const warnings: string[] = [];
        const page = <T>(result: PromiseSettledResult<T>, label: string, action?: string) => {
            if (result.status === "fulfilled") return result.value;
            warnings.push(`${label} could not be listed. Grant ${action ?? "the required AWS read permission"} to this AWS connection.`);
            return undefined;
        };
        const vpcPage = page(vpcResult, "VPCs");
        const subnetPage = page(subnetResult, "Subnets");
        const securityGroupPage = page(securityGroupResult, "Security groups");
        const templatePage = page(templateResult, "Launch templates");
        const instancePage = page(instanceResult, "EC2 instances");
        const profilePage = page(profileResult, "Instance profiles");
        const keyPairPage = page(keyPairResult, "Key pairs", "ec2:DescribeKeyPairs");
        const images = [page(al2023Result, "Amazon Linux 2023 images", "ec2:DescribeImages"), page(amzn2Result, "Amazon Linux 2 images", "ec2:DescribeImages"), page(windowsResult, "Windows Server 2022 images", "ec2:DescribeImages")]
            .flatMap((result) => result?.Images ?? [])
            .filter((image, index, list) => image.ImageId && list.findIndex((entry) => entry.ImageId === image.ImageId) === index)
            .sort((left, right) => (right.CreationDate ?? "").localeCompare(left.CreationDate ?? ""));
        return {
            warnings,
            vpcs: (vpcPage?.Vpcs ?? []).flatMap((vpc) => vpc.VpcId ? [{ id: vpc.VpcId, name: name(vpc.Tags, vpc.VpcId), cidrBlock: vpc.CidrBlock ?? "" }] : []),
            subnets: (subnetPage?.Subnets ?? []).flatMap((subnet) => subnet.SubnetId && subnet.VpcId ? [{ id: subnet.SubnetId, name: name(subnet.Tags, subnet.SubnetId), vpcId: subnet.VpcId, availabilityZone: subnet.AvailabilityZone ?? "" }] : []),
            securityGroups: (securityGroupPage?.SecurityGroups ?? []).flatMap((group) => group.GroupId && group.VpcId ? [{ id: group.GroupId, name: group.GroupName ?? group.GroupId, description: group.Description ?? "", vpcId: group.VpcId }] : []),
            instanceProfiles: (profilePage?.InstanceProfiles ?? []).flatMap((profile) => profile.Arn && profile.InstanceProfileName ? [{ arn: profile.Arn, name: profile.InstanceProfileName }] : []),
            launchTemplates: (templatePage?.LaunchTemplates ?? []).flatMap((template) => template.LaunchTemplateId && template.LaunchTemplateName ? [{ id: template.LaunchTemplateId, name: template.LaunchTemplateName }] : []),
            instances: (instancePage?.Reservations ?? []).flatMap((reservation) => (reservation.Instances ?? []).flatMap((instance) => instance.InstanceId ? [{ id: instance.InstanceId, name: name(instance.Tags, instance.InstanceId), state: instance.State?.Name ?? "unknown", instanceType: instance.InstanceType ?? "", vpcId: instance.VpcId ?? "", subnetId: instance.SubnetId ?? "" }] : [])),
            keyPairs: (keyPairPage?.KeyPairs ?? []).flatMap((keyPair) => keyPair.KeyName ? [{ id: keyPair.KeyPairId ?? keyPair.KeyName, name: keyPair.KeyName, fingerprint: keyPair.KeyFingerprint ?? "" }] : []),
            images: images.flatMap((image) => image.ImageId ? [{ id: image.ImageId, name: image.Name ?? image.ImageId, description: image.Description ?? "", rootDeviceName: image.RootDeviceName ?? "/dev/xvda" }] : []),
        };
    }
}
