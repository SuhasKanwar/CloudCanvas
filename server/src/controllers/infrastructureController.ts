import type { Request, Response } from "express";
import type { AttributeDefinition, BillingMode, KeySchemaElement } from "@aws-sdk/client-dynamodb";
import type { Runtime } from "@aws-sdk/client-lambda";
import { Prisma } from "../generated/prisma/client.js";
import { AwsResourceStatus, DeploymentStatus, SketchStatus } from "../generated/prisma/enums.js";
import prisma from "../lib/prisma.js";
import { AWS_ENCRYPTION_KEY, AWS_REGION, AWS_RESOURCE_STATUS_REFRESH_CONCURRENCY } from "../lib/config.js";
import {
    awsResourceManager,
    decryptAwsSecret,
    encryptAwsSecret,
    AwsService,
    type AwsResourceCreateRequest,
} from "../services/aws/index.js";
import { createGraphPlan, remapConfigReferences, resolveConfigReferences } from "../services/aws/graph.js";
import { AIServiceError, aiService, type AiChatMessage } from "../services/aiService.js";
import { prepareGraphForPersistence, validateGraphDefinition } from "../services/graphParser.js";
import type { GraphDefinition } from "@cloudcanvas/graph-contract";
import type { ApiResponse } from "../types/response.js";
import { isAwsService } from "../utils/aws.js";
import { isRecord } from "../utils/validation.js";

const sketchInclude = {
    connection: { select: { id: true, name: true, region: true } },
    nodes: true,
    edges: true,
    resources: true,
    deployments: { orderBy: { createdAt: "desc" as const } },
};

function ownedUser(req: Request, res: Response<ApiResponse>) {
    if (!req.userId) {
        res.status(401).json({ success: false, message: "Authentication token is missing." });
        return null;
    }
    return req.userId;
}

function jsonValue(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function isMissingAwsResource(error: unknown) {
    const message = errorMessage(error).toLowerCase();
    return message.includes("notfound") || message.includes("not found") || message.includes("nosuch") || message.includes("does not exist");
}

type AwsResourceForDeletion = {
    id: string;
    sketchId: string;
    connectionId: string;
    service: string;
    externalId: string | null;
    region: string;
    status: AwsResourceStatus;
    managed: boolean;
    connection: { accessKeyIdEncrypted: string; secretAccessKeyEncrypted: string; sessionTokenEncrypted: string | null };
};

async function deleteResourceRecord(resource: AwsResourceForDeletion, userId: string) {
    if (resource.status === AwsResourceStatus.TERMINATED) return { resourceId: resource.id, status: "already_deleted" as const };
    if (!resource.externalId || !resource.managed) {
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.TERMINATED, lastError: null } });
        return { resourceId: resource.id, status: "deleted" as const };
    }
    if (!isAwsService(resource.service)) return { resourceId: resource.id, status: "failed" as const, error: "This AWS resource type is not supported yet." };
    if (!AWS_ENCRYPTION_KEY) return { resourceId: resource.id, status: "failed" as const, error: "AWS credential encryption is not configured." };

    const deployment = await prisma.deployment.create({
        data: {
            userId,
            sketchId: resource.sketchId,
            connectionId: resource.connectionId,
            request: jsonValue({ operation: "terminate", resourceId: resource.id, externalId: resource.externalId }),
        },
    });
    await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.DELETING, lastError: null } });
    try {
        const credentials = {
            accessKeyId: decryptAwsSecret(resource.connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(resource.connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(resource.connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(resource.connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
        const result = await awsResourceManager.deleteResource(resource.service, resource.externalId, credentials, resource.region);
        awsResourceManager.invalidateCatalog(resource.connectionId, resource.region);
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.TERMINATED, actualState: jsonValue(result.data), lastError: null } });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue(result.data), finishedAt: new Date() } });
        return { resourceId: resource.id, status: "deleted" as const, result };
    } catch (error) {
        const message = errorMessage(error);
        if (isMissingAwsResource(error)) {
            awsResourceManager.invalidateCatalog(resource.connectionId, resource.region);
            await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.TERMINATED, lastError: null } });
            await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue({ alreadyDeleted: true }), finishedAt: new Date() } });
            return { resourceId: resource.id, status: "already_deleted" as const };
        }
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.FAILED, lastError: message } });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.FAILED, errorMessage: message, finishedAt: new Date() } });
        return { resourceId: resource.id, status: "failed" as const, error: message };
    }
}

