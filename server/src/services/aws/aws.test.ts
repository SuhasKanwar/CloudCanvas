import assert from "node:assert/strict";
import test from "node:test";
import { RunInstancesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { AttachRolePolicyCommand, DetachRolePolicyCommand } from "@aws-sdk/client-iam";
import { decryptAwsSecret, encryptAwsSecret } from "./crypto.js";
import { Ec2Service } from "./resources/ec2.js";
import { EcrService } from "./resources/ecr.js";
import { IamService } from "./resources/iam.js";
import { S3Service } from "./resources/s3.js";
import { LambdaService } from "./resources/lambda.js";
import { DynamoDbService } from "./resources/dynamodb.js";
import { SqsService } from "./resources/sqs.js";
import { SnsService } from "./resources/sns.js";

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
    const service = new S3Service({
        create: async (command) => {
            createLocation = command.input.CreateBucketConfiguration?.LocationConstraint;
            return { $metadata: {}, Location: "/cloudcanvas" };
        },
        delete: async () => ({ $metadata: {} }),
    }, "ap-south-1");

    const result = await service.createBucket({ bucketName: "cloudcanvas" });
    await service.deleteBucket("cloudcanvas");
    assert.equal(createLocation, "ap-south-1");
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
