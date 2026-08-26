"use client";
// @refresh reset

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { addEdge, applyEdgeChanges, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type EdgeChange, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Check, Pencil, Save, Settings2 } from "lucide-react";
import Link from "next/link";
import { stringify } from "yaml";
import type { AwsService, GraphDefinition } from "@cloudcanvas/graph-contract";
import { importGraph, validateGraphYaml } from "@/lib/graph";
import { RESOURCE_STATUS_POLL_INTERVAL_MS } from "@/lib/config";
import { getSketch, refreshSketchResources, renameSketch, type AwsResourceSnapshot, type Sketch } from "@/lib/sketches";
import AiComposer from "./AiComposer";
import PublishSketchButton from "./PublishSketchButton";
import ResourceInspector from "./ResourceInspector";
import Modal from "@/components/ui/Modal";
import { awsServiceOptions, defaultResourceConfig, ResourceNode, type ResourceNodeData } from "./resourceNode";

type ResourceFlowNode = Node<ResourceNodeData, "resource">;

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
    const [saveError, setSaveError] = useState<string | null>(null);
    const [resourcesByNodeId, setResourcesByNodeId] = useState<Record<string, AwsResourceSnapshot>>({});
    const resourcesByNodeIdRef = useRef<Record<string, AwsResourceSnapshot>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

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
        const normalized = normalizeEc2Connection(connection, nodes);
        const source = nodes.find((node) => node.id === normalized.source);
        const target = nodes.find((node) => node.id === normalized.target);
        const withoutPreviousKeyPair = source?.data.service === "KEY_PAIR" && target?.data.service === "EC2_INSTANCE"
            ? edges.filter((edge) => !(edge.target === target.id && nodes.find((node) => node.id === edge.source)?.data.service === "KEY_PAIR"))
            : edges;
        const nextEdges = addEdge({ ...normalized, type: "smoothstep" }, withoutPreviousKeyPair);
        setEdges(nextEdges);
        setNodes((current) => syncEc2Bindings(current, nextEdges));
    }, [edges, nodes, setEdges, setNodes]);

    const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
        const nextEdges = applyEdgeChanges(changes, edges);
        setEdges(nextEdges);
        setNodes((current) => syncEc2Bindings(current, nextEdges));
    }, [edges, setEdges, setNodes]);

    const updateSelectedResource = (label: string, config: Record<string, unknown>) => {
        if (!selectedNode) return;
        setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label, config } } : node));
    };

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
            const definition = stringify(graph);
            validateGraphYaml(definition);
            await importGraph(accessToken, definition, sketchId);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Unable to save this graph.");
        } finally {
            setSaving(false);
        }
    };

    const loadSketch = useCallback((sketch: Sketch) => {
        setSketchConnectionId(sketch.connectionId);
        setName(sketch.name);
        setPersistedName(sketch.name);
        const loadedResources = Object.fromEntries((sketch.resources ?? []).flatMap((resource) => resource.nodeId ? [[resource.nodeId, resource]] : [])) as Record<string, AwsResourceSnapshot>;
        const loadedNodes: ResourceFlowNode[] = (sketch.nodes ?? []).map((node) => ({
            id: node.id,
            type: "resource" as const,
            position: { x: node.positionX, y: node.positionY },
            data: { service: node.type, label: node.label ?? node.type, config: node.config, deployment: loadedResources[node.id] ? { status: loadedResources[node.id].status, lastError: loadedResources[node.id].lastError, actualState: loadedResources[node.id].actualState, desiredConfig: loadedResources[node.id].desiredConfig } : undefined },
        }));
        const loadedEdges: Edge[] = (sketch.edges ?? []).map((edge) => {
            const connection = normalizeEc2Connection({ source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null }, loadedNodes);
            return { id: edge.id, source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle, type: "smoothstep" };
        });
        setNodes(syncEc2Bindings(loadedNodes, loadedEdges));
        applyResourceSnapshots(sketch.resources ?? [], true);
        setEdges(loadedEdges);
        setSelectedNodeId(null);
    }, [applyResourceSnapshots, setEdges, setNodes]);

    const saveName = async () => {
        const nextName = name.trim();
        if (!nextName) {
            setName(persistedName);
            return;
        }
        if (!accessToken || nextName === persistedName) return;
        try {
            const sketch = await renameSketch(accessToken, sketchId, nextName);
            setName(sketch.name);
            setPersistedName(sketch.name);
        } catch {
            setName(persistedName);
        }
    };

    const reloadSketch = useCallback(async () => {
        if (!accessToken) return;
        loadSketch(await getSketch(accessToken, sketchId));
    }, [accessToken, loadSketch, sketchId]);

    useEffect(() => {
        if (!accessToken) return;
        void getSketch(accessToken, sketchId)
            .then(loadSketch)
            .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Unable to load this sketch."))
            .finally(() => setLoading(false));
    }, [accessToken, loadSketch, sketchId]);

    const deleteSelectedNode = () => {
        if (!selectedNode) return;
        const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
        const nextEdges = edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id);
        setNodes(syncEc2Bindings(nextNodes, nextEdges));
        setEdges(nextEdges);
        setSelectedNodeId(null);
    };

    if (loading) return <div className="grid h-full min-h-0 flex-1 place-items-center bg-[#101218] text-sm text-(--secondary-text-color)">Loading sketch…</div>;
    if (loadError) return <div className="grid h-full min-h-0 flex-1 place-items-center bg-[#101218] text-sm text-(--secondary-text-color)"><div className="text-center"><p>{loadError}</p><Link className="mt-3 inline-flex items-center gap-2 text-(--secondary-color) hover:text-(--primary-text-color)" href="/dashboard"><ArrowLeft className="h-4 w-4" />Back to sketches</Link></div></div>;

    return <><div className="grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] bg-[#101218] text-(--primary-text-color) xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-r border-white/10 px-3 py-4">
            <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-(--secondary-text-color)">AWS services</p>
            <div className="mt-3 space-y-1">
                {awsServiceOptions.map((option) => {
                    const Icon = option.icon;
                    return <button className="flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left text-sm text-(--secondary-text-color) transition hover:bg-white/6 hover:text-(--primary-text-color)" key={option.service} onClick={() => addNode(option.service)} type="button">
                        <Icon className={`h-4 w-4 ${option.accent}`} /><span>{option.title}</span>
                    </button>;
                })}
            </div>
                <button className="mt-6 flex w-full items-center gap-2 border-t border-white/10 px-2 pt-4 text-sm text-(--secondary-text-color) transition hover:text-(--primary-text-color)" onClick={onOpenAwsSettings} type="button"><Settings2 className="h-4 w-4" />AWS settings</button>
        </aside>

        <div className="relative min-w-0">
            <div className="absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-[#151821]/95 px-4 backdrop-blur">
                <label className="flex min-w-0 flex-1 items-center gap-2 border border-transparent px-2 py-1.5 focus-within:border-white/15 focus-within:bg-black/15"><Pencil className="h-3.5 w-3.5 shrink-0 text-(--secondary-text-color)" /><input aria-label="Sketch name" className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-(--muted-text-color)" onBlur={() => void saveName()} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} value={name} /></label>
                {saveError ? <span className="hidden max-w-64 truncate text-xs text-(--danger-color) lg:block">{saveError}</span> : null}
                <PublishSketchButton connectionId={sketchConnectionId} onPublished={async (connectionId) => { setSketchConnectionId(connectionId); await reloadSketch(); }} sketchId={sketchId} />
                <button className="inline-flex items-center gap-2 rounded-md bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) shadow-lg shadow-(--primary-color)/15 transition hover:brightness-110 disabled:opacity-60" disabled={saving || nodes.length === 0} onClick={() => void saveGraph()} type="button">{saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}Save</button>
            </div>
            <ReactFlow edges={edges} fitView nodes={nodes} nodeTypes={nodeTypeMap} onConnect={onConnect} onEdgesChange={handleEdgesChange} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onNodesChange={onNodesChange} proOptions={{ hideAttribution: true }}>
                <Background color="#343946" gap={18} size={1} /><Controls showInteractive={false} />
            </ReactFlow>
            <AiComposer onBuild={loadSketch} />
        </div>
    </div>{selectedNode ? <Modal onClose={() => setSelectedNodeId(null)} open title={`Configure ${selectedNode.data.label}`}><ResourceInspector bindings={selectedBindings ? { keyPair: selectedBindings.keyPair ? `${selectedBindings.keyPair.data.label} (${String(selectedBindings.keyPair.data.config.keyName ?? "Configure key pair")})` : undefined, securityGroups: selectedBindings.securityGroups.map((node) => `${node.data.label} (${String(node.data.config.groupName ?? node.data.config.groupId ?? "Configure security group")})`) } : undefined} connectionId={sketchConnectionId} key={`${selectedNode.id}-${sketchConnectionId ?? "default"}`} node={selectedNode} onChange={updateSelectedResource} onDelete={deleteSelectedNode} resource={resourcesByNodeId[selectedNode.id]} /></Modal> : null}</>;
}
