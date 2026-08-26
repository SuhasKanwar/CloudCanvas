import { DescribeInstancesCommand, DescribeKeyPairsCommand, DescribeSecurityGroupsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { DescribeRepositoriesCommand, ECRClient } from "@aws-sdk/client-ecr";
import { GetRoleCommand, IAMClient } from "@aws-sdk/client-iam";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetTopicAttributesCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AWS_REGION } from "../../lib/config.js";
import { ec2InstanceDetails, Ec2Service } from "./resources/ec2.js";
import { EcrService } from "./resources/ecr.js";
import { IamService } from "./resources/iam.js";
import { LambdaService } from "./resources/lambda.js";
import { DynamoDbService } from "./resources/dynamodb.js";
import { S3Service } from "./resources/s3.js";
import { SnsService } from "./resources/sns.js";
import { SqsService } from "./resources/sqs.js";
import { SecurityGroupService } from "./resources/securityGroup.js";
import { KeyPairService } from "./resources/keyPair.js";
import { AwsService } from "./types.js";
import { AwsCatalogService, type AwsResourceCatalog } from "./catalog.js";
import { cacheService } from "../cacheService.js";
import type {
    AwsCredentials,
    AwsResourceCreateRequest,
    AwsResourceDeleteResult,
    AwsResourceDetails,
    AwsResourceResult,
    Ec2InstanceRequest,
    Ec2InstanceResult,
    Ec2TerminationResult,
} from "./types.js";

export class AWSResourceManager {
    constructor(private readonly defaultRegion = AWS_REGION) {}

    private catalogCacheKey(connectionId: string, region: string) {
        return `aws-catalog:${connectionId}:${region}`;
    }

    createEc2Instance(request: Ec2InstanceRequest, credentials: AwsCredentials, region = this.defaultRegion): Promise<Ec2InstanceResult> {
        const client = new EC2Client({ region, credentials });
        return new Ec2Service({
            run: (command) => client.send(command),
            terminate: (command) => client.send(command),
            modify: (command) => client.send(command),
            monitor: (command) => client.send(command),
            unmonitor: (command) => client.send(command),
        }, region).createInstance(request);
    }

    terminateEc2Instances(instanceIds: string[], credentials: AwsCredentials, region = this.defaultRegion): Promise<Ec2TerminationResult> {
        const client = new EC2Client({ region, credentials });
        return new Ec2Service({
            run: (command) => client.send(command),
            terminate: (command) => client.send(command),
            modify: (command) => client.send(command),
            monitor: (command) => client.send(command),
            unmonitor: (command) => client.send(command),
        }, region).terminateInstances({ instanceIds });
    }

    async getCatalog(credentials: AwsCredentials, region = this.defaultRegion, connectionId?: string): Promise<AwsResourceCatalog> {
        const cacheKey = connectionId ? this.catalogCacheKey(connectionId, region) : undefined;
        const cachedCatalog = cacheKey ? cacheService.get<AwsResourceCatalog>(cacheKey) : undefined;
        if (cachedCatalog) return cachedCatalog;
        const ec2 = new EC2Client({ region, credentials });
        const iam = new IAMClient({ region, credentials });
        const catalog = await new AwsCatalogService({
            securityGroups: (command) => ec2.send(command),
            vpcs: (command) => ec2.send(command),
            subnets: (command) => ec2.send(command),
            launchTemplates: (command) => ec2.send(command),
            instances: (command) => ec2.send(command),
            instanceTypes: (command) => ec2.send(command),
            images: (command) => ec2.send(command),
            keyPairs: (command) => ec2.send(command),
            instanceProfiles: (command) => iam.send(command),
        }).list();
        if (cacheKey) cacheService.set(cacheKey, catalog, 120);
        return catalog;
    }

    invalidateCatalog(connectionId: string, region = this.defaultRegion) {
        cacheService.del(this.catalogCacheKey(connectionId, region));
    }

