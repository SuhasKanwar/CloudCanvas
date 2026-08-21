export type AwsService =
    | "EC2_INSTANCE"
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
    diagnostics: GraphDiagnostic[];
}

export function createGraphPlan(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphPlan;
export function validateGraphObject(value: unknown): GraphDefinition;
export function parseGraphYaml(definition: string): GraphDefinition;
export const graphSchema: Record<string, unknown>;
