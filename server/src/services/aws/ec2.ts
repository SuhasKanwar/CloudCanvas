import { Buffer } from "node:buffer";
import { RunInstancesCommand, type _InstanceType, type RunInstancesCommandInput } from "@aws-sdk/client-ec2";
import type { Ec2CommandSender, Ec2InstanceRequest, Ec2InstanceResult } from "./types.js";

export class Ec2Service {
    constructor(private readonly send: Ec2CommandSender, private readonly region: string) {}

    async createInstance(request: Ec2InstanceRequest): Promise<Ec2InstanceResult> {
        if (!request.imageId) throw new Error("imageId is required to create an EC2 instance.");

        const input: RunInstancesCommandInput = {
            ImageId: request.imageId,
            InstanceType: (request.instanceType || "t3.micro") as _InstanceType,
            MinCount: 1,
            MaxCount: 1,
            ...(request.keyName && { KeyName: request.keyName }),
            ...(request.securityGroupIds?.length && { SecurityGroupIds: request.securityGroupIds }),
            ...(request.subnetId && { SubnetId: request.subnetId }),
            ...(request.userData && { UserData: Buffer.from(request.userData).toString("base64") }),
            ...(request.dryRun && { DryRun: true }),
            ...(request.name && {
                TagSpecifications: [{
                    ResourceType: "instance",
                    Tags: [{ Key: "Name", Value: request.name }],
                }],
            }),
        };

        const result = await this.send(new RunInstancesCommand(input));
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
}
