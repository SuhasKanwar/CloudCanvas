import assert from "node:assert/strict";
import test from "node:test";
import { RunInstancesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { decryptAwsSecret, encryptAwsSecret, Ec2Service } from "./index.js";

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
        imageId: "ami-test",
        instanceType: "t3.micro",
        name: "test-instance",
        userData: "echo hello",
    });

    assert.equal(command?.input.ImageId, "ami-test");
    assert.equal(command?.input.MinCount, 1);
    assert.equal(command?.input.MaxCount, 1);
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
