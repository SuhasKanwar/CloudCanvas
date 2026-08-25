import axios, { type AxiosInstance } from "axios";

import { microserviceApi } from "../lib/api.js";
import { AI_SERVICE_TIMEOUT_MS } from "../lib/config.js";
import { isAwsService } from "../utils/aws.js";
import { isFiniteNumber, isNullableStringField, isRecord, isString } from "../utils/validation.js";
import { AwsService, type AwsResourceCreateRequest } from "./aws/index.js";

export const AI_QUERY_PATH = "/api/agent/query";

export type AiMessageRole = "system" | "user" | "assistant" | "tool";

export type AiChatMessage = {
    role: AiMessageRole;
    content: string;
};

type AiResourceConfig = AwsResourceCreateRequest["config"];

type AiNodeForService<Service extends AwsService> = {
    type: Service;
    id: string;
    label?: string | null;
    positionX: number;
    positionY: number;
    config: Extract<AwsResourceCreateRequest, { service: Service }>["config"];
};

export type AiSketchNode = {
    [Service in AwsService]: AiNodeForService<Service>;
}[AwsService];

export type AiSketchEdge = {
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

export type AiSketch = {
    name: string;
    description?: string | null;
    nodes: AiSketchNode[];
    edges: AiSketchEdge[];
};

export type AiTextResponse = {
    type: "text";
    message: string;
};

export type AiBuildResponse = {
    type: "build";
    message: string;
    build: AiSketch;
};

export type AiAgentResponse = AiTextResponse | AiBuildResponse;

export type AiQuerySuccess = {
    success: true;
    data: AiAgentResponse;
    message: string;
};

export type AiQueryRequest = {
    query: string;
    session_history?: readonly AiChatMessage[];
};

export type AiServiceErrorCode =
    | "invalid_request"
    | "invalid_response"
    | "timeout"
    | "unavailable"
    | "upstream";

export class AIServiceError extends Error {
    constructor(
        message: string,
        public readonly code: AiServiceErrorCode,
        public readonly statusCode?: number,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "AIServiceError";
    }
}

function isMessageRole(value: unknown): value is AiMessageRole {
    return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function isAiChatMessage(value: unknown): value is AiChatMessage {
    return isRecord(value) && isMessageRole(value.role) && isString(value.content);
}

function isAiSketchNode(value: unknown): value is AiSketchNode {
    if (!isRecord(value)) return false;
    return (
        isAwsService(value.type) &&
        isString(value.id) &&
        isNullableStringField(value, "label") &&
        isFiniteNumber(value.positionX) &&
        isFiniteNumber(value.positionY) &&
        isRecord(value.config)
    );
}

function parseAiSketchNode(value: Record<string, unknown>): AiSketchNode {
    const node = {
        type: value.type as AwsService,
        id: value.id as string,
        positionX: value.positionX as number,
        positionY: value.positionY as number,
        config: value.config as AiResourceConfig,
    } as AiSketchNode;
    if (value.label !== undefined) node.label = value.label as string | null;
    return node;
}

function isAiSketchEdge(value: unknown): value is AiSketchEdge {
    if (!isRecord(value) || !isString(value.sourceNodeId) || !isString(value.targetNodeId)) {
        return false;
    }
    return isNullableStringField(value, "sourceHandle") && isNullableStringField(value, "targetHandle");
}

function parseAiSketchEdge(value: Record<string, unknown>): AiSketchEdge {
    const edge: AiSketchEdge = {
        sourceNodeId: value.sourceNodeId as string,
        targetNodeId: value.targetNodeId as string,
    };
    if (value.sourceHandle !== undefined) edge.sourceHandle = value.sourceHandle as string | null;
    if (value.targetHandle !== undefined) edge.targetHandle = value.targetHandle as string | null;
    return edge;
}

function parseAiAgentResponse(value: unknown): AiAgentResponse | null {
    if (!isRecord(value) || !isString(value.type) || !isString(value.message)) return null;
    if (value.type === "text") return { type: "text", message: value.message };
    if (value.type !== "build" || !isRecord(value.build)) return null;

    const build = value.build;
    if (
        !isString(build.name) ||
        !isNullableStringField(build, "description") ||
        !Array.isArray(build.nodes) ||
        !build.nodes.every(isAiSketchNode) ||
        !Array.isArray(build.edges) ||
        !build.edges.every(isAiSketchEdge)
    ) {
        return null;
    }

    const nodes = build.nodes.map((node) => parseAiSketchNode(node));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = build.edges.map((edge) => parseAiSketchEdge(edge));
    if (edges.some((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))) {
        return null;
    }

    const sketch: AiSketch = {
        name: build.name,
        nodes,
        edges,
    };
    if (build.description !== undefined) sketch.description = build.description as string | null;
    return { type: "build", message: value.message, build: sketch };
}

function upstreamMessage(value: unknown): string | null {
    if (!isRecord(value)) return null;
    if (isString(value.message)) return value.message;
    if (isString(value.detail)) return value.detail;
    if (isRecord(value.error) && isString(value.error.message)) return value.error.message;
    return null;
}

function parseSuccessResponse(value: unknown): AiQuerySuccess {
    if (isRecord(value) && value.success === false) {
        throw new AIServiceError(upstreamMessage(value) ?? "AI service rejected the request.", "upstream");
    }
    if (!isRecord(value) || value.success !== true || !isString(value.message)) {
        throw new AIServiceError("AI service returned an invalid response envelope.", "invalid_response");
    }
    const data = parseAiAgentResponse(value.data);
    if (!data) {
        throw new AIServiceError("AI service returned an invalid text or build response.", "invalid_response");
    }
    return { success: true, message: value.message, data };
}

export class AIService {
    constructor(
        private readonly client: AxiosInstance = microserviceApi,
        private readonly timeoutMs: number = AI_SERVICE_TIMEOUT_MS,
    ) {}

    async query(request: AiQueryRequest): Promise<AiQuerySuccess> {
        if (!isString(request.query) || !request.query.trim()) {
            throw new AIServiceError("AI query must not be empty.", "invalid_request");
        }
        if (request.session_history !== undefined && (!Array.isArray(request.session_history) || !request.session_history.every(isAiChatMessage))) {
            throw new AIServiceError("AI session history contains an invalid message.", "invalid_request");
        }

        try {
            const response = await this.client.post<unknown>(AI_QUERY_PATH, {
                query: request.query.trim(),
                session_history: request.session_history ?? [],
            }, { timeout: this.timeoutMs });
            return parseSuccessResponse(response.data);
        } catch (error) {
            if (error instanceof AIServiceError) throw error;
            if (axios.isAxiosError(error)) {
                const message = upstreamMessage(error.response?.data) ?? error.message;
                if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
                    throw new AIServiceError(`AI service timed out: ${message}`, "timeout", error.response?.status, { cause: error });
                }
                if (error.response?.status === 504) {
                    throw new AIServiceError(message, "timeout", 504, { cause: error });
                }
                if (!error.response) {
                    throw new AIServiceError(`AI service is unavailable: ${message}`, "unavailable", undefined, { cause: error });
                }
                throw new AIServiceError(message, "upstream", error.response.status, { cause: error });
            }
            throw new AIServiceError("AI service request failed.", "upstream", undefined, { cause: error });
        }
    }
}

export const aiService = new AIService();
