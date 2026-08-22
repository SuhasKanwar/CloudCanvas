"use client";

import { useState } from "react";
import { Braces, Code2, Tag, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { AwsService } from "@cloudcanvas/graph-contract";
import type { ResourceNodeData } from "./resourceNode";

type Field = { key: string; label: string; options?: string[]; multiline?: boolean };

const fields: Record<AwsService, Field[]> = {
    EC2_INSTANCE: [{ key: "imageId", label: "AMI ID" }, { key: "instanceType", label: "Instance type", options: ["t3.micro", "t3.small", "t3.medium", "m5.large"] }, { key: "keyName", label: "Key pair name" }],
    ECR_REPOSITORY: [{ key: "repositoryName", label: "Repository name" }, { key: "imageTagMutability", label: "Tag mutability", options: ["MUTABLE", "IMMUTABLE"] }],
    S3_BUCKET: [{ key: "bucketName", label: "Bucket name" }],
    IAM_ROLE: [{ key: "roleName", label: "Role name" }, { key: "assumeRolePolicyDocument", label: "Trust policy", multiline: true }],
    LAMBDA_FUNCTION: [{ key: "functionName", label: "Function name" }, { key: "roleArn", label: "Role ARN" }, { key: "handler", label: "Handler" }, { key: "runtime", label: "Runtime", options: ["nodejs22.x", "nodejs20.x", "python3.13", "python3.12"] }, { key: "codeZipBase64", label: "ZIP payload (base64)", multiline: true }],
    DYNAMODB_TABLE: [{ key: "tableName", label: "Table name" }, { key: "billingMode", label: "Billing mode", options: ["PAY_PER_REQUEST", "PROVISIONED"] }],
    SQS_QUEUE: [{ key: "queueName", label: "Queue name" }],
    SNS_TOPIC: [{ key: "topicName", label: "Topic name" }],
};

export default function ResourceInspector({ node, onChange, onDelete }: { node: Node<ResourceNodeData>; onChange: (label: string, config: Record<string, unknown>) => void; onDelete: () => void }) {
    const [advancedError, setAdvancedError] = useState<string | null>(null);
    const serviceFields = fields[node.data.service];
    const updateConfig = (key: string, value: unknown) => onChange(node.data.label, { ...node.data.config, [key]: value });

    return <div className="h-full overflow-auto p-5">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-(--primary-text-color)"><span className="flex items-center gap-2"><Code2 className="h-4 w-4 text-(--secondary-color)" />Resource settings</span><button aria-label="Delete node" className="p-2 text-(--secondary-text-color) hover:text-(--danger-color)" onClick={onDelete} title="Delete node" type="button"><Trash2 className="h-4 w-4" /></button></div>
        <div className="mt-6 space-y-5">
            <label className="block"><span className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Tag className="h-3.5 w-3.5" />Node label</span><input className="mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-(--primary-color)" onChange={(event) => onChange(event.target.value, node.data.config)} value={node.data.label} /></label>
            <div className="border-y border-white/10 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--secondary-text-color)">{node.data.service.replaceAll("_", " ")}</p></div>
            {serviceFields.map((field) => <label className="block" key={field.key}><span className="text-xs text-(--secondary-text-color)">{field.label}</span>{field.options ? <select className="mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-(--primary-color)" onChange={(event) => updateConfig(field.key, event.target.value)} value={String(node.data.config[field.key] ?? "")}><option value="">Select</option>{field.options.map((option) => <option className="bg-[#151821]" key={option} value={option}>{option}</option>)}</select> : field.multiline ? <textarea className="mt-2 min-h-24 w-full resize-y border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 outline-none focus:border-(--primary-color)" onChange={(event) => updateConfig(field.key, event.target.value)} value={String(node.data.config[field.key] ?? "")} /> : <input className="mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-(--primary-color)" onChange={(event) => updateConfig(field.key, event.target.value)} value={String(node.data.config[field.key] ?? "")} />}</label>)}
            {node.data.service === "SNS_TOPIC" ? <label className="flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm text-(--secondary-text-color)"><span>FIFO topic</span><input checked={node.data.config.fifoTopic === true} className="h-4 w-4 accent-(--primary-color)" onChange={(event) => updateConfig("fifoTopic", event.target.checked)} type="checkbox" /></label> : null}
            <details className="border-t border-white/10 pt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm text-(--secondary-text-color)"><Braces className="h-4 w-4" />Advanced JSON</summary><textarea className="mt-3 min-h-48 w-full resize-y border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 outline-none focus:border-(--primary-color)" defaultValue={JSON.stringify(node.data.config, null, 2)} key={`${node.id}:${JSON.stringify(node.data.config)}`} onBlur={(event) => { try { const config = JSON.parse(event.target.value) as Record<string, unknown>; if (!config || Array.isArray(config)) throw new Error(); onChange(node.data.label, config); setAdvancedError(null); } catch { setAdvancedError("Enter a JSON object."); } }} spellCheck={false} />{advancedError ? <p className="mt-2 text-xs text-(--danger-color)">{advancedError}</p> : null}</details>
        </div>
    </div>;
}
