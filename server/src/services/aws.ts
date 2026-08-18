import { Buffer } from "node:buffer";
import {
    EC2Client,
    RunInstancesCommand,
    type _InstanceType,
    type RunInstancesCommandInput,
} from "@aws-sdk/client-ec2";
import { AWS_REGION } from "../lib/config.js";

export type Ec2InstanceRequest = {
    imageId: string;
    instanceType?: string;
    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;
    name?: string;
    userData?: string;
    dryRun?: boolean;
};

export class AWSResourceManager {
    private readonly ec2: EC2Client;
    private readonly region: string;

    constructor(region = AWS_REGION) {
        this.region = region;
        this.ec2 = new EC2Client({ region });
    }

    async createEc2Instance(request: Ec2InstanceRequest) {
        if (!request.imageId) {
            throw new Error("imageId is required to create an EC2 instance.");
        }

        const input: RunInstancesCommandInput = {
            ImageId: request.imageId,
            InstanceType: (request.instanceType || "t3.micro") as _InstanceType,
            MinCount: 1,
            MaxCount: 1,
        };

        if (request.keyName) input.KeyName = request.keyName;
        if (request.securityGroupIds?.length) input.SecurityGroupIds = request.securityGroupIds;
        if (request.subnetId) input.SubnetId = request.subnetId;
        if (request.userData) input.UserData = Buffer.from(request.userData).toString("base64");
        if (request.dryRun) input.DryRun = true;
        if (request.name) {
            input.TagSpecifications = [{
                ResourceType: "instance",
                Tags: [{ Key: "Name", Value: request.name }],
            }];
        }

        const result = await this.ec2.send(new RunInstancesCommand(input));
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

export const awsResourceManager = new AWSResourceManager();