async function refreshResourceRecord(resource: AwsResourceForDeletion) {
    if (resource.status === AwsResourceStatus.TERMINATED || resource.status === AwsResourceStatus.DELETING) {
        return { resourceId: resource.id, status: "skipped" as const };
    }
    if (!resource.externalId || !isAwsService(resource.service) || !AWS_ENCRYPTION_KEY) {
        return { resourceId: resource.id, status: "skipped" as const };
    }
    try {
        const credentials = {
            accessKeyId: decryptAwsSecret(resource.connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(resource.connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(resource.connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(resource.connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
        const details = await awsResourceManager.getResourceDetails(resource.service, resource.externalId, credentials, resource.region);
        const updated = await prisma.awsResource.update({
            where: { id: resource.id },
            data: {
                status: details.status,
                actualState: jsonValue({ ...details.data, state: details.state, refreshedAt: new Date().toISOString() }),
                lastError: null,
            },
        });
        return { resourceId: resource.id, status: "refreshed" as const, resource: updated };
    } catch (error) {
        const message = errorMessage(error);
        if (isMissingAwsResource(error)) {
            const updated = await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.TERMINATED, lastError: null } });
            return { resourceId: resource.id, status: "terminated" as const, resource: updated };
        }
        await prisma.awsResource.update({ where: { id: resource.id }, data: { lastError: message } });
        return { resourceId: resource.id, status: "failed" as const, error: message };
    }
}

function param(req: Request, name: string) {
    const value = req.params[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function optionalCanvasEntityId(value: unknown) {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new Error("Canvas entity ID must contain only letters, numbers, underscores, or hyphens.");
    }
    return value;
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

const ec2LaunchOnlyConfigKeys = ["imageId", "launchTemplateId", "instanceType", "instanceCount", "keyName", "rootDeviceName", "rootVolumeSizeGiB", "rootVolumeType", "deleteRootVolumeOnTermination", "subnetId", "iamInstanceProfile", "userData", "ebsOptimized", "metadataHttpTokens", "name"] as const;

function assertDeployedResourceUpdate(previousConfig: unknown, request: AwsResourceCreateRequest) {
    if (request.service !== AwsService.EC2_INSTANCE || !isRecord(previousConfig)) return;
    const changedKeys = ec2LaunchOnlyConfigKeys.filter((key) => JSON.stringify(previousConfig[key]) !== JSON.stringify(request.config[key]));
    if (changedKeys.length) throw new Error(`EC2 ${changedKeys.join(", ")} cannot be changed after deployment. Create a replacement instance instead.`);
}

function isAdoptedResource(request: AwsResourceCreateRequest) {
    return (request.service === AwsService.EC2_INSTANCE || request.service === AwsService.SECURITY_GROUP || request.service === AwsService.KEY_PAIR) && request.config.mode === "existing";
}

function buildResourceRequest(type: string, config: Record<string, unknown>): AwsResourceCreateRequest {
    if (type === "EC2_INSTANCE") {
        if (config.mode === "existing") {
            if (typeof config.instanceId !== "string" || !config.instanceId) throw new Error("Choose an existing EC2 instance.");
            return { service: AwsService.EC2_INSTANCE, config: { mode: "existing", instanceId: config.instanceId, ...(typeof config.name === "string" && { name: config.name }) } };
        }
        if ((typeof config.imageId !== "string" || !config.imageId) && (typeof config.launchTemplateId !== "string" || !config.launchTemplateId)) throw new Error("EC2 node config must include an AMI ID or launch template.");
        return {
            service: AwsService.EC2_INSTANCE,
            config: {
                ...(typeof config.imageId === "string" && config.imageId && { imageId: config.imageId }),
                ...(typeof config.rootDeviceName === "string" && config.rootDeviceName && { rootDeviceName: config.rootDeviceName }),
                ...(typeof config.rootVolumeSizeGiB === "number" && { rootVolumeSizeGiB: config.rootVolumeSizeGiB }),
                ...(config.rootVolumeType === "gp3" || config.rootVolumeType === "gp2" ? { rootVolumeType: config.rootVolumeType } : {}),
                ...(typeof config.deleteRootVolumeOnTermination === "boolean" && { deleteRootVolumeOnTermination: config.deleteRootVolumeOnTermination }),
                ...(typeof config.launchTemplateId === "string" && config.launchTemplateId && { launchTemplateId: config.launchTemplateId }),
                ...(typeof config.instanceType === "string" && { instanceType: config.instanceType }),
                ...(typeof config.instanceCount === "number" && { instanceCount: config.instanceCount }),
                ...(typeof config.keyName === "string" && { keyName: config.keyName }),
                ...(Array.isArray(config.securityGroupIds) && { securityGroupIds: stringArray(config.securityGroupIds) }),
                ...(typeof config.subnetId === "string" && { subnetId: config.subnetId }),
                ...(typeof config.iamInstanceProfile === "string" && { iamInstanceProfile: config.iamInstanceProfile }),
                ...(typeof config.name === "string" && { name: config.name }),
                ...(typeof config.userData === "string" && { userData: config.userData }),
                ...(typeof config.monitoring === "boolean" && { monitoring: config.monitoring }),
                ...(typeof config.ebsOptimized === "boolean" && { ebsOptimized: config.ebsOptimized }),
                ...(typeof config.disableApiTermination === "boolean" && { disableApiTermination: config.disableApiTermination }),
                ...(config.shutdownBehavior === "stop" || config.shutdownBehavior === "terminate" ? { shutdownBehavior: config.shutdownBehavior } : {}),
                ...(config.metadataHttpTokens === "optional" || config.metadataHttpTokens === "required" ? { metadataHttpTokens: config.metadataHttpTokens } : {}),
                ...(config.dryRun === true && { dryRun: true }),
            },
        };
    }
    if (type === "KEY_PAIR") {
        if (typeof config.keyName !== "string" || !config.keyName) throw new Error("Key pair node config must include keyName.");
        if (config.mode === "existing") return { service: AwsService.KEY_PAIR, config: { mode: "existing", keyName: config.keyName } };
        if (typeof config.publicKeyMaterial !== "string" || !config.publicKeyMaterial) throw new Error("Importing a key pair requires public key material.");
        return { service: AwsService.KEY_PAIR, config: { mode: "import", keyName: config.keyName, publicKeyMaterial: config.publicKeyMaterial } };
    }
    if (type === "SECURITY_GROUP") {
        if (config.mode === "existing") {
            if (typeof config.groupId !== "string" || !config.groupId) throw new Error("Choose an existing security group.");
            return { service: AwsService.SECURITY_GROUP, config: { mode: "existing", groupId: config.groupId, ...(typeof config.groupName === "string" && { groupName: config.groupName }) } };
        }
        if (typeof config.groupName !== "string" || !config.groupName || typeof config.description !== "string" || !config.description || typeof config.vpcId !== "string" || !config.vpcId) throw new Error("New security groups require a name, description, and VPC.");
        const ingressRules = Array.isArray(config.ingressRules) ? config.ingressRules.filter((rule): rule is { protocol: "tcp" | "udp" | "icmp" | "-1"; fromPort?: number; toPort?: number; cidrIpv4: string; description?: string } => isRecord(rule) && (rule.protocol === "tcp" || rule.protocol === "udp" || rule.protocol === "icmp" || rule.protocol === "-1") && typeof rule.cidrIpv4 === "string" && rule.cidrIpv4.length > 0 && (rule.protocol === "-1" || (typeof rule.fromPort === "number" && typeof rule.toPort === "number"))) : [];
        return { service: AwsService.SECURITY_GROUP, config: { groupName: config.groupName, description: config.description, vpcId: config.vpcId, ...(ingressRules.length && { ingressRules }) } };
    }
    if (type === "ECR_REPOSITORY") {
        if (typeof config.repositoryName !== "string" || !config.repositoryName) throw new Error("ECR node config must include repositoryName.");
        if (config.imageTagMutability !== undefined && config.imageTagMutability !== "MUTABLE" && config.imageTagMutability !== "IMMUTABLE") {
            throw new Error("imageTagMutability must be MUTABLE or IMMUTABLE.");
        }
        return {
            service: AwsService.ECR_REPOSITORY,
            config: {
                repositoryName: config.repositoryName,
                ...(config.imageTagMutability && { imageTagMutability: config.imageTagMutability }),
                ...(typeof config.scanOnPush === "boolean" && { scanOnPush: config.scanOnPush }),
            },
        };
    }
    if (type === "S3_BUCKET") {
        if (typeof config.bucketName !== "string" || !config.bucketName) throw new Error("S3 node config must include bucketName.");
        if (config.encryption !== undefined && config.encryption !== "SSE-S3" && config.encryption !== "SSE-KMS") throw new Error("S3 encryption must be SSE-S3 or SSE-KMS.");
        return { service: AwsService.S3_BUCKET, config: { bucketName: config.bucketName, ...(typeof config.versioning === "boolean" && { versioning: config.versioning }), ...(typeof config.blockPublicAccess === "boolean" && { blockPublicAccess: config.blockPublicAccess }), ...(config.encryption && { encryption: config.encryption }), ...(typeof config.kmsKeyArn === "string" && { kmsKeyArn: config.kmsKeyArn }), ...(typeof config.enforceHttps === "boolean" && { enforceHttps: config.enforceHttps }) } };
    }
    if (type === "IAM_ROLE") {
        if (typeof config.roleName !== "string" || !config.roleName) throw new Error("IAM node config must include roleName.");
        const trustedService = config.trustedService;
        if (trustedService !== undefined && trustedService !== "ec2.amazonaws.com" && trustedService !== "lambda.amazonaws.com" && trustedService !== "ecs-tasks.amazonaws.com") {
            throw new Error("IAM trustedService must be EC2, Lambda, or ECS tasks.");
        }
        if (trustedService === undefined && (typeof config.assumeRolePolicyDocument !== "string" || !config.assumeRolePolicyDocument)) {
            throw new Error("IAM node config must include a trusted AWS service.");
        }
        return {
            service: AwsService.IAM_ROLE,
            config: {
                roleName: config.roleName,
                ...(typeof trustedService === "string" && { trustedService }),
                ...(typeof config.assumeRolePolicyDocument === "string" && { assumeRolePolicyDocument: config.assumeRolePolicyDocument }),
                ...(Array.isArray(config.managedPolicyArns) && { managedPolicyArns: stringArray(config.managedPolicyArns) }),
                ...(typeof config.description === "string" && { description: config.description }),
                ...(typeof config.path === "string" && { path: config.path }),
                ...(typeof config.maxSessionDuration === "number" && { maxSessionDuration: config.maxSessionDuration }),
                ...(typeof config.permissionsBoundaryArn === "string" && { permissionsBoundaryArn: config.permissionsBoundaryArn }),
            },
        };
    }
    if (type === "LAMBDA_FUNCTION") {
        const required = ["functionName", "roleArn", "handler", "runtime", "codeZipBase64"];
        if (required.some((key) => typeof config[key] !== "string" || !config[key])) {
            throw new Error("Lambda node config must include functionName, roleArn, handler, runtime, and codeZipBase64.");
        }
        return {
            service: AwsService.LAMBDA_FUNCTION,
            config: {
                functionName: config.functionName as string,
                roleArn: config.roleArn as string,
                handler: config.handler as string,
                runtime: config.runtime as Runtime,
                codeZipBase64: config.codeZipBase64 as string,
                ...(typeof config.description === "string" && { description: config.description }),
                ...(typeof config.memorySize === "number" && { memorySize: config.memorySize }),
                ...(typeof config.timeout === "number" && { timeout: config.timeout }),
            },
        };
    }
    if (type === "DYNAMODB_TABLE") {
        if (typeof config.tableName !== "string" || !config.tableName || !Array.isArray(config.keySchema) || !Array.isArray(config.attributeDefinitions)) {
            throw new Error("DynamoDB node config must include tableName, keySchema, and attributeDefinitions arrays.");
        }
        if (config.billingMode !== undefined && config.billingMode !== "PAY_PER_REQUEST" && config.billingMode !== "PROVISIONED") {
            throw new Error("DynamoDB billingMode must be PAY_PER_REQUEST or PROVISIONED.");
        }
        return {
            service: AwsService.DYNAMODB_TABLE,
            config: {
                tableName: config.tableName,
                keySchema: config.keySchema as KeySchemaElement[],
                attributeDefinitions: config.attributeDefinitions as AttributeDefinition[],
                ...(config.billingMode && { billingMode: config.billingMode as BillingMode }),
                ...(typeof config.readCapacityUnits === "number" && { readCapacityUnits: config.readCapacityUnits }),
                ...(typeof config.writeCapacityUnits === "number" && { writeCapacityUnits: config.writeCapacityUnits }),
            },
        };
    }
    if (type === "SQS_QUEUE") {
        if (typeof config.queueName !== "string" || !config.queueName) throw new Error("SQS node config must include queueName.");
        return {
            service: AwsService.SQS_QUEUE,
            config: {
                queueName: config.queueName,
                ...(typeof config.visibilityTimeoutSeconds === "number" && { visibilityTimeoutSeconds: config.visibilityTimeoutSeconds }),
                ...(typeof config.messageRetentionPeriodSeconds === "number" && { messageRetentionPeriodSeconds: config.messageRetentionPeriodSeconds }),
            },
        };
    }
    if (type === "SNS_TOPIC") {
        if (typeof config.topicName !== "string" || !config.topicName) throw new Error("SNS node config must include topicName.");
        return { service: AwsService.SNS_TOPIC, config: { topicName: config.topicName, ...(config.fifoTopic === true && { fifoTopic: true }) } };
    }
    throw new Error("Supported services are EC2_INSTANCE, KEY_PAIR, SECURITY_GROUP, ECR_REPOSITORY, S3_BUCKET, IAM_ROLE, LAMBDA_FUNCTION, DYNAMODB_TABLE, SQS_QUEUE, and SNS_TOPIC.");
}

function touchSketch(sketchId: string) {
    return prisma.sketch.update({ where: { id: sketchId }, data: { version: { increment: 1 } } });
}

function isChatHistory(value: unknown): value is AiChatMessage[] {
    return Array.isArray(value) && value.every((message) => (
        isRecord(message)
        && typeof message.role === "string"
        && ["system", "user", "assistant", "tool"].includes(message.role)
        && typeof message.content === "string"
    ));
}

type PreparedGraphNode = ReturnType<typeof prepareGraphForPersistence>[number];

async function persistPreparedGraph(tx: Prisma.TransactionClient, sketchId: string, graph: GraphDefinition, prepared: PreparedGraphNode[]) {
    const nodeIds = new Map<string, string>();
    for (const node of prepared) {
        const created = await tx.sketchNode.create({
            data: {
                sketchId,
                type: node.type,
                label: node.label,
                positionX: node.positionX,
                positionY: node.positionY,
                config: jsonValue(node.config),
            },
        });
        nodeIds.set(node.sourceId, created.id);
    }
    for (const node of prepared) {
        const nodeId = nodeIds.get(node.sourceId);
        if (!nodeId) throw new Error(`Graph node ${node.sourceId} was not persisted.`);
        await tx.sketchNode.update({
            where: { id: nodeId },
            data: { config: jsonValue(remapConfigReferences(node.config, nodeIds)) },
        });
    }
    for (const edge of graph.edges) {
        const sourceNodeId = nodeIds.get(edge.sourceNodeId);
        const targetNodeId = nodeIds.get(edge.targetNodeId);
        if (!sourceNodeId || !targetNodeId) throw new Error("Graph edge references an unknown node.");
        await tx.sketchEdge.create({
            data: {
                sketchId,
                sourceNodeId,
                targetNodeId,
                sourceHandle: edge.sourceHandle ?? null,
                targetHandle: edge.targetHandle ?? null,
            },
        });
    }
}

async function persistGraph(userId: string, graph: GraphDefinition) {
    const prepared = prepareGraphForPersistence(graph);
    return prisma.$transaction(async (tx) => {
        const sketch = await tx.sketch.create({
            data: { userId, name: graph.name.trim(), description: graph.description ?? null },
        });
        await persistPreparedGraph(tx, sketch.id, graph, prepared);
        return tx.sketch.findUniqueOrThrow({ where: { id: sketch.id }, include: sketchInclude });
    });
}

export async function createSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "Sketch name is required." });

    const sketch = await prisma.sketch.create({
        data: {
            userId,
            name,
            description: typeof req.body.description === "string" ? req.body.description : null,
        },
    });
    return res.status(201).json({ success: true, message: "Sketch created successfully.", data: sketch });
}

export async function createAiSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const query = req.body?.query;
    const sessionHistory = req.body?.session_history;
    if (typeof query !== "string" || !query.trim()) {
        return res.status(400).json({ success: false, message: "AI query must not be empty." });
    }
    if (sessionHistory !== undefined && !isChatHistory(sessionHistory)) {
        return res.status(400).json({ success: false, message: "AI session history contains an invalid message." });
    }

    let aiResponse;
    try {
        aiResponse = await aiService.query({
            query,
            ...(sessionHistory !== undefined && { session_history: sessionHistory }),
        });
    } catch (error) {
        if (error instanceof AIServiceError) {
            const status = error.code === "invalid_request" ? 400
                : error.code === "timeout" ? 504
                    : error.code === "unavailable" ? 503
                        : 502;
            return res.status(status).json({ success: false, message: error.message });
        }
        return res.status(502).json({ success: false, message: "AI sketch generation failed.", error: errorMessage(error) });
    }

    if (aiResponse.data.type === "text") {
        return res.json({ success: true, message: aiResponse.message, data: aiResponse.data });
    }

    let graph: GraphDefinition;
    try {
        graph = validateGraphDefinition({ schemaVersion: 1, ...aiResponse.data.build });
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    let sketch;
    try {
        sketch = await persistGraph(userId, graph);
    } catch (error) {
        return res.status(500).json({ success: false, message: "AI sketch could not be saved.", error: errorMessage(error) });
    }
    return res.status(201).json({
        success: true,
        message: aiResponse.message,
        data: { type: "build", message: aiResponse.data.message, sketch },
    });
}

export async function importSketchGraph(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    if (!req.graph) return res.status(400).json({ success: false, message: "A graph definition is required." });
    try {
        const sketch = await persistGraph(userId, req.graph);
        return res.status(201).json({ success: true, message: "Graph imported successfully.", data: sketch });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Graph could not be saved.", error: errorMessage(error) });
    }
}

export async function replaceSketchGraph(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    if (!req.graph) return res.status(400).json({ success: false, message: "A graph definition is required." });
    const sketchId = param(req, "sketchId");
    const existing = await prisma.sketch.findFirst({
        where: { id: sketchId, userId },
        include: { resources: { select: { status: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (existing.resources.some((resource) => resource.status !== AwsResourceStatus.TERMINATED)) {
        return res.status(409).json({ success: false, message: "Delete deployed AWS resources before replacing this sketch graph." });
    }
    try {
        const prepared = prepareGraphForPersistence(req.graph);
        const sketch = await prisma.$transaction(async (tx) => {
            await tx.sketchEdge.deleteMany({ where: { sketchId } });
            await tx.sketchNode.deleteMany({ where: { sketchId } });
            await tx.sketch.update({
                where: { id: sketchId },
                data: { description: req.graph!.description ?? null, version: { increment: 1 } },
            });
            await persistPreparedGraph(tx, sketchId, req.graph!, prepared);
            return tx.sketch.findUniqueOrThrow({ where: { id: sketchId }, include: sketchInclude });
        });
        return res.json({ success: true, message: "Graph updated successfully.", data: sketch });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Graph could not be updated.", error: errorMessage(error) });
    }
}

export async function listSketches(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketches = await prisma.sketch.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
    return res.json({ success: true, message: "Sketches fetched successfully.", data: sketches });
}

export async function getSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketch = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId }, include: sketchInclude });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    return res.json({ success: true, message: "Sketch fetched successfully.", data: sketch });
}

export async function updateSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const status = req.body?.status;
    if (status !== undefined && !Object.values(SketchStatus).includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid sketch status." });
    }
    const existing = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId } });
    if (!existing) return res.status(404).json({ success: false, message: "Sketch not found." });

    const sketch = await prisma.sketch.update({
        where: { id: existing.id },
        data: {
            ...(typeof req.body?.description === "string" && { description: req.body.description }),
            ...(status !== undefined && { status }),
            version: { increment: 1 },
        },
    });
    return res.json({ success: true, message: "Sketch updated successfully.", data: sketch });
}

