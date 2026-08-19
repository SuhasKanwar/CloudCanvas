import type {
    RunInstancesCommand,
    RunInstancesCommandOutput,
    TerminateInstancesCommand,
    TerminateInstancesCommandOutput,
} from "@aws-sdk/client-ec2";

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

export type Ec2TerminationRequest = {
    instanceIds: string[];
};

export type Ec2TerminationResult = {
    region: string;
    instances: Array<{
        instanceId: string | undefined;
        previousState: string | undefined;
        currentState: string | undefined;
    }>;
};

export type Ec2CommandSender = {
    run: (command: RunInstancesCommand) => Promise<RunInstancesCommandOutput>;
    terminate: (command: TerminateInstancesCommand) => Promise<TerminateInstancesCommandOutput>;
};
