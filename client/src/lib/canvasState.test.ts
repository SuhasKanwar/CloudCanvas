import assert from "node:assert/strict";
import test from "node:test";

import { createHistory, diffCanvas } from "./canvasState.ts";

test("diffs canvas changes and cancels an undo before persistence", () => {
    type Snapshot = { nodes: { id: string; position: { x: number; y: number }; data?: { config: Record<string, unknown> } }[]; edges: { id: string; source: string; target: string }[] };
    const initial: Snapshot = { nodes: [{ id: "a", position: { x: 0, y: 0 }, data: { config: { bucketName: "old-name" } } }, { id: "c", position: { x: 0, y: 0 } }], edges: [] };
    const changed: Snapshot = { nodes: [{ id: "a", position: { x: 0, y: 0 }, data: { config: { bucketName: "new-name" } } }, { id: "b", position: { x: 20, y: 0 } }, { id: "c", position: { x: 10, y: 0 } }], edges: [{ id: "edge", source: "a", target: "b" }] };
    const diff = diffCanvas(initial, changed);
    assert.deepEqual(diff.createdNodes.map(({ id }) => id), ["b"]);
    assert.deepEqual(diff.createdEdges.map(({ id }) => id), ["edge"]);
    assert.deepEqual(diff.configuredNodes.map(({ id }) => id), ["a"]);
    assert.deepEqual(diff.movedNodes.map(({ id }) => id), ["c"]);

    const history = createHistory<Snapshot>();
    history.record(initial);
    assert.deepEqual(history.undo(changed), initial);
    assert.deepEqual(diffCanvas(initial, initial).createdNodes, []);
    assert.deepEqual(history.redo(initial), changed);
});
