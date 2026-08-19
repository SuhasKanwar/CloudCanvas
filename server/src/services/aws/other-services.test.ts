import assert from "node:assert/strict";
import test from "node:test";
import { EcrService } from "./ecr.js";
import { IamService } from "./iam.js";
import { S3Service } from "./s3.js";

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
