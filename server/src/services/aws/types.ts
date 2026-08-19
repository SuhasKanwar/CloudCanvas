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

export type AwsResourceCreateRequest =
    | { service: AwsService.EC2_INSTANCE; config: Ec2InstanceRequest }
    | { service: AwsService.ECR_REPOSITORY; config: import("./ecr.js").EcrRepositoryRequest }
    | { service: AwsService.S3_BUCKET; config: import("./s3.js").S3BucketRequest }
    | { service: AwsService.IAM_ROLE; config: import("./iam.js").IamRoleRequest }
    | { service: AwsService.LAMBDA_FUNCTION; config: import("./lambda.js").LambdaFunctionRequest }
    | { service: AwsService.DYNAMODB_TABLE; config: import("./dynamodb.js").DynamoDbTableRequest }
    | { service: AwsService.SQS_QUEUE; config: import("./sqs.js").SqsQueueRequest }
    | { service: AwsService.SNS_TOPIC; config: import("./sns.js").SnsTopicRequest };

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
