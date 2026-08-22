"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { addEdge, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Pencil, Plus, Save, Settings2 } from "lucide-react";
import { stringify } from "yaml";
import type { AwsService, GraphDefinition } from "@cloudcanvas/graph-contract";
import { importGraph, validateGraphYaml } from "@/lib/graph";
import type { Sketch } from "@/lib/sketches";
import AiComposer from "./AiComposer";
import SketchLibrary from "./SketchLibrary";
import PublishSketchButton from "./PublishSketchButton";
import ResourceInspector from "./ResourceInspector";
import { awsServiceOptions, defaultResourceConfig, ResourceNode, type ResourceNodeData } from "./resourceNode";

type ResourceFlowNode = Node<ResourceNodeData, "resource">;

const nodeTypes = { resource: ResourceNode };

export default function GraphEditor({ onOpenAwsSettings }: { onOpenAwsSettings: () => void }) {
    const { data: session } = useSession();
    const [nodes, setNodes, onNodesChange] = useNodesState<ResourceFlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [name, setName] = useState("Untitled infrastructure");
    const [sketchId, setSketchId] = useState<string | null>(null);
    const [sketchConnectionId, setSketchConnectionId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
    const nodeTypeMap = useMemo(() => nodeTypes, []);

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

    const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, type: "smoothstep" }, current)), [setEdges]);

    const updateSelectedResource = (label: string, config: Record<string, unknown>) => {
        if (!selectedNode) return;
        setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label, config } } : node));
    };

    const saveGraph = async () => {
        if (!session?.accessToken) return;
        const graph: GraphDefinition = {
            schemaVersion: 1,
            name,
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
            const sketch = await importGraph(session.accessToken, definition, sketchId ?? undefined);
            setSketchId(sketch.id);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Unable to save this graph.");
        } finally {
            setSaving(false);
        }
    };

    const loadSketch = (sketch: Sketch) => {
        setSketchId(sketch.id);
        setSketchConnectionId(sketch.connectionId);
        setName(sketch.name);
        setNodes((sketch.nodes ?? []).map((node) => ({
            id: node.id,
            type: "resource",
            position: { x: node.positionX, y: node.positionY },
            data: { service: node.type, label: node.label ?? node.type, config: node.config },
        })));
        setEdges((sketch.edges ?? []).map((edge) => ({
            id: edge.id,
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
            type: "smoothstep",
        })));
        setSelectedNodeId(null);
    };

    const newSketch = () => {
        setSketchId(null);
        setSketchConnectionId(null);
        setName("Untitled infrastructure");
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSaveError(null);
    };

    const deleteSelectedNode = () => {
        if (!selectedNode) return;
        setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
        setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
        setSelectedNodeId(null);
    };

    const handleSketchDeleted = (deletedSketchId: string) => {
        if (deletedSketchId === sketchId) newSketch();
    };

    return <div className="grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] bg-[#101218] text-(--primary-text-color) xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="min-h-0 overflow-auto border-r border-white/10 px-3 py-4">
            <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-(--secondary-text-color)">AWS services</p>
            <div className="mt-3 space-y-1">
                {awsServiceOptions.map((option) => {
                    const Icon = option.icon;
                    return <button className="flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm text-(--secondary-text-color) transition-colors hover:bg-white/6 hover:text-(--primary-text-color)" key={option.service} onClick={() => addNode(option.service)} type="button">
                        <Icon className={`h-4 w-4 ${option.accent}`} /><span>{option.title}</span>
                    </button>;
                })}
            </div>
            <button className="mt-6 flex w-full items-center gap-2 border-t border-white/10 px-2 pt-4 text-sm text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={onOpenAwsSettings} type="button"><Settings2 className="h-4 w-4" />AWS settings</button>
        </aside>

        <div className="relative min-w-0">
            <div className="absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-[#151821]/95 px-4 backdrop-blur">
                <label className="flex min-w-0 flex-1 items-center gap-2 border border-transparent px-2 py-1.5 focus-within:border-white/15 focus-within:bg-black/15"><Pencil className="h-3.5 w-3.5 shrink-0 text-(--secondary-text-color)" /><input aria-label="Sketch name" className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-(--muted-text-color)" onChange={(event) => setName(event.target.value)} value={name} /></label>
                {saveError ? <span className="hidden max-w-64 truncate text-xs text-(--danger-color) lg:block">{saveError}</span> : null}
                <button aria-label="Create a new sketch" className="hidden p-2 text-(--secondary-text-color) hover:text-(--primary-text-color) md:block" onClick={newSketch} title="New sketch" type="button"><Plus className="h-4 w-4" /></button>
                <SketchLibrary onDelete={handleSketchDeleted} onLoad={loadSketch} />
                <AiComposer onBuild={loadSketch} />
                <PublishSketchButton connectionId={sketchConnectionId} onPublished={setSketchConnectionId} sketchId={sketchId} />
                <button className="inline-flex items-center gap-2 bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) disabled:opacity-60" disabled={saving || nodes.length === 0} onClick={() => void saveGraph()} type="button">{saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{sketchId ? "Save" : "Create"}</button>
            </div>
            <ReactFlow edges={edges} fitView nodes={nodes} nodeTypes={nodeTypeMap} onConnect={onConnect} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onNodesChange={onNodesChange} proOptions={{ hideAttribution: true }}>
                <Background color="#343946" gap={18} size={1} /><Controls showInteractive={false} />
            </ReactFlow>
        </div>

        <aside className="hidden min-h-0 overflow-hidden border-l border-white/10 xl:block">
            {selectedNode ? <ResourceInspector connectionId={sketchConnectionId} node={selectedNode} onChange={updateSelectedResource} onDelete={deleteSelectedNode} /> : <div className="grid h-full place-items-center px-8 text-center text-sm leading-6 text-(--secondary-text-color)">Select a service node to configure its AWS settings.</div>}
        </aside>
    </div>;
}
