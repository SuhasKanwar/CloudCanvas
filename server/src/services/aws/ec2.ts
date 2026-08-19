import { Buffer } from "node:buffer";
import {
    RunInstancesCommand,
    TerminateInstancesCommand,
    type _InstanceType,
    type RunInstancesCommandInput,
    type TerminateInstancesCommandInput,
} from "@aws-sdk/client-ec2";
import type {
    Ec2CommandSender,
    Ec2InstanceRequest,
    Ec2InstanceResult,
    Ec2TerminationRequest,
    Ec2TerminationResult,
} from "./types.js";

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
