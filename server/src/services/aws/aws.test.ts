import assert from "node:assert/strict";
import test from "node:test";
import { ImportKeyPairCommand, RunInstancesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
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
        putVersioning: async (command) => { versioningStatus = command.input.VersioningConfiguration?.Status; return { $metadata: {} }; },
        putPublicAccessBlock: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createBucket({ bucketName: "cloudcanvas", versioning: true, blockPublicAccess: true, encryption: "SSE-S3", enforceHttps: true });
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
