export type CanvasNode = { id: string; position: { x: number; y: number } };
export type CanvasEdge = { id: string; source: string; target: string };

export function diffCanvas<NodeType extends CanvasNode, EdgeType extends CanvasEdge>(persisted: { nodes: readonly NodeType[]; edges: readonly EdgeType[] }, desired: { nodes: readonly NodeType[]; edges: readonly EdgeType[] }) {
    const persistedNodes = new Map(persisted.nodes.map((node) => [node.id, node]));
    const desiredNodes = new Map(desired.nodes.map((node) => [node.id, node]));
    const persistedEdges = new Map(persisted.edges.map((edge) => [edge.id, edge]));
    const desiredEdges = new Map(desired.edges.map((edge) => [edge.id, edge]));

    return {
        deletedEdges: persisted.edges.filter((edge) => !desiredEdges.has(edge.id)),
        deletedNodes: persisted.nodes.filter((node) => !desiredNodes.has(node.id)),
        createdNodes: desired.nodes.filter((node) => !persistedNodes.has(node.id)),
        createdEdges: desired.edges.filter((edge) => !persistedEdges.has(edge.id)),
        movedNodes: desired.nodes.filter((node) => {
            const previous = persistedNodes.get(node.id);
            return previous && (previous.position.x !== node.position.x || previous.position.y !== node.position.y);
        }),
    };
}

export function createHistory<T>(limit = 50) {
    const past: T[] = [];
    const future: T[] = [];
    return {
        clear() { past.length = 0; future.length = 0; },
        record(value: T) { past.push(value); if (past.length > limit) past.shift(); future.length = 0; },
        undo(current: T) { const value = past.pop(); if (value !== undefined) future.push(current); return value; },
        redo(current: T) { const value = future.pop(); if (value !== undefined) past.push(current); return value; },
        canUndo() { return past.length > 0; },
        canRedo() { return future.length > 0; },
    };
}