export async function renameSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "Sketch name is required." });
    const existing = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: "Sketch not found." });

    const sketch = await prisma.sketch.update({ where: { id: existing.id }, data: { name, version: { increment: 1 } } });
    return res.json({ success: true, message: "Sketch renamed successfully.", data: sketch });
}

export async function deleteSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketchId = param(req, "sketchId");
    const sketch = await prisma.sketch.findFirst({ where: { id: sketchId, userId }, include: { nodes: true, edges: true, resources: { include: { connection: true } } } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    let order: string[] = [];
    try { order = createGraphPlan(sketch.nodes, sketch.edges).order.reverse(); } catch { order = sketch.nodes.map((node) => node.id).reverse(); }
    const ranks = new Map(order.map((nodeId, index) => [nodeId, index]));
    const resources = [...sketch.resources].sort((left, right) => (ranks.get(left.nodeId ?? "") ?? Number.MAX_SAFE_INTEGER) - (ranks.get(right.nodeId ?? "") ?? Number.MAX_SAFE_INTEGER));
    const outcomes = [];
    for (const resource of resources) {
        const outcome = await deleteResourceRecord(resource, userId);
        outcomes.push(outcome);
        if (outcome.status === "failed") return res.status(502).json({ success: false, message: "Sketch deletion stopped because an AWS resource could not be deleted.", error: outcome.error, data: { outcomes } });
    }
    await prisma.sketch.delete({ where: { id: sketch.id } });
    return res.json({ success: true, message: "Sketch and its deployed AWS resources were deleted successfully.", data: { outcomes } });
}

export async function createSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketch = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId }, select: { id: true } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (typeof req.body?.type !== "string" || !isAwsService(req.body.type.trim()) || !isRecord(req.body.config)) {
        return res.status(400).json({ success: false, message: "Node type and config are required." });
    }
    let id: string | undefined;
    try {
        id = optionalCanvasEntityId(req.body.id);
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }

    const node = await prisma.sketchNode.create({
        data: {
            ...(id && { id }),
            sketchId: sketch.id,
            type: req.body.type.trim(),
            label: typeof req.body.label === "string" ? req.body.label : null,
            positionX: typeof req.body.positionX === "number" ? req.body.positionX : 0,
            positionY: typeof req.body.positionY === "number" ? req.body.positionY : 0,
            config: jsonValue(req.body.config),
        },
    });
    await touchSketch(sketch.id);
    return res.status(201).json({ success: true, message: "Sketch node created successfully.", data: node });
}

