"use client";
// @refresh reset

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { addEdge, applyEdgeChanges, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Check, FolderOpen, Loader2, Pencil, Redo2, Save, Undo2 } from "lucide-react";
import Link from "next/link";
import { stringify } from "yaml";
import { layoutOverlappingGraphNodes, type AwsService, type GraphDefinition } from "@cloudcanvas/graph-contract";
import { importGraph, validateGraphYaml } from "@/lib/graph";
import { RESOURCE_STATUS_POLL_INTERVAL_MS } from "@/lib/config";
import { createSketchEdge, createSketchNode, deleteSketchEdge, deleteSketchNode, getSketch, refreshSketchResources, renameSketch, updateSketchNodePosition, type AwsResourceSnapshot, type Sketch, type SketchEdge, type SketchNode } from "@/lib/sketches";
import { useDebounce } from "@/hooks/useDebounce";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { diffCanvas } from "@/lib/canvasState";
import AiComposer from "./AiComposer";
import PublishSketchButton from "./PublishSketchButton";
import ResourceInspector from "./ResourceInspector";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { awsServiceOptions, defaultResourceConfig, ResourceNode, type ResourceNodeData } from "./resourceNode";
import ResourceSidebar from "./ResourceSidebar";

type ResourceFlowNode = Node<ResourceNodeData, "resource">;
type CanvasSnapshot = { nodes: ResourceFlowNode[]; edges: Edge[] };

const nodeTypes = { resource: ResourceNode };

function isEc2Dependency(node: ResourceFlowNode | undefined) {
    return node?.data.service === "KEY_PAIR" || node?.data.service === "SECURITY_GROUP";
}

function normalizeEc2Connection(connection: Connection, nodes: readonly ResourceFlowNode[]): Connection {
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (source?.data.service === "EC2_INSTANCE" && isEc2Dependency(target)) {
        return { source: target!.id, target: source.id, sourceHandle: null, targetHandle: null };
    }
    return connection;
}

function syncEc2Bindings(nodes: readonly ResourceFlowNode[], edges: readonly Edge[]): ResourceFlowNode[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return nodes.map((node) => {
        if (node.data.service !== "EC2_INSTANCE") return node;
        const sources = edges.flatMap((edge) => edge.target === node.id ? [byId.get(edge.source)] : []).filter((source): source is ResourceFlowNode => Boolean(source));
        const keyPair = sources.find((source) => source.data.service === "KEY_PAIR");
        const securityGroups = sources.filter((source) => source.data.service === "SECURITY_GROUP").map((source) => `\${${source.id}.securityGroupId}`);
        const currentSecurityGroups = Array.isArray(node.data.config.securityGroupIds) ? node.data.config.securityGroupIds.filter((value): value is string => typeof value === "string" && !value.match(/^\$\{[^}]+\.securityGroupId\}$/)) : [];
        const keyName = typeof node.data.config.keyName === "string" ? node.data.config.keyName : "";
        const nextKeyName = keyPair ? `\${${keyPair.id}.keyName}` : keyName.match(/^\$\{[^}]+\.keyName\}$/) ? "" : keyName;
        return { ...node, data: { ...node.data, config: { ...node.data.config, keyName: nextKeyName, securityGroupIds: [...currentSecurityGroups, ...securityGroups] } } };
    });
}

function serializeNode(node: ResourceFlowNode): SketchNode {
    return { id: node.id, type: node.data.service, label: node.data.label, positionX: node.position.x, positionY: node.position.y, config: node.data.config };
}

function serializeEdge(edge: Edge): SketchEdge {
    return { id: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null };
}

