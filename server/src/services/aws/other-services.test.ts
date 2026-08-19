import assert from "node:assert/strict";
import test from "node:test";
import { EcrService } from "./ecr.js";
import { IamService } from "./iam.js";
import { S3Service } from "./s3.js";
import { LambdaService } from "./lambda.js";
import { DynamoDbService } from "./dynamodb.js";
import { SqsService } from "./sqs.js";
import { SnsService } from "./sns.js";

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

test("maps IAM role create and delete", async () => {
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
        delete: async (command) => {
            commands.push(command.input.RoleName ?? "");
            return { $metadata: {} };
        },
    }, "us-east-1");

    assert.equal((await service.createRole({ roleName: "cloudcanvas-role", assumeRolePolicyDocument: "{}" })).roleId, "role-id");
    await service.deleteRole("cloudcanvas-role");
    assert.deepEqual(commands, ["cloudcanvas-role", "cloudcanvas-role"]);
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
