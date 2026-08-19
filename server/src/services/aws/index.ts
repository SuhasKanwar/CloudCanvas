import { EC2Client } from "@aws-sdk/client-ec2";
import { AWS_REGION } from "../../lib/config.js";
import { Ec2Service } from "./ec2.js";
import type { AwsCredentials, Ec2InstanceRequest, Ec2InstanceResult } from "./types.js";

export class AWSResourceManager {
    constructor(private readonly defaultRegion = AWS_REGION) {}

    createEc2Instance(request: Ec2InstanceRequest, credentials: AwsCredentials, region = this.defaultRegion): Promise<Ec2InstanceResult> {
        const client = new EC2Client({ region, credentials });
        return new Ec2Service((command) => client.send(command), region).createInstance(request);
    }
}

export const awsResourceManager = new AWSResourceManager();
export { decryptAwsSecret, encryptAwsSecret } from "./crypto.js";
export { Ec2Service } from "./ec2.js";
export type { AwsCredentials, Ec2InstanceRequest, Ec2InstanceResult } from "./types.js";