export default function GraphEditor({ sketchId, onOpenAwsSettings }: { sketchId: string; onOpenAwsSettings: () => void }) {
    const { data: session } = useSession();
    const accessToken = session?.accessToken;
    const [nodes, setNodes, onNodesChange] = useNodesState<ResourceFlowNode>([]);
    const [edges, setEdges] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [name, setName] = useState("Untitled infrastructure");
    const [persistedName, setPersistedName] = useState("Untitled infrastructure");
    const [sketchConnectionId, setSketchConnectionId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [resourcesByNodeId, setResourcesByNodeId] = useState<Record<string, AwsResourceSnapshot>>({});
    const resourcesByNodeIdRef = useRef<Record<string, AwsResourceSnapshot>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nameToConfirm, setNameToConfirm] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<ResourceFlowNode | null>(null);
    const persistedCanvas = useRef<CanvasSnapshot>({ nodes: [], edges: [] });
    const currentCanvas = useRef<CanvasSnapshot>({ nodes: [], edges: [] });
    const autoSaveQueue = useRef(Promise.resolve());
    const { canRedo, canUndo, record: recordHistory, redo: redoHistory, reset: resetHistory, undo: undoHistory } = useCanvasHistory<CanvasSnapshot>();

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedBindings = selectedNode?.data.service === "EC2_INSTANCE" ? {
        keyPair: edges.map((edge) => edge.target === selectedNode.id ? nodes.find((node) => node.id === edge.source) : undefined).find((node) => node?.data.service === "KEY_PAIR"),
        securityGroups: edges.map((edge) => edge.target === selectedNode.id ? nodes.find((node) => node.id === edge.source) : undefined).filter((node): node is ResourceFlowNode => node?.data.service === "SECURITY_GROUP"),
    } : undefined;
    const nodeTypeMap = useMemo(() => nodeTypes, []);

    const applyResourceSnapshots = useCallback((resources: readonly AwsResourceSnapshot[], replace = false) => {
        const incoming = Object.fromEntries(resources.flatMap((resource) => resource.nodeId ? [[resource.nodeId, resource]] : [])) as Record<string, AwsResourceSnapshot>;
        const snapshots = replace ? incoming : { ...resourcesByNodeIdRef.current, ...incoming };
        resourcesByNodeIdRef.current = snapshots;
        setResourcesByNodeId(snapshots);
        setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, deployment: snapshots[node.id] ? { status: snapshots[node.id].status, lastError: snapshots[node.id].lastError, actualState: snapshots[node.id].actualState, desiredConfig: snapshots[node.id].desiredConfig } : undefined } })));
    }, [setNodes]);

    const refreshDeployedResources = useCallback(async () => {
        if (!accessToken) return;
        const outcomes = await refreshSketchResources(accessToken, sketchId);
        const refreshed = outcomes.flatMap((outcome) => outcome.resource ? [outcome.resource] : []);
        if (refreshed.length) applyResourceSnapshots(refreshed);
    }, [accessToken, applyResourceSnapshots, sketchId]);

    useEffect(() => {
        if (!accessToken) return;
        void refreshDeployedResources();
        const interval = window.setInterval(() => void refreshDeployedResources(), RESOURCE_STATUS_POLL_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [accessToken, refreshDeployedResources, sketchId]);

    const addNode = (service: AwsService) => {
        recordHistory({ nodes, edges });
        const option = awsServiceOptions.find((entry) => entry.service === service);
        const id = crypto.randomUUID();
        setNodes((current) => [...current, {
            id,
            type: "resource",
            position: { x: 120 + current.length * 34, y: 120 + current.length * 28 },
            data: { service, label: option?.title ?? service, config: defaultResourceConfig(service) },
        }]);
        setSelectedNodeId(id);
    };

    const onConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;
        recordHistory({ nodes, edges });
        const normalized = normalizeEc2Connection(connection, nodes);
        const source = nodes.find((node) => node.id === normalized.source);
        const target = nodes.find((node) => node.id === normalized.target);
        const withoutPreviousKeyPair = source?.data.service === "KEY_PAIR" && target?.data.service === "EC2_INSTANCE"
            ? edges.filter((edge) => !(edge.target === target.id && nodes.find((node) => node.id === edge.source)?.data.service === "KEY_PAIR"))
            : edges;
        const nextEdges = addEdge({ ...normalized, id: crypto.randomUUID(), type: "smoothstep" }, withoutPreviousKeyPair);
        setEdges(nextEdges);
        setNodes((current) => syncEc2Bindings(current, nextEdges));
    }, [edges, nodes, recordHistory, setEdges, setNodes]);

    const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
        if (changes.some((change) => change.type === "add" || change.type === "remove")) recordHistory({ nodes, edges });
        const nextEdges = applyEdgeChanges(changes, edges);
        setEdges(nextEdges);
        setNodes((current) => syncEc2Bindings(current, nextEdges));
    }, [edges, nodes, recordHistory, setEdges, setNodes]);

    const handleNodesChange = useCallback((changes: NodeChange<ResourceFlowNode>[]) => {
        if (changes.some((change) => change.type === "add" || change.type === "remove")) recordHistory({ nodes, edges });
        onNodesChange(changes);
    }, [edges, nodes, onNodesChange, recordHistory]);

    const updateSelectedResource = (label: string, config: Record<string, unknown>) => {
        if (!selectedNode) return;
        setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label, config } } : node));
    };

    const loadSketch = useCallback((sketch: Sketch) => {
        setSketchConnectionId(sketch.connectionId);
        setName(sketch.name);
        setPersistedName(sketch.name);
        const loadedResources = Object.fromEntries((sketch.resources ?? []).flatMap((resource) => resource.nodeId ? [[resource.nodeId, resource]] : [])) as Record<string, AwsResourceSnapshot>;
        const graphNodes = layoutOverlappingGraphNodes(sketch.nodes ?? [], (sketch.edges ?? []).map((edge) => ({ sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId })));
        const loadedNodes: ResourceFlowNode[] = graphNodes.map((node) => ({
            id: node.id,
            type: "resource" as const,
            position: { x: node.positionX, y: node.positionY },
            data: { service: node.type, label: node.label ?? node.type, config: node.config, deployment: loadedResources[node.id] ? { status: loadedResources[node.id].status, lastError: loadedResources[node.id].lastError, actualState: loadedResources[node.id].actualState, desiredConfig: loadedResources[node.id].desiredConfig } : undefined },
        }));
        const loadedEdges: Edge[] = (sketch.edges ?? []).map((edge) => {
            const connection = normalizeEc2Connection({ source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null }, loadedNodes);
            return { id: edge.id, source: connection.source, target: connection.target, sourceHandle: null, targetHandle: null, type: "smoothstep" };
        });
        persistedCanvas.current = { nodes: loadedNodes, edges: loadedEdges };
        currentCanvas.current = { nodes: loadedNodes, edges: loadedEdges };
        resetHistory();
        setNodes(syncEc2Bindings(loadedNodes, loadedEdges));
        applyResourceSnapshots(sketch.resources ?? [], true);
        setEdges(loadedEdges);
        setSelectedNodeId(null);
    }, [applyResourceSnapshots, resetHistory, setEdges, setNodes]);

    const requestRename = () => {
        const nextName = name.trim();
        if (!nextName) {
            setName(persistedName);
            return;
        }
        if (!accessToken || nextName === persistedName) return;
        setNameToConfirm(nextName);
    };

    const rename = async () => {
        if (!accessToken || !nameToConfirm) return;
        setRenaming(true);
        try {
            const sketch = await renameSketch(accessToken, sketchId, nameToConfirm);
            setName(sketch.name);
            setPersistedName(sketch.name);
            setNameToConfirm(null);
        } catch {
            setName(persistedName);
        } finally {
            setRenaming(false);
        }
    };

    const reloadSketch = useCallback(async () => {
        if (!accessToken) return;
        loadSketch(await getSketch(accessToken, sketchId));
    }, [accessToken, loadSketch, sketchId]);

    const persistCanvas = useCallback(async (desired: CanvasSnapshot) => {
        if (!accessToken) return;
        const changes = diffCanvas(persistedCanvas.current, desired);
        if (Object.values(changes).every((entries) => entries.length === 0)) return;
        setAutoSaving(true);
        try {
            await Promise.all(changes.deletedEdges.map((edge) => deleteSketchEdge(accessToken, sketchId, edge.id)));
            await Promise.all(changes.deletedNodes.map((node) => deleteSketchNode(accessToken, sketchId, node.id)));
            await Promise.all(changes.createdNodes.map((node) => createSketchNode(accessToken, sketchId, serializeNode(node))));
            await Promise.all(changes.createdEdges.map((edge) => createSketchEdge(accessToken, sketchId, serializeEdge(edge))));
            await Promise.all(changes.movedNodes.map((node) => updateSketchNodePosition(accessToken, sketchId, node.id, node.position)));
            persistedCanvas.current = desired;
            setSaveError(null);
        } catch {
            setSaveError("Autosave failed. The canvas was restored to its last saved state.");
            await reloadSketch();
        } finally {
            setAutoSaving(false);
        }
    }, [accessToken, reloadSketch, sketchId]);

    const queueCanvasPersistence = useCallback(() => {
        const desired = currentCanvas.current;
        autoSaveQueue.current = autoSaveQueue.current.then(() => persistCanvas(desired));
    }, [persistCanvas]);
    const queueCanvasPersistenceDebounced = useDebounce(queueCanvasPersistence);

    useEffect(() => {
        currentCanvas.current = { nodes, edges };
        if (!loading && accessToken) queueCanvasPersistenceDebounced();
    }, [accessToken, edges, loading, nodes, queueCanvasPersistenceDebounced]);

    const saveGraph = async () => {
        if (!accessToken) return;
        const graph: GraphDefinition = {
            schemaVersion: 1,
            name: persistedName,
            nodes: nodes.map((node) => ({
                id: node.id,
                type: node.data.service,
                label: node.data.label,
                positionX: node.position.x,
                positionY: node.position.y,
                config: node.data.config,
            })),
            edges: edges.map((edge) => ({ sourceNodeId: edge.source, targetNodeId: edge.target })),
        };
        try {
            setSaving(true);
            setSaveError(null);
            queueCanvasPersistence();
            await autoSaveQueue.current;
            const definition = stringify(graph);
            validateGraphYaml(definition);
            await importGraph(accessToken, definition, sketchId);
            await reloadSketch();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Unable to save this graph.");
        } finally {
            setSaving(false);
        }
    };

    const applyHistory = useCallback((snapshot: CanvasSnapshot | undefined) => {
        if (!snapshot) return;
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setSelectedNodeId(null);
    }, [setEdges, setNodes]);
    const undo = useCallback(() => applyHistory(undoHistory(currentCanvas.current)), [applyHistory, undoHistory]);
    const redo = useCallback(() => applyHistory(redoHistory(currentCanvas.current)), [applyHistory, redoHistory]);

    useEffect(() => {
        const handleHistoryShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return;
            const key = event.key.toLowerCase();
            if (key === "z" && event.shiftKey) { event.preventDefault(); redo(); }
            else if (key === "z") { event.preventDefault(); undo(); }
            else if (key === "y") { event.preventDefault(); redo(); }
        };
        document.addEventListener("keydown", handleHistoryShortcut);
        return () => document.removeEventListener("keydown", handleHistoryShortcut);
    }, [redo, undo]);

    const applyBlueprint = useCallback(async (build: Omit<GraphDefinition, "schemaVersion">) => {
        if (!accessToken) return;
        const definition = stringify({ schemaVersion: 1, ...build });
        validateGraphYaml(definition);
        await importGraph(accessToken, definition, sketchId);
        await reloadSketch();
    }, [accessToken, reloadSketch, sketchId]);

    useEffect(() => {
        if (!accessToken) return;
        void getSketch(accessToken, sketchId)
            .then(loadSketch)
            .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Unable to load this sketch."))
            .finally(() => setLoading(false));
    }, [accessToken, loadSketch, sketchId]);

    const requestNodeDeletion = () => {
        if (!selectedNode) return;
        setNodeToDelete(selectedNode);
        setSelectedNodeId(null);
    };

    const deleteNode = () => {
        if (!nodeToDelete) return;
        recordHistory({ nodes, edges });
        const nextNodes = nodes.filter((node) => node.id !== nodeToDelete.id);
        const nextEdges = edges.filter((edge) => edge.source !== nodeToDelete.id && edge.target !== nodeToDelete.id);
        setNodes(syncEc2Bindings(nextNodes, nextEdges));
        setEdges(nextEdges);
        setNodeToDelete(null);
    };

    const canvasReady = !loading && !loadError;

    return <><div className="grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] bg-[var(--primary-bg-color)] text-(--primary-text-color) xl:grid-cols-[15rem_minmax(0,1fr)]">
        <ResourceSidebar disabled={!canvasReady} onAdd={addNode} onOpenAwsSettings={onOpenAwsSettings} />

        <div className="relative min-w-0">
            <div className="dashboard-header-enter absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-[var(--surface-color)]/95 px-4 backdrop-blur">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-3 py-2 transition focus-within:border-white/15 focus-within:bg-black/15"><Pencil className="h-3.5 w-3.5 shrink-0 text-(--secondary-text-color)" /><input aria-label="Sketch name" className="min-w-0 flex-1 bg-transparent font-(family-name:--font-display) text-sm font-semibold outline-none placeholder:text-(--muted-text-color) disabled:cursor-wait" disabled={!canvasReady} onBlur={requestRename} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} value={name} /></label>
                {saveError ? <span className="hidden max-w-64 truncate text-xs text-(--danger-color) lg:block">{saveError}</span> : null}
                <div className="flex items-center border border-white/10 bg-black/10"><button aria-label="Undo" className="grid h-9 w-9 place-items-center text-(--secondary-text-color) transition hover:bg-white/7 hover:text-(--primary-text-color) disabled:opacity-30" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" type="button"><Undo2 className="h-4 w-4" /></button><button aria-label="Redo" className="grid h-9 w-9 place-items-center border-l border-white/10 text-(--secondary-text-color) transition hover:bg-white/7 hover:text-(--primary-text-color) disabled:opacity-30" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)" type="button"><Redo2 className="h-4 w-4" /></button></div>
                {autoSaving ? <span className="hidden items-center gap-1.5 text-[11px] text-(--secondary-text-color) xl:inline-flex"><Loader2 className="h-3 w-3 animate-spin" />Autosaving</span> : null}
                <Link className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm text-(--secondary-text-color) transition hover:border-white/20 hover:bg-white/6 hover:text-(--primary-text-color)" href="/dashboard"><FolderOpen className="h-4 w-4" />Sketches</Link>
                {canvasReady ? <PublishSketchButton connectionId={sketchConnectionId} onPublished={async (connectionId) => { setSketchConnectionId(connectionId); await reloadSketch(); }} sketchId={sketchId} /> : null}
                <button className="inline-flex items-center gap-2 rounded-md bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) shadow-lg shadow-(--primary-color)/15 transition hover:brightness-110 disabled:opacity-60" disabled={!canvasReady || saving || nodes.length === 0} onClick={() => void saveGraph()} type="button">{saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}Save</button>
            </div>
            {loading ? <div className="grid h-full place-items-center pt-16 text-sm text-(--secondary-text-color)"><span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/12 px-4 py-3"><Loader2 className="h-4 w-4 animate-spin text-(--primary-color)" />Loading sketch</span></div> : null}
            {loadError ? <div className="grid h-full place-items-center px-4 pt-16 text-sm text-(--secondary-text-color)"><div className="rounded-md border border-white/10 bg-[var(--surface-color)] px-5 py-4 text-center shadow-xl"><p>{loadError}</p><Link className="mt-3 inline-flex items-center gap-2 text-(--secondary-color) hover:text-(--primary-text-color)" href="/dashboard"><ArrowLeft className="h-4 w-4" />Back to sketches</Link></div></div> : null}
            {canvasReady ? <><ReactFlow className="dashboard-enter" edges={edges} fitView nodes={nodes} nodeTypes={nodeTypeMap} onConnect={onConnect} onEdgesChange={handleEdgesChange} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onNodesChange={handleNodesChange} proOptions={{ hideAttribution: true }}><Background color="#343946" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow><AiComposer onApplyBlueprint={applyBlueprint} sketchId={sketchId} /></> : null}
        </div>
    </div>{canvasReady && selectedNode ? <Modal onClose={() => setSelectedNodeId(null)} open title={`Configure ${selectedNode.data.label}`}><ResourceInspector bindings={selectedBindings ? { keyPair: selectedBindings.keyPair ? `${selectedBindings.keyPair.data.label} (${String(selectedBindings.keyPair.data.config.keyName ?? "Configure key pair")})` : undefined, securityGroups: selectedBindings.securityGroups.map((node) => `${node.data.label} (${String(node.data.config.groupName ?? node.data.config.groupId ?? "Configure security group")})`) } : undefined} connectionId={sketchConnectionId} key={`${selectedNode.id}-${sketchConnectionId ?? "default"}`} node={selectedNode} onChange={updateSelectedResource} onDelete={requestNodeDeletion} onOpenAwsSettings={onOpenAwsSettings} resource={resourcesByNodeId[selectedNode.id]} /></Modal> : null}<ConfirmModal confirmLabel="Rename sketch" confirming={renaming} description={`Rename this sketch to ${nameToConfirm ?? "the new name"}.`} onClose={() => { setNameToConfirm(null); setName(persistedName); }} onConfirm={() => void rename()} open={Boolean(nameToConfirm)} title="Rename sketch?" /><ConfirmModal confirmLabel="Delete node" description={`Delete ${nodeToDelete?.data.label ?? "this node"} from the sketch. This change is saved automatically.`} onClose={() => setNodeToDelete(null)} onConfirm={deleteNode} open={Boolean(nodeToDelete)} title="Delete node?" variant="danger" /></>;
}
