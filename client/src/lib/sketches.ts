import type { AwsService } from "@cloudcanvas/graph-contract";

import api, { authenticatedRequest } from "./api";

export type AiChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
};

export type Sketch = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    nodes?: SketchNode[];
    edges?: SketchEdge[];
};

export type SketchNode = {
    id: string;
    type: AwsService;
    label: string | null;
    positionX: number;
    positionY: number;
    config: Record<string, unknown>;
};

export type SketchEdge = {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle: string | null;
    targetHandle: string | null;
};

export type AiSketchResponse =
    | { type: "text"; message: string }
    | { type: "build"; message: string; sketch: Sketch };

type ApiEnvelope<T> = { data: T };

export async function listSketches(accessToken: string): Promise<Sketch[]> {
    const response = await api.get<ApiEnvelope<Sketch[]>>("/api/sketches", authenticatedRequest(accessToken));
    return response.data.data;
}

export async function getSketch(accessToken: string, sketchId: string): Promise<Sketch> {
    const response = await api.get<ApiEnvelope<Sketch>>(`/api/sketches/${sketchId}`, authenticatedRequest(accessToken));
    return response.data.data;
}

export async function createAiSketch(accessToken: string, query: string, sessionHistory: readonly AiChatMessage[] = []): Promise<AiSketchResponse> {
    const response = await api.post<ApiEnvelope<AiSketchResponse>>(
        "/api/sketches/ai",
        { query, session_history: sessionHistory },
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function publishSketch(accessToken: string, sketchId: string, connectionId: string): Promise<void> {
    await api.post(`/api/sketches/${sketchId}/deploy`, { connectionId }, authenticatedRequest(accessToken));
}
