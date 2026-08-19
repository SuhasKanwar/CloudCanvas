import { EC2Client } from "@aws-sdk/client-ec2";
import { ECRClient } from "@aws-sdk/client-ecr";
import { IAMClient } from "@aws-sdk/client-iam";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SNSClient } from "@aws-sdk/client-sns";
import { SQSClient } from "@aws-sdk/client-sqs";
import { AWS_REGION } from "../../lib/config.js";
import { Ec2Service } from "./resources/ec2.js";
import { EcrService } from "./resources/ecr.js";
import { IamService } from "./resources/iam.js";
import { LambdaService } from "./resources/lambda.js";
import { DynamoDbService } from "./resources/dynamodb.js";
import { S3Service } from "./resources/s3.js";
import { SnsService } from "./resources/sns.js";
import { SqsService } from "./resources/sqs.js";
import { AwsService } from "./types.js";
import type {
    AwsCredentials,
    AwsResourceCreateRequest,
    AwsResourceDeleteResult,
    AwsResourceResult,
    Ec2InstanceRequest,
    Ec2InstanceResult,
    Ec2TerminationResult,
} from "./types.js";

export class AWSResourceManager {
    constructor(private readonly defaultRegion = AWS_REGION) {}

    createEc2Instance(request: Ec2InstanceRequest, credentials: AwsCredentials, region = this.defaultRegion): Promise<Ec2InstanceResult> {
        const client = new EC2Client({ region, credentials });
        return new Ec2Service({
            run: (command) => client.send(command),
            terminate: (command) => client.send(command),
        }, region).createInstance(request);
    }

    terminateEc2Instances(instanceIds: string[], credentials: AwsCredentials, region = this.defaultRegion): Promise<Ec2TerminationResult> {
        const client = new EC2Client({ region, credentials });
        return new Ec2Service({
            run: (command) => client.send(command),
            terminate: (command) => client.send(command),
        }, region).terminateInstances({ instanceIds });
    }

    async createResource(request: AwsResourceCreateRequest, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceResult> {
        if (request.service === AwsService.EC2_INSTANCE) {
            const data = await this.createEc2Instance(request.config, credentials, region);
            const externalId = data.instances[0]?.instanceId;
            if (!externalId) throw new Error("AWS did not return an EC2 instance ID.");
            return { service: request.service, region, name: request.config.name ?? externalId, externalId, data };
        }
        if (request.service === AwsService.ECR_REPOSITORY) {
            const client = new ECRClient({ region, credentials });
            const data = await new EcrService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createRepository(request.config);
            return { service: request.service, region, name: data.repositoryName, externalId: data.repositoryName, data };
        }
        if (request.service === AwsService.S3_BUCKET) {
            const client = new S3Client({ region, credentials });
            const data = await new S3Service({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createBucket(request.config);
            return { service: request.service, region, name: data.bucketName, externalId: data.bucketName, data };
        }
        if (request.service === AwsService.LAMBDA_FUNCTION) {
            const client = new LambdaClient({ region, credentials });
            const data = await new LambdaService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createFunction(request.config);
            return { service: request.service, region, name: data.functionName, externalId: data.functionName, data };
        }
        if (request.service === AwsService.DYNAMODB_TABLE) {
            const client = new DynamoDBClient({ region, credentials });
            const data = await new DynamoDbService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createTable(request.config);
            return { service: request.service, region, name: data.tableName, externalId: data.tableName, data };
        }
        if (request.service === AwsService.SQS_QUEUE) {
            const client = new SQSClient({ region, credentials });
            const data = await new SqsService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createQueue(request.config);
            return { service: request.service, region, name: data.queueName, externalId: data.queueUrl, data };
        }
        if (request.service === AwsService.SNS_TOPIC) {
            const client = new SNSClient({ region, credentials });
            const data = await new SnsService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).createTopic(request.config);
            return { service: request.service, region, name: data.topicName, externalId: data.topicArn, data };
        }
        const client = new IAMClient({ region, credentials });
        const data = await new IamService({
            create: (command) => client.send(command),
            delete: (command) => client.send(command),
        }, region).createRole(request.config);
        return { service: request.service, region, name: data.roleName, externalId: data.roleName, data };
    }

    async deleteResource(service: AwsResourceCreateRequest["service"], externalId: string, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceDeleteResult> {
        if (service === AwsService.EC2_INSTANCE) {
            const data = await this.terminateEc2Instances([externalId], credentials, region);
            return { service, region, externalId, data };
        }
        if (service === AwsService.ECR_REPOSITORY) {
            const client = new ECRClient({ region, credentials });
            const data = await new EcrService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteRepository(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.S3_BUCKET) {
            const client = new S3Client({ region, credentials });
            const data = await new S3Service({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteBucket(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.LAMBDA_FUNCTION) {
            const client = new LambdaClient({ region, credentials });
            const data = await new LambdaService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteFunction(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.DYNAMODB_TABLE) {
            const client = new DynamoDBClient({ region, credentials });
            const data = await new DynamoDbService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteTable(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.SQS_QUEUE) {
            const client = new SQSClient({ region, credentials });
            const data = await new SqsService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteQueue(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.SNS_TOPIC) {
            const client = new SNSClient({ region, credentials });
            const data = await new SnsService({
                create: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).deleteTopic(externalId);
            return { service, region, externalId, data };
        }
        const client = new IAMClient({ region, credentials });
        const data = await new IamService({
            create: (command) => client.send(command),
            delete: (command) => client.send(command),
        }, region).deleteRole(externalId);
        return { service, region, externalId, data };
    }
}

export const awsResourceManager = new AWSResourceManager();
export { decryptAwsSecret, encryptAwsSecret } from "./crypto.js";
export { Ec2Service } from "./resources/ec2.js";
export { EcrService } from "./resources/ecr.js";
export { IamService } from "./resources/iam.js";
export { LambdaService } from "./resources/lambda.js";
export { DynamoDbService } from "./resources/dynamodb.js";
export { S3Service } from "./resources/s3.js";
export { SnsService } from "./resources/sns.js";
export { SqsService } from "./resources/sqs.js";
export { AwsService } from "./types.js";
export type {
    AwsCredentials,
    AwsResourceCreateRequest,
    AwsResourceDeleteResult,
    AwsResourceResult,
    AwsServiceType,
    Ec2InstanceRequest,
    Ec2InstanceResult,
    Ec2TerminationRequest,
    Ec2TerminationResult,
} from "./types.js";
export type { EcrDeleteResult, EcrRepositoryRequest, EcrRepositoryResult } from "./resources/ecr.js";
export type { IamDeleteResult, IamRoleRequest, IamRoleResult } from "./resources/iam.js";
export type { S3BucketRequest, S3BucketResult, S3DeleteResult } from "./resources/s3.js";
export type { LambdaDeleteResult, LambdaFunctionRequest, LambdaFunctionResult } from "./resources/lambda.js";
export type { DynamoDbDeleteResult, DynamoDbTableRequest, DynamoDbTableResult } from "./resources/dynamodb.js";
export type { SnsDeleteResult, SnsTopicRequest, SnsTopicResult } from "./resources/sns.js";
export type { SqsDeleteResult, SqsQueueRequest, SqsQueueResult } from "./resources/sqs.js";
