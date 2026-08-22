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

export enum AwsService {
    EC2_INSTANCE = "EC2_INSTANCE",
    KEY_PAIR = "KEY_PAIR",
    SECURITY_GROUP = "SECURITY_GROUP",
    ECR_REPOSITORY = "ECR_REPOSITORY",
    S3_BUCKET = "S3_BUCKET",
    IAM_ROLE = "IAM_ROLE",
    LAMBDA_FUNCTION = "LAMBDA_FUNCTION",
    DYNAMODB_TABLE = "DYNAMODB_TABLE",
    SQS_QUEUE = "SQS_QUEUE",
    SNS_TOPIC = "SNS_TOPIC",
}

export type AwsServiceType = AwsService;

export type Ec2InstanceRequest = {
    mode?: "create" | "existing";
    imageId?: string;
    launchTemplateId?: string;
    instanceId?: string;
    instanceType?: string;
    instanceCount?: number;
    keyName?: string;
    securityGroupIds?: string[];
    subnetId?: string;
    iamInstanceProfile?: string;
    name?: string;
    userData?: string;
    monitoring?: boolean;
    ebsOptimized?: boolean;
    disableApiTermination?: boolean;
    shutdownBehavior?: "stop" | "terminate";
    metadataHttpTokens?: "optional" | "required";
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

export type AwsResourceCreateRequest =
    | { service: AwsService.EC2_INSTANCE; config: Ec2InstanceRequest }
    | { service: AwsService.KEY_PAIR; config: import("./resources/keyPair.js").KeyPairRequest }
    | { service: AwsService.SECURITY_GROUP; config: import("./resources/securityGroup.js").SecurityGroupRequest }
    | { service: AwsService.ECR_REPOSITORY; config: import("./resources/ecr.js").EcrRepositoryRequest }
    | { service: AwsService.S3_BUCKET; config: import("./resources/s3.js").S3BucketRequest }
    | { service: AwsService.IAM_ROLE; config: import("./resources/iam.js").IamRoleRequest }
    | { service: AwsService.LAMBDA_FUNCTION; config: import("./resources/lambda.js").LambdaFunctionRequest }
    | { service: AwsService.DYNAMODB_TABLE; config: import("./resources/dynamodb.js").DynamoDbTableRequest }
    | { service: AwsService.SQS_QUEUE; config: import("./resources/sqs.js").SqsQueueRequest }
    | { service: AwsService.SNS_TOPIC; config: import("./resources/sns.js").SnsTopicRequest };

export type AwsResourceResult = {
    service: AwsServiceType;
    region: string;
    name: string;
    externalId: string;
    data: unknown;
};

export type AwsResourceDeleteResult = {
    service: AwsServiceType;
    region: string;
    externalId: string;
    data: unknown;
};
