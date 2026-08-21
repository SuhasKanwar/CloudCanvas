import {
    GraphValidationError,
    parseGraphYaml,
    type GraphDefinition,
    type GraphDiagnostic,
} from "@cloudcanvas/graph-contract";

import api from "./api";

export type { GraphDefinition, GraphDiagnostic };

export function validateGraphYaml(definition: string): GraphDefinition {
    return parseGraphYaml(definition);
}

export function graphDiagnostics(error: unknown): GraphDiagnostic[] {
    return error instanceof GraphValidationError ? error.diagnostics : [];
}

export async function importGraph(definition: string) {
    validateGraphYaml(definition);
    return api.post("/api/sketches/import", { definition });
}
