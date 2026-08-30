"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Archive, Box, Copy, Database, FunctionSquare, HardDrive, KeyRound, KeySquare, Network, Send, Server } from "lucide-react";
import type { AwsService } from "@cloudcanvas/graph-contract";
import { pushToast } from "@/lib/toast";
import { getPendingDeploymentChanges } from "@/lib/deploymentChanges";
import DeploymentChangeInfo from "./DeploymentChangeInfo";

export type ResourceNodeData = {
    label: string;
    service: AwsService;
    config: Record<string, unknown>;
    deployment?: { status: string; lastError: string | null; actualState: Record<string, unknown> | null; desiredConfig: Record<string, unknown> };
};

const serviceAppearance: Record<AwsService, { accent: string; icon: typeof Server; title: string }> = {
    EC2_INSTANCE: { title: "EC2 instance", icon: Server, accent: "text-amber-300" },
    KEY_PAIR: { title: "EC2 key pair", icon: KeySquare, accent: "text-teal-300" },
    SECURITY_GROUP: { title: "Security group", icon: Network, accent: "text-emerald-300" },
    ECR_REPOSITORY: { title: "ECR repository", icon: Archive, accent: "text-rose-300" },
    S3_BUCKET: { title: "S3 bucket", icon: HardDrive, accent: "text-sky-300" },
    IAM_ROLE: { title: "IAM role", icon: KeyRound, accent: "text-violet-300" },
    LAMBDA_FUNCTION: { title: "Lambda function", icon: FunctionSquare, accent: "text-orange-300" },
    DYNAMODB_TABLE: { title: "DynamoDB table", icon: Database, accent: "text-cyan-300" },
    SQS_QUEUE: { title: "SQS queue", icon: Send, accent: "text-lime-300" },
    SNS_TOPIC: { title: "SNS topic", icon: Box, accent: "text-pink-300" },
};

