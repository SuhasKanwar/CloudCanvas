import type { RunInstancesCommand, RunInstancesCommandOutput } from "@aws-sdk/client-ec2";

export type AwsCredentials = {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
};

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

export type Ec2InstanceResult = {
    region: string;
    instances: Array<{
        instanceId: string | undefined;
        state: string | undefined;
        imageId: string | undefined;
        instanceType: string | undefined;
        privateIpAddress: string | undefined;
        publicIpAddress: string | undefined;
    }>;
};

export type Ec2CommandSender = (command: RunInstancesCommand) => Promise<RunInstancesCommandOutput>;