export async function updateSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const node = await prisma.sketchNode.findFirst({ where: { id: param(req, "nodeId"), sketch: { id: param(req, "sketchId"), userId } } });
    if (!node) return res.status(404).json({ success: false, message: "Sketch node not found." });
    const changingResourceConfig = req.body?.type !== undefined || req.body?.config !== undefined;
    if (changingResourceConfig) {
        const resource = await prisma.awsResource.findUnique({ where: { nodeId: node.id }, select: { status: true } });
        if (resource && resource.status !== AwsResourceStatus.TERMINATED) {
            return res.status(409).json({ success: false, message: "Delete the deployed resource before changing its AWS configuration." });
        }
    }
    let resourceRequest: AwsResourceCreateRequest | null = null;
    if (changingResourceConfig) {
        const type = req.body?.type === undefined ? node.type : req.body.type;
        const config = req.body?.config === undefined ? node.config : req.body.config;
        if (typeof type !== "string" || !isRecord(config)) {
            return res.status(400).json({ success: false, message: "Node type and config must be valid AWS resource data." });
        }
        try {
            resourceRequest = buildResourceRequest(type, config);
        } catch (error) {
            return res.status(400).json({ success: false, message: errorMessage(error) });
        }
    }
    const updated = await prisma.sketchNode.update({
        where: { id: node.id },
        data: {
            ...(resourceRequest && { type: resourceRequest.service, config: jsonValue(resourceRequest.config) }),
            ...(typeof req.body?.label === "string" && { label: req.body.label }),
            ...(typeof req.body?.positionX === "number" && { positionX: req.body.positionX }),
            ...(typeof req.body?.positionY === "number" && { positionY: req.body.positionY }),
        },
    });
    await touchSketch(node.sketchId);
    return res.json({ success: true, message: "Sketch node updated successfully.", data: updated });
}