export function ResourceNode({ data, selected }: NodeProps) {
    const resource = data as ResourceNodeData;
    const appearance = serviceAppearance[resource.service];
    const Icon = appearance.icon;

    const status = resource.deployment?.status;
    const statusClass = status === "RUNNING" ? "bg-emerald-400" : status === "PROVISIONING" || status === "DELETING" ? "bg-amber-300" : status === "FAILED" ? "bg-rose-400" : status === "TERMINATED" ? "bg-zinc-500" : "bg-slate-400";
    const publicIpAddress = typeof resource.deployment?.actualState?.publicIpAddress === "string" ? resource.deployment.actualState.publicIpAddress : "";
    const privateIpAddress = typeof resource.deployment?.actualState?.privateIpAddress === "string" ? resource.deployment.actualState.privateIpAddress : "";
    const changes = resource.deployment?.status === "RUNNING" ? getPendingDeploymentChanges(resource.service, resource.config, resource.deployment.desiredConfig) : [];
    const copyIpAddress = async (label: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            pushToast({ message: `${label} copied.`, variant: "success" });
        } catch {
            pushToast({ message: `Unable to copy ${label.toLowerCase()}.`, variant: "error" });
        }
    };

    return <div className={`canvas-node-enter min-w-48 rounded-md border bg-[var(--surface-color)] shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition-shadow ${selected ? "border-(--primary-color) shadow-[0_0_0_1px_var(--primary-color),0_16px_36px_rgba(0,0,0,0.38)]" : "border-white/12"}`}>
        <Handle className="!h-3 !w-3 !border-2 !border-[var(--surface-color)] !bg-(--secondary-text-color)" position={Position.Top} type="target" />
        <div className="overflow-hidden rounded-[inherit]">
            <div className="flex items-center gap-3 px-3 py-3">
                <span className={`grid h-8 w-8 place-items-center rounded-md bg-white/6 ${appearance.accent}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                    <p className="truncate font-(family-name:--font-display) text-sm font-semibold text-(--primary-text-color)">{resource.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-(--secondary-text-color)">{appearance.title}</p>
                </div>
            </div>
            {status ? <div className="flex items-center gap-1.5 border-t border-white/8 px-3 py-2 font-mono text-[10px] text-(--secondary-text-color)"><span className={`h-1.5 w-1.5 rounded-full ${statusClass}`} />{status.replaceAll("_", " ")}</div> : null}
            {changes.length ? <div className="flex items-center gap-1 border-t border-amber-300/20 bg-amber-300/8 px-3 py-1.5 font-mono text-[10px] text-amber-200">Changes pending <DeploymentChangeInfo changes={changes} /></div> : null}
            {resource.service === "EC2_INSTANCE" && (publicIpAddress || privateIpAddress) ? <div className="space-y-1 border-t border-white/8 px-3 py-2 font-mono text-[10px]"><div className="flex items-center justify-between gap-3"><span className="text-(--secondary-text-color)">Public IP</span><span className="flex items-center gap-1 text-(--primary-text-color)">{publicIpAddress || "Not assigned"}{publicIpAddress ? <button aria-label="Copy public IP" className="grid h-5 w-5 place-items-center text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={(event) => { event.stopPropagation(); void copyIpAddress("Public IP", publicIpAddress); }} title="Copy public IP" type="button"><Copy className="h-3 w-3" /></button> : null}</span></div><div className="flex items-center justify-between gap-3"><span className="text-(--secondary-text-color)">Private IP</span><span className="flex items-center gap-1 text-(--primary-text-color)">{privateIpAddress || "Not assigned"}{privateIpAddress ? <button aria-label="Copy private IP" className="grid h-5 w-5 place-items-center text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={(event) => { event.stopPropagation(); void copyIpAddress("Private IP", privateIpAddress); }} title="Copy private IP" type="button"><Copy className="h-3 w-3" /></button> : null}</span></div></div> : null}
        </div>
        <Handle className="!h-3 !w-3 !border-2 !border-[var(--surface-color)] !bg-(--secondary-color)" position={Position.Bottom} type="source" />
    </div>;
}

export const awsServiceOptions = Object.entries(serviceAppearance).map(([service, value]) => ({
    service: service as AwsService,
    ...value,
}));

export function defaultResourceConfig(service: AwsService): Record<string, unknown> {
    if (service === "EC2_INSTANCE") return { mode: "create", imageId: "", imageFamily: "amazon-linux", instanceType: "t3.micro", instanceCount: 1, rootVolumeType: "gp3", deleteRootVolumeOnTermination: true, shutdownBehavior: "stop", metadataHttpTokens: "required" };
    if (service === "KEY_PAIR") return { mode: "existing", keyName: "" };
    if (service === "SECURITY_GROUP") return { mode: "create", groupName: "cloudcanvas-security-group", description: "Managed by CloudCanvas", vpcId: "", ingressRules: [] };
    if (service === "ECR_REPOSITORY") return { repositoryName: "cloudcanvas-repository", imageTagMutability: "MUTABLE" };
    if (service === "S3_BUCKET") return { bucketName: "cloudcanvas-bucket", versioning: true, blockPublicAccess: true, encryption: "SSE-S3", enforceHttps: true };
    if (service === "IAM_ROLE") return { roleName: "cloudcanvas-role", trustedService: "ec2.amazonaws.com", managedPolicyArns: [] };
    if (service === "LAMBDA_FUNCTION") return { functionName: "cloudcanvas-function", roleArn: "arn:aws:iam::123456789012:role/cloudcanvas-role", handler: "index.handler", runtime: "nodejs22.x", codeZipBase64: "UEsDB" };
    if (service === "DYNAMODB_TABLE") return { tableName: "cloudcanvas-table", keySchema: [{ AttributeName: "id", KeyType: "HASH" }], attributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }], billingMode: "PAY_PER_REQUEST" };
    if (service === "SQS_QUEUE") return { queueName: "cloudcanvas-queue" };
    return { topicName: "cloudcanvas-topic" };
}
