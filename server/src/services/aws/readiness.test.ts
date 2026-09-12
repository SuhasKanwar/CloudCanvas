import assert from "node:assert/strict";
import test from "node:test";
import { AwsService, type AwsResourceDetails } from "./types.js";
import { waitForResourceReady } from "./readiness.js";

test("dependent deployment waits for the source to run", async () => {
    let checks = 0;
    const result = await waitForResourceReady(async () => ({ service: AwsService.S3_BUCKET, region: "ap-south-1", externalId: "frontend", state: "available", status: ++checks === 1 ? "PROVISIONING" : "RUNNING", data: { bucketName: "frontend" } }) satisfies AwsResourceDetails, 1000, 1);
    assert.equal(checks, 2);
    assert.equal(result.data.bucketName, "frontend");
});

test("dependent deployment stops on a failed source", async () => {
    await assert.rejects(() => waitForResourceReady(async () => ({ service: AwsService.S3_BUCKET, region: "ap-south-1", externalId: "frontend", state: "failed", status: "FAILED", data: {} }), 1000, 1), /Dependency is failed/);
});
