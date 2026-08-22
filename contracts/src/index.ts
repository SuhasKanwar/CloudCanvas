import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

import graphSchema from "../graph.schema.json" with { type: "json" };

const referencePattern = /^\$\{([^.${}]+)\.([A-Za-z][A-Za-z0-9_]*)\}$/;
const validateSchema = new Ajv2020({ allErrors: true, useDefaults: true, strict: false }).compile(graphSchema);

export type AwsService =
    | "EC2_INSTANCE"
    | "KEY_PAIR"
    | "SECURITY_GROUP"
    | "ECR_REPOSITORY"
    | "S3_BUCKET"
    | "IAM_ROLE"
    | "LAMBDA_FUNCTION"
    | "DYNAMODB_TABLE"
    | "SQS_QUEUE"
    | "SNS_TOPIC";

export type GraphNode = {
    id: string;
    type: AwsService;
    label?: string | null;
    positionX: number;
    positionY: number;
    config: Record<string, unknown>;
};

export type GraphEdge = {
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

export type GraphDefinition = {
    schemaVersion: 1;
    name: string;
    description?: string | null;
    nodes: GraphNode[];
    edges: GraphEdge[];
};

export type GraphDiagnostic = { path: string; code: string; message: string };
export type GraphPlan = { order: string[]; sourcesByTarget: Map<string, Set<string>> };

export class GraphValidationError extends Error {
    constructor(readonly diagnostics: GraphDiagnostic[]) {
        super(diagnostics.map((diagnostic) => diagnostic.message).join(" "));
        this.name = "GraphValidationError";
    }
}

function fail(path: string, code: string, message: string): never {
    throw new GraphValidationError([{ path, code, message }]);
}

export function createGraphPlan(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphPlan {
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (nodeIds.size !== nodes.length) fail("/nodes", "duplicate_node", "Node IDs must be unique.");

    const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
    const sourcesByTarget = new Map(nodes.map((node) => [node.id, new Set<string>()]));
    const inDegree = new Map(nodes.map((node) => [node.id, 0]));
    const edgeKeys = new Set<string>();
    for (const edge of edges) {
        if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
            fail("/edges", "unknown_node", "Every edge must reference nodes in the graph.");
        }
        if (edge.sourceNodeId === edge.targetNodeId) {
            fail("/edges", "self_edge", "An edge cannot reference the same node twice.");
        }
        const key = `${edge.sourceNodeId}:${edge.targetNodeId}`;
        if (edgeKeys.has(key)) fail("/edges", "duplicate_edge", "Duplicate edges are not allowed.");
        edgeKeys.add(key);
        outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
        sourcesByTarget.get(edge.targetNodeId)?.add(edge.sourceNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    }

    const ready = nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id);
    const order: string[] = [];
    while (ready.length) {
        const nodeId = ready.shift();
        if (!nodeId) continue;
        order.push(nodeId);
        for (const targetId of outgoing.get(nodeId) ?? []) {
            const nextDegree = (inDegree.get(targetId) ?? 0) - 1;
            inDegree.set(targetId, nextDegree);
            if (nextDegree === 0) ready.push(targetId);
        }
    }
    if (order.length !== nodes.length) fail("/edges", "cycle", "Graph edges must not contain a cycle.");
    return { order, sourcesByTarget };
}

function validateReferences(value: unknown, targetNodeId: string, sourcesByTarget: Map<string, Set<string>>): void {
    if (typeof value === "string") {
        if (!value.includes("${")) return;
        const match = value.match(referencePattern);
        if (!match) fail("/nodes", "invalid_reference", `Invalid resource reference: ${value}.`);
        if (!sourcesByTarget.get(targetNodeId)?.has(match[1])) {
            fail("/nodes", "missing_dependency", `Reference ${value} requires a direct source edge.`);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const entry of value) validateReferences(entry, targetNodeId, sourcesByTarget);
    } else if (value && typeof value === "object") {
        for (const entry of Object.values(value)) validateReferences(entry, targetNodeId, sourcesByTarget);
    }
}

export function validateGraphObject(value: unknown): GraphDefinition {
    if (!validateSchema(value)) {
        const diagnostics = (validateSchema.errors ?? []).map((error: ErrorObject) => ({
            path: error.instancePath || "/",
            code: error.keyword,
            message: error.message ?? "Graph schema validation failed.",
        }));
        throw new GraphValidationError(diagnostics);
    }
    const graph = value as GraphDefinition;
    const plan = createGraphPlan(graph.nodes, graph.edges);
    for (const node of graph.nodes) validateReferences(node.config, node.id, plan.sourcesByTarget);
    return graph;
}

export function parseGraphYaml(definition: string): GraphDefinition {
    if (!definition.trim()) fail("/definition", "invalid_yaml", "Graph YAML is required.");
    const document = parseDocument(definition, { uniqueKeys: true });
    if (document.errors.length) fail("/definition", "invalid_yaml", document.errors[0].message);
    return validateGraphObject(document.toJS({ maxAliasCount: 0 }));
}

export { graphSchema };
