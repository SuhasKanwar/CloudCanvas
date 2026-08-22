"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Archive, Box, Database, FunctionSquare, HardDrive, KeyRound, KeySquare, Network, Send, Server } from "lucide-react";
import type { AwsService } from "@cloudcanvas/graph-contract";

export type ResourceNodeData = {
    label: string;
    service: AwsService;
    config: Record<string, unknown>;
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

    return <div className={`min-w-44 border bg-[#151821] shadow-lg ${selected ? "border-(--primary-color)" : "border-white/12"}`}>
        <Handle className="!h-2 !w-2 !border-0 !bg-(--secondary-text-color)" position={Position.Top} type="target" />
        <div className="flex items-center gap-3 px-3 py-3">
            <span className={`grid h-8 w-8 place-items-center bg-white/6 ${appearance.accent}`}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-(--primary-text-color)">{resource.label}</p>
                <p className="mt-0.5 font-mono text-[10px] text-(--secondary-text-color)">{appearance.title}</p>
            </div>
        </div>
        <Handle className="!h-2 !w-2 !border-0 !bg-(--secondary-color)" position={Position.Bottom} type="source" />
    </div>;
}

export const awsServiceOptions = Object.entries(serviceAppearance).map(([service, value]) => ({
    service: service as AwsService,
    ...value,
}));

export function defaultResourceConfig(service: AwsService): Record<string, unknown> {
    if (service === "EC2_INSTANCE") return { mode: "create", imageId: "", instanceType: "t3.micro", instanceCount: 1, rootVolumeType: "gp3", deleteRootVolumeOnTermination: true, shutdownBehavior: "stop", metadataHttpTokens: "required" };
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
