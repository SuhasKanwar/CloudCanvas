import type { AwsService } from "@cloudcanvas/graph-contract";
import type { GraphDefinition } from "@cloudcanvas/graph-contract";

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
    connectionId: string | null;
    createdAt: string;
    updatedAt: string;
    nodes?: SketchNode[];
    edges?: SketchEdge[];
    resources?: AwsResourceSnapshot[];
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

export type AwsResourceSnapshot = {
    id: string;
    nodeId: string | null;
    service: AwsService;
    externalId: string | null;
    status: string;
    desiredConfig: Record<string, unknown>;
    actualState: Record<string, unknown> | null;
    lastError: string | null;
    updatedAt: string;
};

export type ResourceRefreshOutcome = {
    resourceId: string;
    status: "refreshed" | "terminated" | "failed" | "skipped";
    resource?: AwsResourceSnapshot;
    error?: string;
};

export type AiSketchResponse =
    | { type: "text"; message: string }
    | { type: "build"; message: string; sketch: Sketch };

export type SketchConversationMessage = {
    id: string;
    role: "USER" | "ASSISTANT";
    type: "TEXT" | "BUILD";
    content: string;
    build: Omit<GraphDefinition, "schemaVersion"> | null;
    createdAt: string;
};

export type SketchConversation = {
    id: string;
    sketchId: string;
    userId: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
};

type ApiEnvelope<T> = { data: T };

export async function listSketches(accessToken: string): Promise<Sketch[]> {
    const response = await api.get<ApiEnvelope<Sketch[]>>("/api/sketches", authenticatedRequest(accessToken));
    return response.data.data;
}

export async function getSketch(accessToken: string, sketchId: string): Promise<Sketch> {
    const response = await api.get<ApiEnvelope<Sketch>>(`/api/sketches/${sketchId}`, authenticatedRequest(accessToken));
    return response.data.data;
}

export async function createSketch(accessToken: string, name = "Untitled infrastructure"): Promise<Sketch> {
    const response = await api.post<ApiEnvelope<Sketch>>(
        "/api/sketches",
        { name },
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function renameSketch(accessToken: string, sketchId: string, name: string): Promise<Sketch> {
    const response = await api.patch<ApiEnvelope<Sketch>>(
        `/api/sketches/${sketchId}/name`,
        { name },
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function updateSketchNodePosition(accessToken: string, sketchId: string, nodeId: string, position: { x: number; y: number }): Promise<void> {
    await api.patch(
        `/api/sketches/${sketchId}/nodes/${nodeId}`,
        { positionX: position.x, positionY: position.y },
        authenticatedRequest(accessToken, { silentToast: true }),
    );
}

export async function createSketchNode(accessToken: string, sketchId: string, node: SketchNode): Promise<void> {
    await api.post(`/api/sketches/${sketchId}/nodes`, node, authenticatedRequest(accessToken, { silentToast: true }));
}

export async function deleteSketchNode(accessToken: string, sketchId: string, nodeId: string): Promise<void> {
    await api.delete(`/api/sketches/${sketchId}/nodes/${nodeId}`, authenticatedRequest(accessToken, { silentToast: true }));
}

export async function createSketchEdge(accessToken: string, sketchId: string, edge: SketchEdge): Promise<void> {
    await api.post(`/api/sketches/${sketchId}/edges`, edge, authenticatedRequest(accessToken, { silentToast: true }));
}

export async function deleteSketchEdge(accessToken: string, sketchId: string, edgeId: string): Promise<void> {
    await api.delete(`/api/sketches/${sketchId}/edges/${edgeId}`, authenticatedRequest(accessToken, { silentToast: true }));
}

export async function createAiSketch(accessToken: string, query: string, sessionHistory: readonly AiChatMessage[] = []): Promise<AiSketchResponse> {
    const response = await api.post<ApiEnvelope<AiSketchResponse>>(
        "/api/sketches/ai",
        { query, session_history: sessionHistory },
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function getSketchConversation(accessToken: string, sketchId: string): Promise<{ conversation: SketchConversation; messages: SketchConversationMessage[] }> {
    const response = await api.get<ApiEnvelope<{ conversation: SketchConversation; messages: SketchConversationMessage[] }>>(
        `/api/sketches/${sketchId}/conversation`,
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function clearSketchConversation(accessToken: string, sketchId: string): Promise<void> {
    await api.delete(`/api/sketches/${sketchId}/conversation`, authenticatedRequest(accessToken));
}

export async function sendSketchConversationMessage(accessToken: string, sketchId: string, content: string): Promise<{ conversationId: string; userMessage: SketchConversationMessage; assistantMessage: SketchConversationMessage }> {
    const response = await api.post<ApiEnvelope<{ conversationId: string; userMessage: SketchConversationMessage; assistantMessage: SketchConversationMessage }>>(
        `/api/sketches/${sketchId}/conversation/messages`,
        { content },
        authenticatedRequest(accessToken),
    );
    return response.data.data;
}

export async function publishSketch(accessToken: string, sketchId: string, connectionId: string): Promise<void> {
    await api.post(`/api/sketches/${sketchId}/deploy`, { connectionId }, authenticatedRequest(accessToken));
}

export async function refreshSketchResources(accessToken: string, sketchId: string): Promise<ResourceRefreshOutcome[]> {
    const response = await api.post<ApiEnvelope<{ outcomes: ResourceRefreshOutcome[] }>>(
        `/api/sketches/${sketchId}/resources/refresh`,
        {},
        authenticatedRequest(accessToken, { silentToast: true }),
    );
    return response.data.data.outcomes;
}

export async function deleteSketch(accessToken: string, sketchId: string): Promise<void> {
    await api.delete(`/api/sketches/${sketchId}`, authenticatedRequest(accessToken));
}
