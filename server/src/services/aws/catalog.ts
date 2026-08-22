import {
    DescribeInstancesCommand,
    DescribeInstanceTypesCommand,
    DescribeImagesCommand,
    DescribeKeyPairsCommand,
    DescribeLaunchTemplatesCommand,
    DescribeSecurityGroupsCommand,
    DescribeSubnetsCommand,
    DescribeVpcsCommand,
    type DescribeInstancesCommandOutput,
    type DescribeInstanceTypesCommandOutput,
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
    instanceTypes: Array<{ name: string; vcpus?: number | undefined; memoryMiB?: number | undefined; architectures: string[]; networkPerformance?: string | undefined; instanceStorageGiB?: number | undefined }>;
    keyPairs: Array<{ id: string; name: string; fingerprint: string }>;
    images: Array<{ id: string; category: "amazon-linux" | "windows"; title: string; architecture: string; release: string; label: string; description: string; rootDeviceName: string }>;
};

export type AwsCatalogSender = {
    securityGroups: (command: DescribeSecurityGroupsCommand) => Promise<DescribeSecurityGroupsCommandOutput>;
    vpcs: (command: DescribeVpcsCommand) => Promise<DescribeVpcsCommandOutput>;
    subnets: (command: DescribeSubnetsCommand) => Promise<DescribeSubnetsCommandOutput>;
    launchTemplates: (command: DescribeLaunchTemplatesCommand) => Promise<DescribeLaunchTemplatesCommandOutput>;
    instances: (command: DescribeInstancesCommand) => Promise<DescribeInstancesCommandOutput>;
    instanceTypes: (command: DescribeInstanceTypesCommand) => Promise<DescribeInstanceTypesCommandOutput>;
    images: (command: DescribeImagesCommand) => Promise<DescribeImagesCommandOutput>;
    keyPairs: (command: DescribeKeyPairsCommand) => Promise<DescribeKeyPairsCommandOutput>;
    instanceProfiles: (command: ListInstanceProfilesCommand) => Promise<ListInstanceProfilesCommandOutput>;
};

function name(tags: Array<{ Key?: string | undefined; Value?: string | undefined }> | undefined, fallback: string) {
    return tags?.find((tag) => tag.Key === "Name")?.Value ?? fallback;
}

function imageDetails(image: { ImageId?: string | undefined; Name?: string | undefined; Architecture?: string | undefined; CreationDate?: string | undefined }, category: "amazon-linux" | "windows") {
    const name = image.Name ?? image.ImageId ?? "Custom AMI";
    const release = image.CreationDate?.slice(0, 10) ?? "unknown release";
    const architecture = image.Architecture ?? "x86_64";
    const title = category === "amazon-linux" ? (name.startsWith("amzn2") ? "Amazon Linux 2" : "Amazon Linux 2023")
        : `Microsoft Windows Server ${name.match(/Windows_Server-(\d{4})/)?.[1] ?? ""}`.trim();
    return { architecture, release, title, label: `${title} | ${architecture} | ${release} | ${image.ImageId ?? ""}` };
}

export class AwsCatalogService {
    constructor(private readonly send: AwsCatalogSender) {}

    private async listInstanceTypes() {
        const instanceTypes: AwsResourceCatalog["instanceTypes"] = [];
        let nextToken: string | undefined;
        do {
            const page = await this.send.instanceTypes(new DescribeInstanceTypesCommand({ MaxResults: 100, NextToken: nextToken }));
            instanceTypes.push(...(page.InstanceTypes ?? []).flatMap((instanceType) => instanceType.InstanceType ? [{
                name: instanceType.InstanceType,
                vcpus: instanceType.VCpuInfo?.DefaultVCpus,
                memoryMiB: instanceType.MemoryInfo?.SizeInMiB,
                architectures: instanceType.ProcessorInfo?.SupportedArchitectures ?? [],
                networkPerformance: instanceType.NetworkInfo?.NetworkPerformance,
                instanceStorageGiB: instanceType.InstanceStorageInfo?.TotalSizeInGB,
            }] : []));
            nextToken = page.NextToken;
        } while (nextToken);
        return instanceTypes.sort((left, right) => left.name.localeCompare(right.name));
    }

