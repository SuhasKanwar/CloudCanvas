export type GraphNode = { id: string };

export type GraphEdge = {
    sourceNodeId: string;
    targetNodeId: string;
};

export type GraphPlan = {
    order: string[];
    sourcesByTarget: Map<string, Set<string>>;
};

const referencePattern = /^\$\{([^.${}]+)\.([A-Za-z][A-Za-z0-9_]*)\}$/;

export function createGraphPlan(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphPlan {
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (nodeIds.size !== nodes.length || nodes.some((node) => !node.id)) {
        throw new Error("Every sketch node must have a unique ID.");
    }

    const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
    const sourcesByTarget = new Map(nodes.map((node) => [node.id, new Set<string>()]));
    const inDegree = new Map(nodes.map((node) => [node.id, 0]));
    const edgeKeys = new Set<string>();

    for (const edge of edges) {
        if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
            throw new Error("Every edge must reference nodes in the sketch.");
        }
        if (edge.sourceNodeId === edge.targetNodeId) {
            throw new Error("A sketch edge cannot reference the same node twice.");
        }
        const key = `${edge.sourceNodeId}:${edge.targetNodeId}`;
        if (edgeKeys.has(key)) throw new Error("Duplicate sketch edges are not allowed.");
        edgeKeys.add(key);
        outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
        sourcesByTarget.get(edge.targetNodeId)?.add(edge.sourceNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    }

    const ready = nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id);
    const order: string[] = [];
    while (ready.length) {
        const nodeId = ready.shift();
        if (!nodeId) break;
        order.push(nodeId);
        for (const targetId of outgoing.get(nodeId) ?? []) {
            const nextDegree = (inDegree.get(targetId) ?? 0) - 1;
            inDegree.set(targetId, nextDegree);
            if (nextDegree === 0) ready.push(targetId);
        }
    }
    if (order.length !== nodes.length) throw new Error("Sketch edges must not contain a cycle.");
    return { order, sourcesByTarget };
}

export function remapConfigReferences(value: unknown, nodeIds: ReadonlyMap<string, string>): unknown {
    if (typeof value === "string") {
        const match = value.match(referencePattern);
        if (!match) return value;
        const [, sourceId, output] = match;
        const mappedId = nodeIds.get(sourceId!);
        if (!mappedId) throw new Error(`Unknown source node reference: ${sourceId}.`);
        return `\${${mappedId}.${output}}`;
    }
    if (Array.isArray(value)) return value.map((entry) => remapConfigReferences(entry, nodeIds));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapConfigReferences(entry, nodeIds)]));
    }
    return value;
}

export function resolveConfigReferences(
    value: unknown,
    targetNodeId: string,
    sourcesByTarget: ReadonlyMap<string, ReadonlySet<string>>,
    outputsByNode: ReadonlyMap<string, Record<string, unknown>>,
): unknown {
    if (typeof value === "string") {
        if (!value.includes("${")) return value;
        const match = value.match(referencePattern);
        if (!match) throw new Error(`Invalid resource reference: ${value}.`);
        const [, sourceId, output] = match;
        if (!sourcesByTarget.get(targetNodeId)?.has(sourceId!)) {
            throw new Error(`Resource reference ${value} requires a direct source edge.`);
        }
        const sourceOutput = outputsByNode.get(sourceId!);
        if (!sourceOutput || !(output! in sourceOutput)) {
            throw new Error(`Resource reference ${value} is not available from its source node.`);
        }
        return sourceOutput[output!];
    }
    if (Array.isArray(value)) {
        return value.map((entry) => resolveConfigReferences(entry, targetNodeId, sourcesByTarget, outputsByNode));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
            key,
            resolveConfigReferences(entry, targetNodeId, sourcesByTarget, outputsByNode),
        ]));
    }
    return value;
}