    async getResourceDetails(service: AwsService, externalId: string, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceDetails> {
        if (service === AwsService.EC2_INSTANCE) {
            const output = await new EC2Client({ region, credentials }).send(new DescribeInstancesCommand({ InstanceIds: [externalId] }));
            const instance = output.Reservations?.flatMap((reservation) => reservation.Instances ?? []).find((entry) => entry.InstanceId === externalId);
            if (!instance) throw new Error(`EC2 instance ${externalId} was not found.`);
            return ec2InstanceDetails(instance, region, externalId);
        }
        if (service === AwsService.KEY_PAIR) {
            const output = await new EC2Client({ region, credentials }).send(new DescribeKeyPairsCommand({ KeyNames: [externalId] }));
            const keyPair = output.KeyPairs?.[0];
            if (!keyPair) throw new Error(`EC2 key pair ${externalId} was not found.`);
            return { service, region, externalId, state: "available", status: "RUNNING", data: { keyName: keyPair.KeyName, keyPairId: keyPair.KeyPairId, fingerprint: keyPair.KeyFingerprint, keyType: keyPair.KeyType, createTime: keyPair.CreateTime?.toISOString() } };
        }
        if (service === AwsService.SECURITY_GROUP) {
            const output = await new EC2Client({ region, credentials }).send(new DescribeSecurityGroupsCommand({ GroupIds: [externalId] }));
            const group = output.SecurityGroups?.[0];
            if (!group) throw new Error(`Security group ${externalId} was not found.`);
            return { service, region, externalId, state: "available", status: "RUNNING", data: { groupId: group.GroupId, groupName: group.GroupName, description: group.Description, vpcId: group.VpcId, ownerId: group.OwnerId, ingressRuleCount: group.IpPermissions?.length ?? 0, egressRuleCount: group.IpPermissionsEgress?.length ?? 0 } };
        }
        if (service === AwsService.ECR_REPOSITORY) {
            const output = await new ECRClient({ region, credentials }).send(new DescribeRepositoriesCommand({ repositoryNames: [externalId] }));
            const repository = output.repositories?.[0];
            if (!repository) throw new Error(`ECR repository ${externalId} was not found.`);
            return { service, region, externalId, state: "available", status: "RUNNING", data: { repositoryName: repository.repositoryName, repositoryArn: repository.repositoryArn, repositoryUri: repository.repositoryUri, createdAt: repository.createdAt?.toISOString(), imageTagMutability: repository.imageTagMutability, encryptionConfiguration: repository.encryptionConfiguration, imageScanningConfiguration: repository.imageScanningConfiguration } };
        }
        if (service === AwsService.S3_BUCKET) {
            const output = await new S3Client({ region, credentials }).send(new HeadBucketCommand({ Bucket: externalId }));
            return { service, region, externalId, state: "available", status: "RUNNING", data: { bucketName: externalId, bucketRegion: output.BucketRegion ?? region, accessPointAlias: output.AccessPointAlias ?? false } };
        }
        if (service === AwsService.LAMBDA_FUNCTION) {
            const output = await new LambdaClient({ region, credentials }).send(new GetFunctionCommand({ FunctionName: externalId }));
            const configuration = output.Configuration;
            if (!configuration) throw new Error(`Lambda function ${externalId} was not found.`);
            return { service, region, externalId, state: configuration.State ?? "unknown", status: configuration.State === "Pending" ? "PROVISIONING" : configuration.State === "Failed" ? "FAILED" : "RUNNING", data: { functionName: configuration.FunctionName, functionArn: configuration.FunctionArn, runtime: configuration.Runtime, handler: configuration.Handler, role: configuration.Role, memorySize: configuration.MemorySize, timeout: configuration.Timeout, lastModified: configuration.LastModified, version: configuration.Version, packageType: configuration.PackageType, architectures: configuration.Architectures, stateReason: configuration.StateReason, vpcConfig: configuration.VpcConfig } };
        }
        if (service === AwsService.DYNAMODB_TABLE) {
            const output = await new DynamoDBClient({ region, credentials }).send(new DescribeTableCommand({ TableName: externalId }));
            const table = output.Table;
            if (!table) throw new Error(`DynamoDB table ${externalId} was not found.`);
            return { service, region, externalId, state: table.TableStatus ?? "unknown", status: table.TableStatus === "CREATING" || table.TableStatus === "UPDATING" ? "PROVISIONING" : table.TableStatus === "DELETING" ? "DELETING" : table.TableStatus === "INACCESSIBLE_ENCRYPTION_CREDENTIALS" ? "FAILED" : "RUNNING", data: { tableName: table.TableName, tableArn: table.TableArn, tableStatus: table.TableStatus, creationDateTime: table.CreationDateTime?.toISOString(), itemCount: table.ItemCount, tableSizeBytes: table.TableSizeBytes, billingMode: table.BillingModeSummary?.BillingMode, keySchema: table.KeySchema, provisionedThroughput: table.ProvisionedThroughput, tableClass: table.TableClassSummary?.TableClass } };
        }
        if (service === AwsService.SQS_QUEUE) {
            const output = await new SQSClient({ region, credentials }).send(new GetQueueAttributesCommand({ QueueUrl: externalId, AttributeNames: ["All"] }));
            const attributes = output.Attributes ?? {};
            return { service, region, externalId, state: "available", status: "RUNNING", data: { queueUrl: externalId, queueArn: attributes.QueueArn, createdTimestamp: attributes.CreatedTimestamp, lastModifiedTimestamp: attributes.LastModifiedTimestamp, approximateNumberOfMessages: attributes.ApproximateNumberOfMessages, approximateNumberOfMessagesNotVisible: attributes.ApproximateNumberOfMessagesNotVisible, visibilityTimeout: attributes.VisibilityTimeout, messageRetentionPeriod: attributes.MessageRetentionPeriod, receiveMessageWaitTimeSeconds: attributes.ReceiveMessageWaitTimeSeconds, sqsManagedSseEnabled: attributes.SqsManagedSseEnabled } };
        }
        if (service === AwsService.SNS_TOPIC) {
            const output = await new SNSClient({ region, credentials }).send(new GetTopicAttributesCommand({ TopicArn: externalId }));
            const attributes = output.Attributes ?? {};
            return { service, region, externalId, state: "available", status: "RUNNING", data: { topicArn: attributes.TopicArn ?? externalId, displayName: attributes.DisplayName, owner: attributes.Owner, subscriptionsConfirmed: attributes.SubscriptionsConfirmed, subscriptionsPending: attributes.SubscriptionsPending, subscriptionsDeleted: attributes.SubscriptionsDeleted, fifoTopic: attributes.FifoTopic, contentBasedDeduplication: attributes.ContentBasedDeduplication } };
        }
        const output = await new IAMClient({ region, credentials }).send(new GetRoleCommand({ RoleName: externalId }));
        const role = output.Role;
        if (!role) throw new Error(`IAM role ${externalId} was not found.`);
        return { service, region, externalId, state: "available", status: "RUNNING", data: { roleName: role.RoleName, roleId: role.RoleId, arn: role.Arn, path: role.Path, createDate: role.CreateDate?.toISOString(), maxSessionDuration: role.MaxSessionDuration, description: role.Description } };
    }

    async createResource(request: AwsResourceCreateRequest, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceResult> {
        if (request.service === AwsService.EC2_INSTANCE) {
            if (request.config.mode === "existing") {
                if (!request.config.instanceId) throw new Error("Choose an existing EC2 instance.");
                return { service: request.service, region, name: request.config.name ?? request.config.instanceId, externalId: request.config.instanceId, data: { instanceId: request.config.instanceId, instances: [{ instanceId: request.config.instanceId }] } };
            }
            const data = await this.createEc2Instance(request.config, credentials, region);
            const externalId = data.instances[0]?.instanceId;
            if (!externalId) throw new Error("AWS did not return an EC2 instance ID.");
            return { service: request.service, region, name: request.config.name ?? externalId, externalId, data };
        }
        if (request.service === AwsService.KEY_PAIR) {
            const client = new EC2Client({ region, credentials });
            const data = await new KeyPairService({ import: (command) => client.send(command), delete: (command) => client.send(command) }, region).create(request.config);
            return { service: request.service, region, name: data.keyName, externalId: data.keyName, data };
        }
        if (request.service === AwsService.SECURITY_GROUP) {
            const client = new EC2Client({ region, credentials });
            const data = await new SecurityGroupService({
                create: (command) => client.send(command),
                authorizeIngress: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).create(request.config);
            return { service: request.service, region, name: data.groupName, externalId: data.securityGroupId, data };
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
                deleteObjects: (command) => client.send(command),
                listVersions: (command) => client.send(command),
                listObjects: (command) => client.send(command),
                getPolicy: (command) => client.send(command),
                putPolicy: (command) => client.send(command),
                putEncryption: (command) => client.send(command),
                putVersioning: (command) => client.send(command),
                putPublicAccessBlock: (command) => client.send(command),
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
            attach: (command) => client.send(command),
            listAttached: (command) => client.send(command),
            detach: (command) => client.send(command),
            delete: (command) => client.send(command),
        }, region).createRole(request.config);
        return { service: request.service, region, name: data.roleName, externalId: data.roleName, data };
    }

    async updateResource(request: AwsResourceCreateRequest, externalId: string, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceResult> {
        if (request.service === AwsService.EC2_INSTANCE) {
            const client = new EC2Client({ region, credentials });
            await new Ec2Service({
                run: (command) => client.send(command),
                terminate: (command) => client.send(command),
                modify: (command) => client.send(command),
                monitor: (command) => client.send(command),
                unmonitor: (command) => client.send(command),
            }, region).updateInstance(externalId, request.config);
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: request.config.name ?? externalId, externalId, data: details.data };
        }
        if (request.service !== AwsService.S3_BUCKET) throw new Error(`${request.service} configuration updates require an explicit resource operation.`);
        if (request.config.bucketName !== externalId) throw new Error("Changing an S3 bucket name requires a new resource.");
        const client = new S3Client({ region, credentials });
        const data = await new S3Service({
            create: (command) => client.send(command),
            delete: (command) => client.send(command),
            deleteObjects: (command) => client.send(command),
            listVersions: (command) => client.send(command),
            listObjects: (command) => client.send(command),
            getPolicy: (command) => client.send(command),
            putPolicy: (command) => client.send(command),
            putEncryption: (command) => client.send(command),
            putVersioning: (command) => client.send(command),
            putPublicAccessBlock: (command) => client.send(command),
        }, region).configureBucket(request.config);
        return { service: request.service, region, name: data.bucketName, externalId, data };
    }

    async deleteResource(service: AwsResourceCreateRequest["service"], externalId: string, credentials: AwsCredentials, region = this.defaultRegion): Promise<AwsResourceDeleteResult> {
        if (service === AwsService.EC2_INSTANCE) {
            const data = await this.terminateEc2Instances([externalId], credentials, region);
            return { service, region, externalId, data };
        }
        if (service === AwsService.KEY_PAIR) {
            const client = new EC2Client({ region, credentials });
            const data = await new KeyPairService({ import: (command) => client.send(command), delete: (command) => client.send(command) }, region).delete(externalId);
            return { service, region, externalId, data };
        }
        if (service === AwsService.SECURITY_GROUP) {
            const client = new EC2Client({ region, credentials });
            const data = await new SecurityGroupService({
                create: (command) => client.send(command),
                authorizeIngress: (command) => client.send(command),
                delete: (command) => client.send(command),
            }, region).delete(externalId);
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
                deleteObjects: (command) => client.send(command),
                listVersions: (command) => client.send(command),
                listObjects: (command) => client.send(command),
                getPolicy: (command) => client.send(command),
                putPolicy: (command) => client.send(command),
                putEncryption: (command) => client.send(command),
                putVersioning: (command) => client.send(command),
                putPublicAccessBlock: (command) => client.send(command),
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
            attach: (command) => client.send(command),
            listAttached: (command) => client.send(command),
            detach: (command) => client.send(command),
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
    AwsResourceDetails,
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