    async list(): Promise<AwsResourceCatalog> {
        const [vpcResult, subnetResult, securityGroupResult, templateResult, instanceResult, instanceTypeResult, profileResult, keyPairResult, al2023Result, amzn2Result, windowsResult] = await Promise.allSettled([
            this.send.vpcs(new DescribeVpcsCommand({})),
            this.send.subnets(new DescribeSubnetsCommand({})),
            this.send.securityGroups(new DescribeSecurityGroupsCommand({})),
            this.send.launchTemplates(new DescribeLaunchTemplatesCommand({})),
            this.send.instances(new DescribeInstancesCommand({})),
            this.listInstanceTypes(),
            this.send.instanceProfiles(new ListInstanceProfilesCommand({})),
            this.send.keyPairs(new DescribeKeyPairsCommand({})),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["al2023-ami-2023.*-kernel-6.1-x86_64"] }, { Name: "state", Values: ["available"] }] })),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["amzn2-ami-hvm-*-x86_64-gp2"] }, { Name: "state", Values: ["available"] }] })),
            this.send.images(new DescribeImagesCommand({ Owners: ["amazon"], Filters: [{ Name: "name", Values: ["Windows_Server-*-English-Full-Base-*"] }, { Name: "state", Values: ["available"] }] })),
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
        const instanceTypes = page(instanceTypeResult, "EC2 instance types", "ec2:DescribeInstanceTypes") ?? [];
        const profilePage = page(profileResult, "Instance profiles");
        const keyPairPage = page(keyPairResult, "Key pairs", "ec2:DescribeKeyPairs");
        const images = [
            ...(page(al2023Result, "Amazon Linux 2023 images", "ec2:DescribeImages")?.Images ?? []).map((image) => ({ category: "amazon-linux" as const, image })),
            ...(page(amzn2Result, "Amazon Linux 2 images", "ec2:DescribeImages")?.Images ?? []).map((image) => ({ category: "amazon-linux" as const, image })),
            ...(page(windowsResult, "Windows Server images", "ec2:DescribeImages")?.Images ?? []).map((image) => ({ category: "windows" as const, image })),
        ].filter((entry, index, list) => entry.image.ImageId && list.findIndex((candidate) => candidate.image.ImageId === entry.image.ImageId) === index)
            .sort((left, right) => (right.image.CreationDate ?? "").localeCompare(left.image.CreationDate ?? ""));
        return {
            warnings,
            vpcs: (vpcPage?.Vpcs ?? []).flatMap((vpc) => vpc.VpcId ? [{ id: vpc.VpcId, name: name(vpc.Tags, vpc.VpcId), cidrBlock: vpc.CidrBlock ?? "" }] : []),
            subnets: (subnetPage?.Subnets ?? []).flatMap((subnet) => subnet.SubnetId && subnet.VpcId ? [{ id: subnet.SubnetId, name: name(subnet.Tags, subnet.SubnetId), vpcId: subnet.VpcId, availabilityZone: subnet.AvailabilityZone ?? "" }] : []),
            securityGroups: (securityGroupPage?.SecurityGroups ?? []).flatMap((group) => group.GroupId && group.VpcId ? [{ id: group.GroupId, name: group.GroupName ?? group.GroupId, description: group.Description ?? "", vpcId: group.VpcId }] : []),
            instanceProfiles: (profilePage?.InstanceProfiles ?? []).flatMap((profile) => profile.Arn && profile.InstanceProfileName ? [{ arn: profile.Arn, name: profile.InstanceProfileName }] : []),
            launchTemplates: (templatePage?.LaunchTemplates ?? []).flatMap((template) => template.LaunchTemplateId && template.LaunchTemplateName ? [{ id: template.LaunchTemplateId, name: template.LaunchTemplateName }] : []),
            instances: (instancePage?.Reservations ?? []).flatMap((reservation) => (reservation.Instances ?? []).flatMap((instance) => instance.InstanceId ? [{ id: instance.InstanceId, name: name(instance.Tags, instance.InstanceId), state: instance.State?.Name ?? "unknown", instanceType: instance.InstanceType ?? "", vpcId: instance.VpcId ?? "", subnetId: instance.SubnetId ?? "" }] : [])),
            instanceTypes,
            keyPairs: (keyPairPage?.KeyPairs ?? []).flatMap((keyPair) => keyPair.KeyName ? [{ id: keyPair.KeyPairId ?? keyPair.KeyName, name: keyPair.KeyName, fingerprint: keyPair.KeyFingerprint ?? "" }] : []),
            images: images.flatMap(({ category, image }) => {
                if (!image.ImageId) return [];
                return [{ id: image.ImageId, category, ...imageDetails(image, category), description: image.Description ?? "", rootDeviceName: image.RootDeviceName ?? "/dev/xvda" }];
            }),
        };
    }
}