export async function deleteSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const node = await prisma.sketchNode.findFirst({ where: { id: param(req, "nodeId"), sketch: { id: param(req, "sketchId"), userId } } });
    if (!node) return res.status(404).json({ success: false, message: "Sketch node not found." });
    const resource = await prisma.awsResource.findUnique({ where: { nodeId: node.id }, select: { status: true, externalId: true } });
    if (resource && (
        resource.status === AwsResourceStatus.RUNNING
        || resource.status === AwsResourceStatus.PROVISIONING
        || resource.status === AwsResourceStatus.DELETING
        || (resource.status === AwsResourceStatus.FAILED && resource.externalId)
    )) {
        return res.status(409).json({ success: false, message: "Delete the deployed resource before deleting its sketch node." });
    }
    const result = await prisma.sketchNode.deleteMany({ where: { id: node.id } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch node not found." });
    await touchSketch(node.sketchId);
    return res.json({ success: true, message: "Sketch node deleted successfully." });
}

export async function createSketchEdge(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const { sourceNodeId, targetNodeId } = req.body ?? {};
    if (typeof sourceNodeId !== "string" || typeof targetNodeId !== "string") {
        return res.status(400).json({ success: false, message: "Source and target node IDs are required." });
    }
    const sketchId = param(req, "sketchId");
    let id: string | undefined;
    try {
        id = optionalCanvasEntityId(req.body.id);
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    const sketch = await prisma.sketch.findFirst({
        where: { id: sketchId, userId },
        include: { nodes: { select: { id: true } }, edges: { select: { sourceNodeId: true, targetNodeId: true } } },
    });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    try {
        createGraphPlan(sketch.nodes, [...sketch.edges, { sourceNodeId, targetNodeId }]);
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    const edge = await prisma.sketchEdge.create({
        data: {
            ...(id && { id }),
            sketchId,
            sourceNodeId,
            targetNodeId,
            sourceHandle: typeof req.body.sourceHandle === "string" ? req.body.sourceHandle : null,
            targetHandle: typeof req.body.targetHandle === "string" ? req.body.targetHandle : null,
        },
    });
    await touchSketch(sketchId);
    return res.status(201).json({ success: true, message: "Sketch edge created successfully.", data: edge });
}

export async function deleteSketchEdge(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketchId = param(req, "sketchId");
    const result = await prisma.sketchEdge.deleteMany({ where: { id: param(req, "edgeId"), sketch: { id: sketchId, userId } } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch edge not found." });
    await touchSketch(sketchId);
    return res.json({ success: true, message: "Sketch edge deleted successfully." });
}

export async function createAwsConnection(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const { name, region, accessKeyId, secretAccessKey, sessionToken } = req.body ?? {};
    if ([name, accessKeyId, secretAccessKey].some((value) => typeof value !== "string" || !value.trim())) {
        return res.status(400).json({ success: false, message: "Name, access key ID, and secret access key are required." });
    }
    if (!AWS_ENCRYPTION_KEY) return res.status(500).json({ success: false, message: "AWS credential encryption is not configured." });

    const hasExistingConnection = await prisma.awsConnection.count({ where: { userId } });

    const connection = await prisma.awsConnection.create({
        data: {
            userId,
            name: name.trim(),
            region: typeof region === "string" && region.trim() ? region.trim() : AWS_REGION,
            accessKeyIdEncrypted: encryptAwsSecret(accessKeyId, AWS_ENCRYPTION_KEY),
            secretAccessKeyEncrypted: encryptAwsSecret(secretAccessKey, AWS_ENCRYPTION_KEY),
            sessionTokenEncrypted: typeof sessionToken === "string" && sessionToken ? encryptAwsSecret(sessionToken, AWS_ENCRYPTION_KEY) : null,
            isActive: hasExistingConnection === 0,
        },
        select: { id: true, name: true, region: true, isActive: true, encryptionKeyVersion: true, createdAt: true, updatedAt: true },
    });
    return res.status(201).json({ success: true, message: "AWS connection saved successfully.", data: connection });
}

export async function listAwsConnections(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const connections = await prisma.awsConnection.findMany({
        where: { userId },
        select: { id: true, name: true, region: true, isActive: true, encryptionKeyVersion: true, createdAt: true, updatedAt: true },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    return res.json({ success: true, message: "AWS connections fetched successfully.", data: connections });
}

export async function getAwsResourceCatalog(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const connection = await prisma.awsConnection.findFirst({ where: { id: param(req, "connectionId"), userId } });
    if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
    if (!AWS_ENCRYPTION_KEY) return res.status(500).json({ success: false, message: "AWS credential encryption is not configured." });
    try {
        const credentials = {
            accessKeyId: decryptAwsSecret(connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
        const catalog = await awsResourceManager.getCatalog(credentials, connection.region, connection.id);
        return res.json({ success: true, message: "AWS resource catalog fetched successfully.", data: catalog });
    } catch (error) {
        return res.status(502).json({ success: false, message: "AWS resource catalog could not be fetched.", error: errorMessage(error) });
    }
}

export async function setActiveAwsConnection(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const connectionId = param(req, "connectionId");
    const connection = await prisma.awsConnection.findFirst({ where: { id: connectionId, userId }, select: { id: true } });
    if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
    await prisma.$transaction([
        prisma.awsConnection.updateMany({ where: { userId }, data: { isActive: false } }),
        prisma.awsConnection.update({ where: { id: connection.id }, data: { isActive: true } }),
    ]);
    return res.json({ success: true, message: "Active AWS connection updated successfully." });
}

export async function deleteAwsConnection(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    try {
        const connection = await prisma.awsConnection.findFirst({ where: { id: param(req, "connectionId"), userId }, select: { id: true, region: true, isActive: true } });
        if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
        await prisma.$transaction(async (tx) => {
            await tx.awsConnection.delete({ where: { id: connection.id } });
            if (connection.isActive) {
                const next = await tx.awsConnection.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true } });
                if (next) await tx.awsConnection.update({ where: { id: next.id }, data: { isActive: true } });
            }
        });
        awsResourceManager.invalidateCatalog(connection.id, connection.region);
        return res.json({ success: true, message: "AWS connection deleted successfully." });
    } catch (error) {
        return res.status(409).json({ success: false, message: "AWS connection is used by a resource or deployment.", error: errorMessage(error) });
    }
}

export async function deploySketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketchId = param(req, "sketchId");
    const connectionId = req.body?.connectionId;
    const sketch = await prisma.sketch.findFirst({
        where: { id: sketchId, userId },
        include: { nodes: true, edges: true, resources: true },
    });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (typeof connectionId !== "string") return res.status(400).json({ success: false, message: "connectionId is required." });
    const connection = await prisma.awsConnection.findFirst({ where: { id: connectionId, userId } });
    if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
    if (!sketch.nodes.length) return res.status(400).json({ success: false, message: "Sketch must contain at least one AWS node before publishing." });

    let graph;
    const requests = new Map<string, AwsResourceCreateRequest>();
    try {
        graph = createGraphPlan(sketch.nodes, sketch.edges);
        for (const node of sketch.nodes) {
            if (!isRecord(node.config)) throw new Error(`Node ${node.id} has an invalid AWS config.`);
            requests.set(node.id, buildResourceRequest(node.type, node.config));
        }
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    if (!AWS_ENCRYPTION_KEY) return res.status(500).json({ success: false, message: "AWS credential encryption is not configured." });

    let credentials;
    try {
        credentials = {
            accessKeyId: decryptAwsSecret(connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
    } catch (error) {
        return res.status(500).json({ success: false, message: "AWS credentials could not be decrypted.", error: errorMessage(error) });
    }

    const resourcesByNodeId = new Map<string, typeof sketch.resources[number]>();
    for (const resource of sketch.resources) {
        if (resource.nodeId) resourcesByNodeId.set(resource.nodeId, resource);
    }
    const outputsByNode = new Map<string, Record<string, unknown>>();
    for (const nodeId of graph.order) {
        const resource = resourcesByNodeId.get(nodeId);
        if (!resource) continue;
        if (resource.status === AwsResourceStatus.PROVISIONING || resource.status === AwsResourceStatus.DELETING) {
            return res.status(409).json({ success: false, message: `Resource for node ${nodeId} already has an active operation.` });
        }
        if (resource.status === AwsResourceStatus.RUNNING) {
            if (resource.connectionId !== connection.id) {
                return res.status(409).json({ success: false, message: `Node ${nodeId} is already deployed with a different AWS connection.` });
            }
            if (!isRecord(resource.actualState)) {
                return res.status(409).json({ success: false, message: `Node ${nodeId} has no stored AWS output for dependency resolution.` });
            }
            outputsByNode.set(nodeId, resource.actualState);
        } else if (resource.externalId && resource.status !== AwsResourceStatus.TERMINATED) {
            return res.status(409).json({ success: false, message: `Node ${nodeId} has an unresolved AWS resource. Delete it before publishing again.` });
        }
    }

    await prisma.sketch.update({ where: { id: sketch.id }, data: { connectionId } });

    const deployment = await prisma.deployment.create({
        data: {
            userId,
            sketchId,
            connectionId,
            request: jsonValue({ connectionId, nodeIds: graph.order, requests: graph.order.map((nodeId) => ({ nodeId, request: requests.get(nodeId) })) }),
        },
    });

    const outcomes: Array<Record<string, unknown>> = [];
    for (const nodeId of graph.order) {
        const existingResource = resourcesByNodeId.get(nodeId);
        if (existingResource?.status === AwsResourceStatus.RUNNING) {
            const baseRequest = requests.get(nodeId);
            if (!baseRequest || !existingResource.externalId) throw new Error(`Node ${nodeId} has no deployment request or external ID.`);
            const resolvedConfig = resolveConfigReferences(baseRequest.config, nodeId, graph.sourcesByTarget, outputsByNode);
            if (!isRecord(resolvedConfig)) throw new Error(`Resolved config for node ${nodeId} is invalid.`);
            const resourceRequest = buildResourceRequest(baseRequest.service, resolvedConfig);
            if (JSON.stringify(existingResource.desiredConfig) === JSON.stringify(resourceRequest.config)) {
                outcomes.push({ nodeId, status: "skipped", resourceId: existingResource.id, externalId: existingResource.externalId });
                continue;
            }
            if (!existingResource.managed) return res.status(409).json({ success: false, message: `Node ${nodeId} adopts an external resource and cannot update it.` });
            try {
                assertDeployedResourceUpdate(existingResource.desiredConfig, resourceRequest);
                const result = await awsResourceManager.updateResource(resourceRequest, existingResource.externalId, credentials, connection.region);
                awsResourceManager.invalidateCatalog(connection.id, connection.region);
                const updated = await prisma.awsResource.update({ where: { id: existingResource.id }, data: { desiredConfig: jsonValue(resourceRequest.config), actualState: jsonValue(result.data), lastError: null } });
                if (isRecord(result.data)) outputsByNode.set(nodeId, result.data);
                outcomes.push({ nodeId, status: "updated", resourceId: updated.id, result });
            } catch (error) {
                return res.status(409).json({ success: false, message: errorMessage(error) });
            }
            continue;
        }
        const baseRequest = requests.get(nodeId);
        if (!baseRequest) continue;
        let resourceRequest: AwsResourceCreateRequest;
        let resource;
        try {
            const resolvedConfig = resolveConfigReferences(baseRequest.config, nodeId, graph.sourcesByTarget, outputsByNode);
            if (!isRecord(resolvedConfig)) throw new Error(`Resolved config for node ${nodeId} is invalid.`);
            resourceRequest = buildResourceRequest(baseRequest.service, resolvedConfig);
            resource = await prisma.awsResource.upsert({
                where: { nodeId },
                create: {
                    userId,
                    sketchId,
                    nodeId,
                    connectionId,
                    service: resourceRequest.service,
                    name: null,
                    region: connection.region,
                    status: AwsResourceStatus.PROVISIONING,
                    managed: !isAdoptedResource(resourceRequest),
                    desiredConfig: jsonValue(resourceRequest.config),
                },
                update: {
                    connectionId,
                    service: resourceRequest.service,
                    region: connection.region,
                    externalId: null,
                    name: null,
                    status: AwsResourceStatus.PROVISIONING,
                    managed: !isAdoptedResource(resourceRequest),
                    desiredConfig: jsonValue(resourceRequest.config),
                    actualState: Prisma.JsonNull,
                    lastError: null,
                },
            });
            const result = await awsResourceManager.createResource(resourceRequest, credentials, connection.region);
            awsResourceManager.invalidateCatalog(connection.id, connection.region);
            const updatedResource = await prisma.awsResource.update({
                where: { id: resource.id },
                data: {
                    externalId: result.externalId,
                    name: result.name,
                    status: AwsResourceStatus.RUNNING,
                    actualState: jsonValue(result.data),
                    lastError: null,
                },
            });
            if (!isRecord(result.data)) throw new Error(`AWS did not return usable output for node ${nodeId}.`);
            outputsByNode.set(nodeId, result.data);
            outcomes.push({ nodeId, status: "created", resourceId: updatedResource.id, result });
        } catch (error) {
            const message = errorMessage(error);
            if (resource) {
                await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.FAILED, lastError: message } });
            }
            outcomes.push({ nodeId, status: "failed", error: message });
            await prisma.deployment.update({
                where: { id: deployment.id },
                data: { status: DeploymentStatus.FAILED, response: jsonValue({ order: graph.order, outcomes }), errorMessage: message, finishedAt: new Date() },
            });
            return res.status(502).json({ success: false, message: "AWS publish failed.", error: message, data: { deploymentId: deployment.id, outcomes } });
        }
    }
    await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue({ order: graph.order, outcomes }), finishedAt: new Date() },
    });
    await prisma.sketch.update({ where: { id: sketch.id }, data: { status: SketchStatus.ACTIVE } });
    return res.status(201).json({ success: true, message: "AWS resources published successfully.", data: { deploymentId: deployment.id, outcomes } });
}

export async function deleteAwsResource(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const resource = await prisma.awsResource.findFirst({
        where: { id: param(req, "resourceId"), sketchId: param(req, "sketchId"), userId },
        include: { connection: true },
    });
    if (!resource) return res.status(404).json({ success: false, message: "AWS resource not found." });
    const outcome = await deleteResourceRecord(resource, userId);
    if (outcome.status === "failed") return res.status(502).json({ success: false, message: `${resource.service} resource deletion failed.`, error: outcome.error });
    return res.json({ success: true, message: outcome.status === "already_deleted" ? "AWS resource was already deleted." : `${resource.service} resource deleted successfully.`, data: outcome });
}

export async function refreshSketchResources(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketchId = param(req, "sketchId");
    const sketch = await prisma.sketch.findFirst({ where: { id: sketchId, userId }, select: { id: true } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    const resources = await prisma.awsResource.findMany({
        where: { sketchId: sketch.id, userId, status: { not: AwsResourceStatus.TERMINATED } },
        include: { connection: true },
        orderBy: { updatedAt: "asc" },
    });
    if (!resources.length) return res.json({ success: true, message: "No deployed AWS resources require a status refresh.", data: { outcomes: [] } });

    const outcomes: Array<Awaited<ReturnType<typeof refreshResourceRecord>>> = [];
    for (let index = 0; index < resources.length; index += AWS_RESOURCE_STATUS_REFRESH_CONCURRENCY) {
        outcomes.push(...await Promise.all(resources.slice(index, index + AWS_RESOURCE_STATUS_REFRESH_CONCURRENCY).map((resource) => refreshResourceRecord(resource))));
    }
    return res.json({ success: true, message: "AWS resource statuses refreshed successfully.", data: { outcomes } });
}
