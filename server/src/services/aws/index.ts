import { DescribeInstancesCommand, DescribeKeyPairsCommand, DescribeSecurityGroupsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { DescribeRepositoriesCommand, ECRClient, PutImageScanningConfigurationCommand, PutImageTagMutabilityCommand } from "@aws-sdk/client-ecr";
import { GetRoleCommand, IAMClient } from "@aws-sdk/client-iam";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DescribeTableCommand, DynamoDBClient, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { GetFunctionCommand, LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, waitUntilFunctionUpdatedV2 } from "@aws-sdk/client-lambda";
import { GetTopicAttributesCommand, SetTopicAttributesCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetQueueAttributesCommand, SetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
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
import { CloudFrontClient, GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CloudFrontService, cloudFrontDetails } from "./resources/cloudfront.js";
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
        if (service === AwsService.CLOUDFRONT_DISTRIBUTION) {
            const result = await new CloudFrontClient({ region: "us-east-1", credentials }).send(new GetDistributionCommand({ Id: externalId }));
            if (!result.Distribution) throw new Error("CloudFront distribution is unavailable.");
            return cloudFrontDetails(result.Distribution, region);
        }
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
            return { service, region, externalId, state: configuration.State ?? "unknown", status: configuration.State === "Pending" || configuration.LastUpdateStatus === "InProgress" ? "PROVISIONING" : configuration.State === "Failed" || configuration.LastUpdateStatus === "Failed" ? "FAILED" : "RUNNING", data: { functionName: configuration.FunctionName, functionArn: configuration.FunctionArn, runtime: configuration.Runtime, handler: configuration.Handler, role: configuration.Role, memorySize: configuration.MemorySize, timeout: configuration.Timeout, lastModified: configuration.LastModified, version: configuration.Version, packageType: configuration.PackageType, architectures: configuration.Architectures, stateReason: configuration.StateReason, lastUpdateStatus: configuration.LastUpdateStatus, lastUpdateStatusReason: configuration.LastUpdateStatusReason, codeSize: configuration.CodeSize, vpcConfig: configuration.VpcConfig } };
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
        return { service, region, externalId, state: "available", status: "RUNNING", data: { roleName: role.RoleName, roleId: role.RoleId, arn: role.Arn, roleArn: role.Arn, path: role.Path, createDate: role.CreateDate?.toISOString(), maxSessionDuration: role.MaxSessionDuration, description: role.Description } };
    }

    async createResource(request: AwsResourceCreateRequest, credentials: AwsCredentials, region = this.defaultRegion, onCreated: (details: AwsResourceDetails) => Promise<void> = async () => {}, callerReference?: string): Promise<AwsResourceResult> {
        if (request.service === AwsService.CLOUDFRONT_DISTRIBUTION) {
            const details = await new CloudFrontService(new CloudFrontClient({ region: "us-east-1", credentials }), new S3Client({ region, credentials }), region).create(request.config, onCreated, callerReference);
            return { service: request.service, region, name: request.config.comment || details.externalId, externalId: details.externalId, data: details.data };
        }
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
            }, region).createBucket(request.config, async (bucketName) => onCreated({ service: request.service, region, externalId: bucketName, state: "configuring", status: "PROVISIONING", data: { bucketName } }));
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
        if (request.service === AwsService.CLOUDFRONT_DISTRIBUTION) {
            const details = await new CloudFrontService(new CloudFrontClient({ region: "us-east-1", credentials }), new S3Client({ region, credentials }), region).update(externalId, request.config);
            return { service: request.service, region, name: request.config.comment || externalId, externalId, data: details.data };
        }
        if (request.service === AwsService.SNS_TOPIC) {
            const client = new SNSClient({ region, credentials });
            await client.send(new SetTopicAttributesCommand({ TopicArn: externalId, AttributeName: "DisplayName", AttributeValue: request.config.displayName ?? "" }));
            if (request.config.fifoTopic) {
                await client.send(new SetTopicAttributesCommand({ TopicArn: externalId, AttributeName: "ContentBasedDeduplication", AttributeValue: String(request.config.contentBasedDeduplication ?? false) }));
            }
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: request.config.topicName, externalId, data: details.data };
        }
        if (request.service === AwsService.LAMBDA_FUNCTION) {
            const client = new LambdaClient({ region, credentials });
            const config = request.config;
            const current = await client.send(new GetFunctionCommand({ FunctionName: externalId }));
            if (current.Configuration?.FunctionName !== config.functionName) throw new Error("A Lambda function cannot be renamed.");
            await client.send(new UpdateFunctionConfigurationCommand({
                FunctionName: externalId, Role: config.roleArn, Handler: config.handler, Runtime: config.runtime,
                Description: config.description ?? "", MemorySize: config.memorySize ?? 128, Timeout: config.timeout ?? 3,
            }));
            await waitUntilFunctionUpdatedV2({ client, maxWaitTime: 120 }, { FunctionName: externalId });
            await client.send(new UpdateFunctionCodeCommand({ FunctionName: externalId, ZipFile: Buffer.from(config.codeZipBase64, "base64") }));
            await waitUntilFunctionUpdatedV2({ client, maxWaitTime: 120 }, { FunctionName: externalId });
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: config.functionName, externalId, data: details.data };
        }
        if (request.service === AwsService.ECR_REPOSITORY) {
            if (request.config.repositoryName !== externalId) throw new Error("An ECR repository cannot be renamed.");
            const client = new ECRClient({ region, credentials });
            await client.send(new PutImageTagMutabilityCommand({ repositoryName: externalId, imageTagMutability: request.config.imageTagMutability ?? "MUTABLE" }));
            await client.send(new PutImageScanningConfigurationCommand({ repositoryName: externalId, imageScanningConfiguration: { scanOnPush: request.config.scanOnPush ?? false } }));
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: externalId, externalId, data: details.data };
        }
        if (request.service === AwsService.DYNAMODB_TABLE) {
            const config = request.config;
            if (config.tableName !== externalId) throw new Error("A DynamoDB table cannot be renamed.");
            await new DynamoDBClient({ region, credentials }).send(new UpdateTableCommand({
                TableName: externalId, BillingMode: config.billingMode ?? "PAY_PER_REQUEST",
                ...(config.billingMode === "PROVISIONED" && { ProvisionedThroughput: { ReadCapacityUnits: config.readCapacityUnits ?? 1, WriteCapacityUnits: config.writeCapacityUnits ?? 1 } }),
            }));
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: externalId, externalId, data: details.data };
        }
        if (request.service === AwsService.SQS_QUEUE) {
            await new SQSClient({ region, credentials }).send(new SetQueueAttributesCommand({
                QueueUrl: externalId, Attributes: {
                    VisibilityTimeout: String(request.config.visibilityTimeoutSeconds ?? 30),
                    MessageRetentionPeriod: String(request.config.messageRetentionPeriodSeconds ?? 345600),
                },
            }));
            const details = await this.getResourceDetails(request.service, externalId, credentials, region);
            return { service: request.service, region, name: request.config.queueName, externalId, data: details.data };
        }
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

    async deleteResource(service: AwsResourceCreateRequest["service"], externalId: string, credentials: AwsCredentials, region = this.defaultRegion, previousState?: unknown): Promise<AwsResourceDeleteResult> {
        if (service === AwsService.CLOUDFRONT_DISTRIBUTION) {
            const data = await new CloudFrontService(new CloudFrontClient({ region: "us-east-1", credentials }), new S3Client({ region, credentials }), region).delete(externalId, previousState);
            return { service, region, externalId, data };
        }
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
