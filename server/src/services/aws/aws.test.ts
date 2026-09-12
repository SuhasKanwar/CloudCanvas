import assert from "node:assert/strict";
import test from "node:test";
import { ImportKeyPairCommand, ModifyInstanceAttributeCommand, MonitorInstancesCommand, RunInstancesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { AttachRolePolicyCommand, DetachRolePolicyCommand } from "@aws-sdk/client-iam";
import { decryptAwsSecret, encryptAwsSecret } from "./crypto.js";
import { ec2InstanceDetails, Ec2Service } from "./resources/ec2.js";
import { EcrService } from "./resources/ecr.js";
import { IamService } from "./resources/iam.js";
import { S3Service } from "./resources/s3.js";
import { LambdaService } from "./resources/lambda.js";
import { DynamoDbService } from "./resources/dynamodb.js";
import { SqsService } from "./resources/sqs.js";
import { SnsService } from "./resources/sns.js";
import { AwsCatalogService } from "./catalog.js";
import { SecurityGroupService } from "./resources/securityGroup.js";
import { KeyPairService } from "./resources/keyPair.js";
import CacheService from "../cacheService.js";
import { AWSResourceManager } from "./index.js";
import { AwsService } from "./types.js";
import { SQSClient, SetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { SNSClient, SetTopicAttributesCommand } from "@aws-sdk/client-sns";
import { CloudFrontClient, CreateDistributionCommand, CreateOriginAccessControlCommand, GetDistributionCommand, ListCachePoliciesCommand, ListResponseHeadersPoliciesCommand, UpdateDistributionCommand, DeleteDistributionCommand, GetOriginAccessControlCommand, DeleteOriginAccessControlCommand } from "@aws-sdk/client-cloudfront";
import { S3Client, GetBucketEncryptionCommand, GetBucketPolicyCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";
import { CloudFrontService } from "./resources/cloudfront.js";

test("CloudFront retries OAC cleanup after the distribution is gone", async (context) => {
    let removed = false;
    context.mock.method(CloudFrontClient.prototype, "send", async (command: unknown) => {
        if (command instanceof GetDistributionCommand) throw Object.assign(new Error("gone"), { name: "NoSuchDistribution" });
        if (command instanceof GetOriginAccessControlCommand) return { ETag: "version" };
        if (command instanceof DeleteOriginAccessControlCommand) { removed = true; return {}; }
        throw new Error("Unexpected command");
    });
    const service = new CloudFrontService(new CloudFrontClient({}), new S3Client({}), "ap-south-1");
    assert.equal((await service.delete("DIST", { origins: [{ OriginAccessControlId: "oac" }] })).pending, false);
    assert.ok(removed);
});

test("CloudFront provisions private S3 delivery and checkpoints before granting access", async (context) => {
    let checkpointed = false;
    let creation: CreateDistributionCommand | undefined;
    let grant: PutBucketPolicyCommand | undefined;
    context.mock.method(CloudFrontClient.prototype, "send", async (command: unknown) => {
        if (command instanceof ListCachePoliciesCommand) return { CachePolicyList: { Items: [{ CachePolicy: { Id: "cache", CachePolicyConfig: { Name: "Managed-CachingDisabled" } } }] } };
        if (command instanceof ListResponseHeadersPoliciesCommand) return { ResponseHeadersPolicyList: { Items: [{ ResponseHeadersPolicy: { Id: "headers", ResponseHeadersPolicyConfig: { Name: "Managed-SecurityHeadersPolicy" } } }] } };
        if (command instanceof CreateOriginAccessControlCommand) return { OriginAccessControl: { Id: "oac" } };
        if (command instanceof CreateDistributionCommand) {
            creation = command;
            return { Distribution: { Id: "DIST", ARN: "arn:aws:cloudfront::123456789012:distribution/DIST", DomainName: "example.cloudfront.net", Status: "InProgress", DistributionConfig: command.input.DistributionConfig } };
        }
        throw new Error("Unexpected CloudFront command");
    });
    context.mock.method(S3Client.prototype, "send", async (command: unknown) => {
        if (command instanceof GetBucketEncryptionCommand) return { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] } };
        if (command instanceof GetBucketPolicyCommand) return { Policy: JSON.stringify({ Statement: [{ Sid: "KeepMe", Effect: "Deny" }] }) };
        if (command instanceof PutBucketPolicyCommand) { assert.ok(checkpointed); grant = command; }
        return {};
    });
    const service = new CloudFrontService(new CloudFrontClient({}), new S3Client({}), "ap-south-1");
    const details = await service.create({ bucketName: "frontend", spaFallback: true }, async (snapshot) => { assert.equal(snapshot.externalId, "DIST"); checkpointed = true; });
    assert.equal(details.status, "PROVISIONING");
    assert.equal(details.data.url, "https://example.cloudfront.net");
    assert.equal(creation!.input.DistributionConfig!.Origins!.Items![0]!.OriginAccessControlId, "oac");
    assert.equal(creation!.input.DistributionConfig!.DefaultCacheBehavior!.ViewerProtocolPolicy, "redirect-to-https");
    const statements = JSON.parse(grant!.input.Policy!).Statement;
    assert.equal(statements[0].Sid, "KeepMe");
    assert.equal(statements[1].Condition.StringEquals["AWS:SourceAccount"], "123456789012");
});

test("CloudFront deletion waits for disabled configuration to deploy", async (context) => {
    let enabled = true;
    let status = "InProgress";
    const deleted: string[] = [];
    context.mock.method(CloudFrontClient.prototype, "send", async (command: unknown) => {
        if (command instanceof GetDistributionCommand) return { ETag: "version", Distribution: { Id: "DIST", Status: status, DistributionConfig: { Enabled: enabled, Origins: { Quantity: 1, Items: [{ DomainName: "frontend.s3.ap-south-1.amazonaws.com", OriginAccessControlId: "oac" }] } } } };
        if (command instanceof UpdateDistributionCommand) { assert.equal(command.input.IfMatch, "version"); enabled = false; return {}; }
        if (command instanceof DeleteDistributionCommand) { deleted.push("distribution"); return {}; }
        if (command instanceof GetOriginAccessControlCommand) return { ETag: "oac-version" };
        if (command instanceof DeleteOriginAccessControlCommand) { deleted.push("oac"); return {}; }
        throw new Error("Unexpected command");
    });
    context.mock.method(S3Client.prototype, "send", async () => ({}));
    const service = new CloudFrontService(new CloudFrontClient({}), new S3Client({}), "ap-south-1");
    assert.equal((await service.delete("DIST")).pending, true);
    assert.equal((await service.delete("DIST")).pending, true);
    assert.equal(deleted.length, 0);
    status = "Deployed";
    assert.equal((await service.delete("DIST")).pending, false);
    assert.deepEqual(deleted, ["distribution", "oac"]);
});

test("updates SNS FIFO settings without recreating a topic", async (context) => {
    const commands: unknown[] = [];
    context.mock.method(SNSClient.prototype, "send", async (command: unknown) => {
        commands.push(command);
        return { Attributes: {} };
    });
    const arn = "arn:aws:sns:ap-south-1:123456789012:events.fifo";
    await new AWSResourceManager().updateResource({
        service: AwsService.SNS_TOPIC,
        config: { topicName: "events", fifoTopic: true, displayName: "Events", contentBasedDeduplication: true },
    }, arn, { accessKeyId: "test", secretAccessKey: "test" });
    assert.ok(commands[0] instanceof SetTopicAttributesCommand);
    assert.ok(commands[1] instanceof SetTopicAttributesCommand);
    assert.equal(commands[0].input.AttributeValue, "Events");
    assert.equal(commands[1].input.AttributeValue, "true");
    assert.equal(commands.length, 3);
});

test("publishing SQS settings updates the existing queue and refreshes details", async (context) => {
    const commands: unknown[] = [];
    context.mock.method(SQSClient.prototype, "send", async (command: unknown) => {
        commands.push(command);
        return { Attributes: { QueueArn: "arn:aws:sqs:ap-south-1:123456789012:jobs" } };
    });
    const url = "https://sqs.ap-south-1.amazonaws.com/123456789012/jobs";
    const result = await new AWSResourceManager().updateResource({
        service: AwsService.SQS_QUEUE,
        config: { queueName: "jobs", visibilityTimeoutSeconds: 45, messageRetentionPeriodSeconds: 3600 },
    }, url, { accessKeyId: "test", secretAccessKey: "test" });
    assert.ok(commands[0] instanceof SetQueueAttributesCommand);
    assert.deepEqual(commands[0].input, { QueueUrl: url, Attributes: { VisibilityTimeout: "45", MessageRetentionPeriod: "3600" } });
    assert.equal(result.externalId, url);
    assert.equal(commands.length, 2);
});

test("caches and invalidates AWS catalog values", () => {
    const cache = new CacheService(60);
    const key = CacheService.generateCacheKey("aws-catalog", { connectionId: "connection-1", region: "ap-south-1" });
    cache.set(key, { instanceTypes: ["t3.micro"] }, 120);
    assert.deepEqual(cache.get(key), { instanceTypes: ["t3.micro"] });
    cache.del(key);
    assert.equal(cache.get(key), undefined);
});

test("refreshes EC2 instance status and network details", async () => {
    const details = ec2InstanceDetails({
        InstanceId: "i-123",
        State: { Name: "running" },
        ImageId: "ami-123",
        InstanceType: "t3.micro",
        PrivateIpAddress: "10.0.1.15",
        PublicIpAddress: "13.234.1.15",
        VpcId: "vpc-123",
        SubnetId: "subnet-123",
        Placement: { AvailabilityZone: "ap-south-1a" },
    }, "ap-south-1", "i-123");
    assert.equal(details.status, "RUNNING");
    assert.deepEqual(details.data, {
        instanceId: "i-123",
        state: "running",
        imageId: "ami-123",
        instanceType: "t3.micro",
        privateIpAddress: "10.0.1.15",
        publicIpAddress: "13.234.1.15",
        privateDnsName: undefined,
        publicDnsName: undefined,
        vpcId: "vpc-123",
        subnetId: "subnet-123",
        availabilityZone: "ap-south-1a",
        securityGroupIds: undefined,
        launchTime: undefined,
        architecture: undefined,
        rootDeviceType: undefined,
    });
});

test("encrypts and decrypts AWS secrets", () => {
    const encrypted = encryptAwsSecret("secret-value", "test-encryption-key");
    assert.notEqual(encrypted, "secret-value");
    assert.equal(decryptAwsSecret(encrypted, "test-encryption-key"), "secret-value");
    assert.throws(() => decryptAwsSecret(encrypted, "wrong-key"));
});

test("maps EC2 configuration into a RunInstances command", async () => {
    let command: RunInstancesCommand | undefined;
    const service = new Ec2Service({
        run: async (nextCommand) => {
            command = nextCommand;
            return {
                $metadata: {},
                Instances: [{ InstanceId: "i-test", State: { Name: "pending" } }],
            };
        },
        terminate: async () => ({ $metadata: {}, TerminatingInstances: [] }),
    }, "us-east-1");

    const result = await service.createInstance({
        imageId: "ami-0abc1234",
        rootDeviceName: "/dev/xvda",
        rootVolumeSizeGiB: 30,
        rootVolumeType: "gp3",
        deleteRootVolumeOnTermination: false,
        instanceType: "t3.micro",
        instanceCount: 2,
        iamInstanceProfile: "cloudcanvas-profile",
        monitoring: true,
        metadataHttpTokens: "required",
        name: "test-instance",
        userData: "echo hello",
    });

    assert.equal(command?.input.ImageId, "ami-0abc1234");
    assert.equal(command?.input.MinCount, 2);
    assert.equal(command?.input.MaxCount, 2);
    assert.equal(command?.input.IamInstanceProfile?.Name, "cloudcanvas-profile");
    assert.equal(command?.input.Monitoring?.Enabled, true);
    assert.equal(command?.input.MetadataOptions?.HttpTokens, "required");
    assert.equal(command?.input.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize, 30);
    assert.equal(command?.input.BlockDeviceMappings?.[0]?.Ebs?.VolumeType, "gp3");
    assert.equal(command?.input.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination, false);
    assert.equal(command?.input.TagSpecifications?.[0]?.Tags?.[0]?.Value, "test-instance");
    assert.equal(typeof command?.input.UserData, "string");
    assert.equal(result.instances[0]?.instanceId, "i-test");
});

test("maps EC2 termination into a TerminateInstances command", async () => {
    let command: TerminateInstancesCommand | undefined;
    const service = new Ec2Service({
        run: async () => ({ $metadata: {}, Instances: [] }),
        terminate: async (nextCommand) => {
            command = nextCommand;
            return {
                $metadata: {},
                TerminatingInstances: [{
                    InstanceId: "i-test",
                    PreviousState: { Name: "running" },
                    CurrentState: { Name: "shutting-down" },
                }],
            };
        },
    }, "us-east-1");

    const result = await service.terminateInstances({ instanceIds: ["i-test"] });
    assert.deepEqual(command?.input.InstanceIds, ["i-test"]);
    assert.equal(result.instances[0]?.currentState, "shutting-down");
});

test("maps supported EC2 updates without changing the instance type or AMI", async () => {
    const modified: ModifyInstanceAttributeCommand[] = [];
    let monitored = false;
    const service = new Ec2Service({
        run: async () => ({ $metadata: {}, Instances: [] }),
        terminate: async () => ({ $metadata: {}, TerminatingInstances: [] }),
        modify: async (command) => { modified.push(command); return { $metadata: {} }; },
        monitor: async (command) => { monitored = command instanceof MonitorInstancesCommand; return { $metadata: {} }; },
    }, "ap-south-1");
    const result = await service.updateInstance("i-123", { securityGroupIds: ["sg-123"], shutdownBehavior: "stop", disableApiTermination: true, monitoring: true });
    assert.equal(modified[0]?.input.Groups?.[0], "sg-123");
    assert.equal(modified[1]?.input.InstanceInitiatedShutdownBehavior?.Value, "stop");
    assert.equal(modified[2]?.input.DisableApiTermination?.Value, true);
    assert.equal(monitored, true);
    assert.deepEqual(result.updated, ["security groups", "shutdown behavior", "termination protection", "detailed monitoring"]);
});

test("maps ECR repository create and delete", async () => {
    const commands: string[] = [];
    const service = new EcrService({
        create: async (command) => {
            commands.push(command.input.repositoryName ?? "");
            return { $metadata: {}, repository: { repositoryName: "cloudcanvas" } };
        },
        delete: async (command) => {
            commands.push(command.input.repositoryName ?? "");
            return { $metadata: {} };
        },
    }, "us-east-1");

    assert.equal((await service.createRepository({ repositoryName: "cloudcanvas" })).repositoryName, "cloudcanvas");
    assert.equal((await service.deleteRepository("cloudcanvas")).repositoryName, "cloudcanvas");
    assert.deepEqual(commands, ["cloudcanvas", "cloudcanvas"]);
});

test("maps S3 bucket create and delete", async () => {
    let createLocation: string | undefined;
    let versioningStatus: string | undefined;
    let checkpointed = false;
    let deletedObjectBatches = 0;
    const service = new S3Service({
        create: async (command) => {
            createLocation = command.input.CreateBucketConfiguration?.LocationConstraint;
            return { $metadata: {}, Location: "/cloudcanvas" };
        },
        delete: async () => ({ $metadata: {} }),
        deleteObjects: async () => { deletedObjectBatches += 1; return { $metadata: {} }; },
        listVersions: async () => ({ $metadata: {}, Versions: [{ Key: "versioned", VersionId: "v1" }] }),
        listObjects: async () => ({ $metadata: {}, Contents: [{ Key: "current" }] }),
        getPolicy: async () => { const error = new Error("missing"); error.name = "NoSuchBucketPolicy"; throw error; },
        putPolicy: async () => ({ $metadata: {} }),
        putEncryption: async () => ({ $metadata: {} }),
        putVersioning: async (command) => { assert.ok(checkpointed); versioningStatus = command.input.VersioningConfiguration?.Status; return { $metadata: {} }; },
        putPublicAccessBlock: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createBucket({ bucketName: "cloudcanvas", versioning: true, blockPublicAccess: true, encryption: "SSE-S3", enforceHttps: true }, async (name) => { assert.equal(name, "cloudcanvas"); checkpointed = true; });
    await service.deleteBucket("cloudcanvas");
    assert.equal(createLocation, "ap-south-1");
    assert.equal(versioningStatus, "Enabled");
    assert.equal(deletedObjectBatches, 2);
    assert.equal(result.bucketName, "cloudcanvas");
});

test("maps IAM role creation, policy attachment, and deletion", async () => {
    const commands: string[] = [];
    const service = new IamService({
        create: async (command) => {
            commands.push(command.input.RoleName ?? "");
            return {
                $metadata: {},
                Role: {
                    Path: "/",
                    Arn: "arn:aws:iam::123456789012:role/cloudcanvas-role",
                    CreateDate: new Date(),
                    RoleName: "cloudcanvas-role",
                    RoleId: "role-id",
                },
            };
        },
        attach: async (command) => {
            assert.ok(command instanceof AttachRolePolicyCommand);
            commands.push(command.input.PolicyArn ?? "");
            return { $metadata: {} };
        },
        listAttached: async () => ({ $metadata: {}, AttachedPolicies: [{ PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess" }] }),
        detach: async (command) => {
            assert.ok(command instanceof DetachRolePolicyCommand);
            commands.push(command.input.PolicyArn ?? "");
            return { $metadata: {} };
        },
        delete: async (command) => {
            commands.push(command.input.RoleName ?? "");
            return { $metadata: {} };
        },
    }, "us-east-1");

    assert.equal((await service.createRole({ roleName: "cloudcanvas-role", trustedService: "ec2.amazonaws.com", managedPolicyArns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"] })).roleId, "role-id");
    await service.deleteRole("cloudcanvas-role");
    assert.deepEqual(commands, ["cloudcanvas-role", "arn:aws:iam::aws:policy/ReadOnlyAccess", "arn:aws:iam::aws:policy/ReadOnlyAccess", "cloudcanvas-role"]);
});

test("maps Lambda function create and delete", async () => {
    let codeLength = 0;
    const service = new LambdaService({
        create: async (command) => {
            codeLength = command.input.Code?.ZipFile?.length ?? 0;
            return { $metadata: {}, FunctionName: "cloudcanvas", FunctionArn: "arn:aws:lambda:ap-south-1:123:function:cloudcanvas" };
        },
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createFunction({
        functionName: "cloudcanvas",
        roleArn: "arn:aws:iam::123:role/cloudcanvas",
        handler: "index.handler",
        runtime: "nodejs22.x",
        codeZipBase64: Buffer.from("zip").toString("base64"),
    });
    await service.deleteFunction(result.functionName);
    assert.equal(codeLength, 3);
});

test("maps DynamoDB table create and delete", async () => {
    let tableName = "";
    const service = new DynamoDbService({
        create: async (command) => {
            tableName = command.input.TableName ?? "";
            return { $metadata: {}, TableDescription: { TableName: tableName, TableStatus: "CREATING" } };
        },
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createTable({
        tableName: "cloudcanvas",
        keySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        attributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    });
    await service.deleteTable(result.tableName);
    assert.equal(tableName, "cloudcanvas");
});

test("maps SQS queue create and delete", async () => {
    const service = new SqsService({
        create: async () => ({ $metadata: {}, QueueUrl: "https://sqs.ap-south-1.amazonaws.com/123/cloudcanvas" }),
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createQueue({ queueName: "cloudcanvas", visibilityTimeoutSeconds: 30 });
    assert.equal(result.queueUrl.includes("cloudcanvas"), true);
    assert.equal((await service.deleteQueue(result.queueUrl)).queueUrl, result.queueUrl);
});

test("maps SNS topic create and delete", async () => {
    const service = new SnsService({
        create: async () => ({ $metadata: {}, TopicArn: "arn:aws:sns:ap-south-1:123:cloudcanvas" }),
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createTopic({ topicName: "cloudcanvas" });
    assert.equal(result.topicArn.endsWith("cloudcanvas"), true);
    assert.equal((await service.deleteTopic(result.topicArn)).topicArn, result.topicArn);
});

test("lists catalog metadata required by resource forms", async () => {
    let instanceTypeCalls = 0;
    const catalog = await new AwsCatalogService({
        vpcs: async () => ({ $metadata: {}, Vpcs: [{ VpcId: "vpc-1", CidrBlock: "10.0.0.0/16", Tags: [{ Key: "Name", Value: "app" }] }] }),
        subnets: async () => ({ $metadata: {}, Subnets: [{ SubnetId: "subnet-1", VpcId: "vpc-1", AvailabilityZone: "ap-south-1a" }] }),
        securityGroups: async () => ({ $metadata: {}, SecurityGroups: [{ GroupId: "sg-1", GroupName: "web", Description: "web traffic", VpcId: "vpc-1" }] }),
        launchTemplates: async () => ({ $metadata: {}, LaunchTemplates: [{ LaunchTemplateId: "lt-1", LaunchTemplateName: "app-template" }] }),
        instances: async () => ({ $metadata: {}, Reservations: [{ Instances: [{ InstanceId: "i-1", InstanceType: "t3.micro", State: { Name: "running" } }] }] }),
        instanceTypes: async () => (++instanceTypeCalls === 1 ? { $metadata: {}, InstanceTypes: [{ InstanceType: "t3.micro", VCpuInfo: { DefaultVCpus: 2 }, MemoryInfo: { SizeInMiB: 1024 }, ProcessorInfo: { SupportedArchitectures: ["x86_64"] }, NetworkInfo: { NetworkPerformance: "Up to 5 Gigabit" } }], NextToken: "next" } : { $metadata: {}, InstanceTypes: [{ InstanceType: "m7i.large" }] }),
        images: async (command) => ({
            $metadata: {},
            Images: command.input.Filters?.[0]?.Values?.[0]?.startsWith("Windows")
                ? [{ ImageId: "ami-windows", Name: "Windows_Server-2025-English-Full-Base-2026.01.01", RootDeviceName: "/dev/sda1", CreationDate: "2026-01-01T00:00:00.000Z" }]
                : [{ ImageId: "ami-amazon-linux", Name: "al2023", RootDeviceName: "/dev/xvda", CreationDate: "2026-01-01T00:00:00.000Z" }],
        }),
        keyPairs: async () => ({ $metadata: {}, KeyPairs: [{ KeyName: "deploy", KeyPairId: "key-1", KeyFingerprint: "fingerprint" }] }),
        instanceProfiles: async () => ({ $metadata: {}, InstanceProfiles: [{ Arn: "arn:aws:iam::123:instance-profile/app", InstanceProfileName: "app", Path: "/", InstanceProfileId: "profile-id", CreateDate: new Date(), Roles: [] }] }),
    }).list();
    assert.equal(catalog.securityGroups[0]?.id, "sg-1");
    assert.equal(catalog.instanceProfiles[0]?.name, "app");
    assert.equal(catalog.instances[0]?.id, "i-1");
    assert.deepEqual(catalog.instanceTypes.map((instanceType) => instanceType.name), ["m7i.large", "t3.micro"]);
    assert.equal(catalog.instanceTypes.find((instanceType) => instanceType.name === "t3.micro")?.vcpus, 2);
    assert.equal(catalog.keyPairs[0]?.name, "deploy");
    assert.equal(catalog.images.find((image) => image.category === "amazon-linux")?.title, "Amazon Linux 2023");
    assert.equal(catalog.images.find((image) => image.category === "windows")?.title, "Microsoft Windows Server 2025");
});

test("keeps the EC2 catalog usable when key-pair permission is unavailable", async () => {
    const catalog = await new AwsCatalogService({
        vpcs: async () => ({ $metadata: {}, Vpcs: [{ VpcId: "vpc-1" }] }),
        subnets: async () => ({ $metadata: {}, Subnets: [] }),
        securityGroups: async () => ({ $metadata: {}, SecurityGroups: [] }),
        launchTemplates: async () => ({ $metadata: {}, LaunchTemplates: [] }),
        instances: async () => ({ $metadata: {}, Reservations: [] }),
        instanceTypes: async () => ({ $metadata: {}, InstanceTypes: [] }),
        images: async () => ({ $metadata: {}, Images: [] }),
        keyPairs: async () => { throw new Error("UnauthorizedOperation"); },
        instanceProfiles: async () => ({ $metadata: {}, InstanceProfiles: [] }),
    }).list();
    assert.equal(catalog.vpcs[0]?.id, "vpc-1");
    assert.equal(catalog.keyPairs.length, 0);
    assert.equal(catalog.warnings.some((warning) => warning.startsWith("Key pairs could not be listed.")), true);
});

test("imports an EC2 key pair or adopts an existing one", async () => {
    let command: ImportKeyPairCommand | undefined;
    const service = new KeyPairService({
        import: async (nextCommand) => {
            command = nextCommand;
            return { $metadata: {}, KeyPairId: "key-1" };
        },
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const created = await service.create({
        keyName: "deploy",
        publicKeyMaterial: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINonSensitivePublicKeyOnly cloudcanvas",
    });
    const adopted = await service.create({ mode: "existing", keyName: "existing" });

    assert.equal(command?.input.KeyName, "deploy");
    assert.equal(created.keyPairId, "key-1");
    assert.equal(adopted.keyName, "existing");
});

test("creates a security group with an inbound rule or adopts an existing group", async () => {
    let createdGroupName = "";
    let ingressGroupId = "";
    const service = new SecurityGroupService({
        create: async (command) => { createdGroupName = command.input.GroupName ?? ""; return { $metadata: {}, GroupId: "sg-new" }; },
        authorizeIngress: async (command) => { ingressGroupId = command.input.GroupId ?? ""; return { $metadata: {} }; },
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");
    const created = await service.create({ groupName: "web", description: "web", vpcId: "vpc-1", ingressRules: [{ protocol: "tcp", fromPort: 443, toPort: 443, cidrIpv4: "0.0.0.0/0" }] });
    const existing = await service.create({ mode: "existing", groupId: "sg-existing", groupName: "existing" });
    assert.equal(created.securityGroupId, "sg-new");
    assert.equal(createdGroupName, "web");
    assert.equal(ingressGroupId, "sg-new");
    assert.equal(existing.securityGroupId, "sg-existing");
});
