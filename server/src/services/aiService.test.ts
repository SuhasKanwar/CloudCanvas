import assert from "node:assert/strict";
import test from "node:test";
import type { AxiosInstance } from "axios";

import {
    AI_QUERY_PATH,
    AIService,
    AIServiceError,
    type AiQuerySuccess,
} from "./aiService.js";
import { AwsService } from "./aws/index.js";

function fakeClient(response: unknown): AxiosInstance {
    return {
        post: async (path: string, body: unknown) => {
            assert.equal(path, AI_QUERY_PATH);
            assert.deepEqual(body, { query: "Explain S3", session_history: [] });
            return { data: response };
        },
    } as unknown as AxiosInstance;
}

test("parses text responses", async () => {
    const service = new AIService(fakeClient({
        success: true,
        message: "ok",
        data: { type: "text", message: "S3 stores objects." },
    }));

    const response = await service.query({ query: " Explain S3 " });
    assert.equal(response.data.type, "text");
});

test("parses build responses and validates edge references", async () => {
    const response: AiQuerySuccess = {
        success: true,
        message: "ok",
        data: {
            type: "build",
            message: "Create a bucket.",
            build: {
                name: "assets",
                nodes: [{
                    type: AwsService.S3_BUCKET,
                    id: "node-1",
                    positionX: 0,
                    positionY: 0,
                    config: { bucketName: "assets" },
                }],
                edges: [],
            },
        },
    };
    const result = await new AIService(fakeClient(response)).query({ query: "Explain S3" });
    assert.equal(result.data.type, "build");
});

test("turns malformed responses into typed errors", async () => {
    const service = new AIService(fakeClient({ success: true, message: "ok", data: { type: "unknown" } }));
    await assert.rejects(
        () => service.query({ query: "Explain S3" }),
        (error: unknown) => error instanceof AIServiceError && error.code === "invalid_response",
    );
});

test("keeps upstream gateway timeouts typed as timeouts", async () => {
    const client = {
        post: async () => { throw Object.assign(new Error("NVIDIA NIM timed out"), { isAxiosError: true, response: { status: 504, data: { detail: "NVIDIA NIM timed out" } } }); },
    } as unknown as AxiosInstance;
    await assert.rejects(
        () => new AIService(client).query({ query: "Explain S3" }),
        (error: unknown) => error instanceof AIServiceError && error.code === "timeout" && error.statusCode === 504,
    );
});
