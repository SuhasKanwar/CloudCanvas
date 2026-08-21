import {
    GraphValidationError,
    parseGraphYaml,
    type GraphDefinition,
    type GraphDiagnostic,
} from "@cloudcanvas/graph-contract";

import api, { authenticatedRequest } from "./api";

export type { GraphDefinition, GraphDiagnostic };

export function validateGraphYaml(definition: string): GraphDefinition {
    return parseGraphYaml(definition);
}

export function graphDiagnostics(error: unknown): GraphDiagnostic[] {
    return error instanceof GraphValidationError ? error.diagnostics : [];
}

export async function importGraph(accessToken: string, definition: string, sketchId?: string): Promise<{ id: string }> {
    validateGraphYaml(definition);
    const request = authenticatedRequest(accessToken);
    const response = sketchId
        ? await api.put<{ data: { id: string } }>(`/api/sketches/${sketchId}/import`, { definition }, request)
        : await api.post<{ data: { id: string } }>("/api/sketches/import", { definition }, request);
    return response.data.data;
}
