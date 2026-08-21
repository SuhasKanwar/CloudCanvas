"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { addEdge, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, ChevronLeft, Code2, Save, Settings2 } from "lucide-react";
import { stringify } from "yaml";
import type { AwsService, GraphDefinition } from "@cloudcanvas/graph-contract";
import { importGraph, validateGraphYaml } from "@/lib/graph";
import type { Sketch } from "@/lib/sketches";
import AiComposer from "./AiComposer";
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
    const [saving, setSaving] = useState(false);
    const [configError, setConfigError] = useState<string | null>(null);
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

    const updateSelectedConfig = (value: string) => {
        if (!selectedNode) return;
        try {
            const config = JSON.parse(value) as Record<string, unknown>;
            if (!config || Array.isArray(config)) throw new Error();
            setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node));
            setConfigError(null);
        } catch {
            setConfigError("Configuration must be a JSON object.");
        }
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

    return <div className="grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] bg-[#101218] text-(--primary-text-color) xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="border-r border-white/10 px-3 py-4">
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
                <input aria-label="Sketch name" className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-(--muted-text-color)" onChange={(event) => setName(event.target.value)} value={name} />
                {saveError ? <span className="hidden max-w-64 truncate text-xs text-(--danger-color) lg:block">{saveError}</span> : null}
                <AiComposer onBuild={loadSketch} />
                <button className="inline-flex items-center gap-2 bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) disabled:opacity-60" disabled={saving || nodes.length === 0} onClick={() => void saveGraph()} type="button">{saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{sketchId ? "Save" : "Create"}</button>
            </div>
            <ReactFlow edges={edges} fitView nodes={nodes} nodeTypes={nodeTypeMap} onConnect={onConnect} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onNodesChange={onNodesChange}>
                <Background color="#343946" gap={18} size={1} /><Controls showInteractive={false} />
            </ReactFlow>
        </div>

        <aside className="hidden border-l border-white/10 xl:block">
            {selectedNode ? <div className="h-full overflow-auto p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><Code2 className="h-4 w-4 text-(--secondary-color)" />{selectedNode.data.label}</div>
                <p className="mt-2 text-xs leading-5 text-(--secondary-text-color)">Resource configuration</p>
                <textarea className="mt-4 min-h-80 w-full resize-y border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 outline-none focus:border-(--primary-color)" defaultValue={JSON.stringify(selectedNode.data.config, null, 2)} key={selectedNode.id} onChange={(event) => updateSelectedConfig(event.target.value)} spellCheck={false} />
                {configError ? <p className="mt-2 text-xs text-(--danger-color)">{configError}</p> : null}
            </div> : <div className="grid h-full place-items-center px-8 text-center text-sm leading-6 text-(--secondary-text-color)">Select a service node to edit its configuration.</div>}
        </aside>
    </div>;
}
