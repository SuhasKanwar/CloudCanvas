import { Buffer } from "node:buffer";
import {
    RunInstancesCommand,
    TerminateInstancesCommand,
    type Instance,
    type _InstanceType,
    type RunInstancesCommandInput,
    type TerminateInstancesCommandInput,
} from "@aws-sdk/client-ec2";
import {
    AwsService,
    type AwsResourceDetails,
    type Ec2CommandSender,
    type Ec2InstanceRequest,
    type Ec2InstanceResult,
    type Ec2TerminationRequest,
    type Ec2TerminationResult,
} from "../types.js";

export function ec2InstanceDetails(instance: Instance, region: string, externalId: string): AwsResourceDetails {
    const state = instance.State?.Name ?? "unknown";
    return {
        service: AwsService.EC2_INSTANCE,
        region,
        externalId,
        state,
        status: state === "terminated" ? "TERMINATED" : state === "pending" ? "PROVISIONING" : state === "shutting-down" ? "DELETING" : "RUNNING",
        data: {
            instanceId: instance.InstanceId,
            state,
            imageId: instance.ImageId,
            instanceType: instance.InstanceType,
            privateIpAddress: instance.PrivateIpAddress,
            publicIpAddress: instance.PublicIpAddress,
            privateDnsName: instance.PrivateDnsName,
            publicDnsName: instance.PublicDnsName,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            availabilityZone: instance.Placement?.AvailabilityZone,
            securityGroupIds: instance.SecurityGroups?.flatMap((group) => group.GroupId ? [group.GroupId] : []),
            launchTime: instance.LaunchTime?.toISOString(),
            architecture: instance.Architecture,
            rootDeviceType: instance.RootDeviceType,
        },
    };
}

export class Ec2Service {
    constructor(private readonly send: Ec2CommandSender, private readonly region: string) {}

    async createInstance(request: Ec2InstanceRequest): Promise<Ec2InstanceResult> {
        if (!request.imageId && !request.launchTemplateId) throw new Error("Choose an AMI or launch template to create an EC2 instance.");
        if (request.imageId === "ami-0123456789abcdef0") throw new Error("Choose a real AMI ID available in the selected AWS region.");
        if (request.instanceCount !== undefined && (!Number.isInteger(request.instanceCount) || request.instanceCount < 1)) {
            throw new Error("instanceCount must be a positive whole number.");
        }
        if (request.rootVolumeSizeGiB !== undefined && (!Number.isInteger(request.rootVolumeSizeGiB) || request.rootVolumeSizeGiB < 1)) {
            throw new Error("Root volume size must be a positive whole number of GiB.");
        }

        const input: RunInstancesCommandInput = {
            ...(request.imageId && { ImageId: request.imageId }),
            ...(request.launchTemplateId && { LaunchTemplate: { LaunchTemplateId: request.launchTemplateId } }),
            InstanceType: (request.instanceType || "t3.micro") as _InstanceType,
            MinCount: request.instanceCount ?? 1,
            MaxCount: request.instanceCount ?? 1,
            ...(request.keyName && { KeyName: request.keyName }),
            ...(request.securityGroupIds?.length && { SecurityGroupIds: request.securityGroupIds }),
            ...(request.subnetId && { SubnetId: request.subnetId }),
            ...(request.iamInstanceProfile && { IamInstanceProfile: request.iamInstanceProfile.startsWith("arn:") ? { Arn: request.iamInstanceProfile } : { Name: request.iamInstanceProfile } }),
            ...(request.userData && { UserData: Buffer.from(request.userData).toString("base64") }),
            ...(request.monitoring !== undefined && { Monitoring: { Enabled: request.monitoring } }),
            ...(request.ebsOptimized !== undefined && { EbsOptimized: request.ebsOptimized }),
            ...(request.disableApiTermination !== undefined && { DisableApiTermination: request.disableApiTermination }),
            ...(request.shutdownBehavior && { InstanceInitiatedShutdownBehavior: request.shutdownBehavior }),
            ...(request.metadataHttpTokens && { MetadataOptions: { HttpTokens: request.metadataHttpTokens } }),
            ...(request.rootVolumeSizeGiB && {
                BlockDeviceMappings: [{
                    DeviceName: request.rootDeviceName || "/dev/xvda",
                    Ebs: {
                        VolumeSize: request.rootVolumeSizeGiB,
                        VolumeType: request.rootVolumeType ?? "gp3",
                        DeleteOnTermination: request.deleteRootVolumeOnTermination ?? true,
                    },
                }],
            }),
            ...(request.dryRun && { DryRun: true }),
            ...(request.name && {
                TagSpecifications: [{
                    ResourceType: "instance",
                    Tags: [{ Key: "Name", Value: request.name }],
                }],
            }),
        };

        const result = await this.send.run(new RunInstancesCommand(input));
        return {
            region: this.region,
            instances: result.Instances?.map((instance) => ({
                instanceId: instance.InstanceId,
                state: instance.State?.Name,
                imageId: instance.ImageId,
                instanceType: instance.InstanceType,
                privateIpAddress: instance.PrivateIpAddress,
                publicIpAddress: instance.PublicIpAddress,
            })) ?? [],
        };
    }

    async terminateInstances(request: Ec2TerminationRequest): Promise<Ec2TerminationResult> {
        if (!request.instanceIds.length) throw new Error("At least one EC2 instance ID is required.");

        const input: TerminateInstancesCommandInput = { InstanceIds: request.instanceIds };
        const result = await this.send.terminate(new TerminateInstancesCommand(input));
        return {
            region: this.region,
            instances: result.TerminatingInstances?.map((instance) => ({
                instanceId: instance.InstanceId,
                previousState: instance.PreviousState?.Name,
                currentState: instance.CurrentState?.Name,
            })) ?? [],
        };
    }
}
