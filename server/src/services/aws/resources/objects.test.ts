import assert from "node:assert/strict";
import test from "node:test";
import { S3Client, DeleteObjectsCommand, GetBucketCorsCommand, ListObjectsV2Command, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { BucketObjects, objectKey, objectPrefix } from "./objects.js";

test("S3 object paths remain scoped to valid keys and folders", () => {
    assert.equal(objectPrefix("assets/icons/"), "assets/icons/");
    assert.equal(objectPrefix(""), "");
    assert.equal(objectKey("assets/app.js"), "assets/app.js");
    for (const key of ["../secret", "/root", "a//b", "a/./b", "a\\b", "bad\nkey"]) assert.throws(() => objectKey(key));
    assert.throws(() => objectKey("missing-slash", true));
});

test("upload form binds one object path, content type, and size limit", async () => {
    const bucket = new BucketObjects(new S3Client({ region: "ap-south-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } }), "frontend");
    const form = await bucket.uploadForm("assets/app.js", "text/javascript");
    assert.ok(form.fields.Policy);
    const policy = JSON.parse(Buffer.from(form.fields.Policy, "base64").toString("utf8"));
    assert.ok(policy.conditions.some((condition: unknown) => Array.isArray(condition) && condition[0] === "content-length-range" && condition[2] === 100 * 1024 * 1024));
    assert.ok(policy.conditions.some((condition: unknown) => typeof condition === "object" && condition !== null && !Array.isArray(condition) && "key" in condition && condition.key === "assets/app.js"));
    assert.equal(form.fields["Content-Type"], "text/javascript");
});

test("folder removal clears every S3 listing page and browser CORS preserves other rules", async (context) => {
    const removed: string[] = [];
    let cors: PutBucketCorsCommand | undefined;
    context.mock.method(S3Client.prototype, "send", async (command: unknown) => {
        if (command instanceof GetBucketCorsCommand) return { CORSRules: [{ AllowedOrigins: ["https://other.example"], AllowedMethods: ["GET"] }] };
        if (command instanceof PutBucketCorsCommand) { cors = command; return {}; }
        if (command instanceof ListObjectsV2Command) return { Contents: removed.length ? [] : [{ Key: "assets/app.js" }, { Key: "assets/index.html" }] };
        if (command instanceof DeleteObjectsCommand) { removed.push(...(command.input.Delete?.Objects ?? []).map((entry) => entry.Key!)); return {}; }
        throw new Error("Unexpected S3 command");
    });
    const bucket = new BucketObjects(new S3Client({ region: "ap-south-1" }), "frontend");
    await bucket.allowBrowserUpload("http://localhost:3000");
    assert.equal(cors?.input.CORSConfiguration?.CORSRules?.length, 2);
    await bucket.delete("assets/", true);
    assert.deepEqual(removed, ["assets/app.js", "assets/index.html"]);
});
