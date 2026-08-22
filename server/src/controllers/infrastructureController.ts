import type { Request, Response } from "express";
import type { AttributeDefinition, BillingMode, KeySchemaElement } from "@aws-sdk/client-dynamodb";
import type { Runtime } from "@aws-sdk/client-lambda";
import { Prisma } from "../generated/prisma/client.js";
import { AwsResourceStatus, DeploymentStatus, SketchStatus } from "../generated/prisma/enums.js";
import prisma from "../lib/prisma.js";
import { AWS_ENCRYPTION_KEY, AWS_REGION } from "../lib/config.js";
import {
    awsResourceManager,
    decryptAwsSecret,
    encryptAwsSecret,
    AwsService,
    type AwsResourceCreateRequest,
} from "../services/aws/index.js";
import { createGraphPlan, remapConfigReferences, resolveConfigReferences } from "../services/aws/graph.js";
import { AIServiceError, aiService, type AiChatMessage } from "../services/aiService.js";
import { validateGraphDefinition } from "../services/graphParser.js";
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

function param(req: Request, name: string) {
    const value = req.params[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildResourceRequest(type: string, config: Record<string, unknown>): AwsResourceCreateRequest {
    if (type === "EC2_INSTANCE") {
        if (typeof config.imageId !== "string" || !config.imageId) throw new Error("EC2 node config must include imageId.");
        return {
            service: AwsService.EC2_INSTANCE,
            config: {
                imageId: config.imageId,
                ...(typeof config.instanceType === "string" && { instanceType: config.instanceType }),
                ...(typeof config.keyName === "string" && { keyName: config.keyName }),
                ...(Array.isArray(config.securityGroupIds) && { securityGroupIds: config.securityGroupIds.filter((value): value is string => typeof value === "string") }),
                ...(typeof config.subnetId === "string" && { subnetId: config.subnetId }),
                ...(typeof config.name === "string" && { name: config.name }),
                ...(typeof config.userData === "string" && { userData: config.userData }),
                ...(config.dryRun === true && { dryRun: true }),
            },
        };
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
        return { service: AwsService.S3_BUCKET, config: { bucketName: config.bucketName } };
    }
    if (type === "IAM_ROLE") {
        if (typeof config.roleName !== "string" || !config.roleName) throw new Error("IAM node config must include roleName.");
        if (typeof config.assumeRolePolicyDocument !== "string" || !config.assumeRolePolicyDocument) {
            throw new Error("IAM node config must include assumeRolePolicyDocument.");
        }
        return {
            service: AwsService.IAM_ROLE,
            config: {
                roleName: config.roleName,
                assumeRolePolicyDocument: config.assumeRolePolicyDocument,
                ...(typeof config.description === "string" && { description: config.description }),
                ...(typeof config.path === "string" && { path: config.path }),
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
    throw new Error("Supported services are EC2_INSTANCE, ECR_REPOSITORY, S3_BUCKET, IAM_ROLE, LAMBDA_FUNCTION, DYNAMODB_TABLE, SQS_QUEUE, and SNS_TOPIC.");
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

function prepareGraph(graph: GraphDefinition) {
    const nodes = graph.nodes.map((node) => {
        if (!isRecord(node.config)) throw new Error(`Invalid config for graph node ${node.id}.`);
        const request = buildResourceRequest(node.type, node.config);
        return {
            sourceId: node.id,
            type: request.service,
            label: node.label ?? null,
            positionX: node.positionX,
            positionY: node.positionY,
            config: request.config,
        };
    });
    return nodes;
}

type PreparedGraphNode = ReturnType<typeof prepareGraph>[number];

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
    const prepared = prepareGraph(graph);
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
        const prepared = prepareGraph(req.graph);
        const sketch = await prisma.$transaction(async (tx) => {
            await tx.sketchEdge.deleteMany({ where: { sketchId } });
            await tx.sketchNode.deleteMany({ where: { sketchId } });
            await tx.sketch.update({
                where: { id: sketchId },
                data: { name: req.graph!.name.trim(), description: req.graph!.description ?? null, version: { increment: 1 } },
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
            ...(typeof req.body?.name === "string" && { name: req.body.name.trim() }),
            ...(typeof req.body?.description === "string" && { description: req.body.description }),
            ...(status !== undefined && { status }),
            version: { increment: 1 },
        },
    });
    return res.json({ success: true, message: "Sketch updated successfully.", data: sketch });
}

export async function deleteSketch(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketchId = param(req, "sketchId");
    const resources = await prisma.awsResource.findMany({ where: { sketchId, userId }, select: { id: true, externalId: true, status: true } });
    const activeResource = resources.find((resource) => (
        resource.status === AwsResourceStatus.RUNNING
        || resource.status === AwsResourceStatus.PROVISIONING
        || resource.status === AwsResourceStatus.DELETING
        || (resource.status === AwsResourceStatus.FAILED && resource.externalId)
    ));
    if (activeResource) {
        return res.status(409).json({ success: false, message: "Delete deployed AWS resources before deleting this sketch." });
    }
    const result = await prisma.sketch.deleteMany({ where: { id: sketchId, userId } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch not found." });
    return res.json({ success: true, message: "Sketch deleted successfully." });
}

export async function createSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketch = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId }, select: { id: true } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (typeof req.body?.type !== "string" || !req.body.type.trim() || !isRecord(req.body.config)) {
        return res.status(400).json({ success: false, message: "Node type and config are required." });
    }
    let resourceRequest: AwsResourceCreateRequest;
    try {
        resourceRequest = buildResourceRequest(req.body.type.trim(), req.body.config);
    } catch (error) {
        return res.status(400).json({ success: false, message: errorMessage(error) });
    }

    const node = await prisma.sketchNode.create({
        data: {
            sketchId: sketch.id,
            type: resourceRequest.service,
            label: typeof req.body.label === "string" ? req.body.label : null,
            positionX: typeof req.body.positionX === "number" ? req.body.positionX : 0,
            positionY: typeof req.body.positionY === "number" ? req.body.positionY : 0,
            config: jsonValue(resourceRequest.config),
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
        const connection = await prisma.awsConnection.findFirst({ where: { id: param(req, "connectionId"), userId }, select: { id: true, isActive: true } });
        if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
        await prisma.$transaction(async (tx) => {
            await tx.awsConnection.delete({ where: { id: connection.id } });
            if (connection.isActive) {
                const next = await tx.awsConnection.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true } });
                if (next) await tx.awsConnection.update({ where: { id: next.id }, data: { isActive: true } });
            }
        });
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
            outcomes.push({ nodeId, status: "skipped", resourceId: existingResource.id, externalId: existingResource.externalId });
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
                    desiredConfig: jsonValue(resourceRequest.config),
                },
                update: {
                    connectionId,
                    service: resourceRequest.service,
                    region: connection.region,
                    externalId: null,
                    name: null,
                    status: AwsResourceStatus.PROVISIONING,
                    desiredConfig: jsonValue(resourceRequest.config),
                    actualState: Prisma.JsonNull,
                    lastError: null,
                },
            });
            const result = await awsResourceManager.createResource(resourceRequest, credentials, connection.region);
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
    if (!isAwsService(resource.service)) {
        return res.status(400).json({ success: false, message: "This AWS resource type is not supported yet." });
    }
    if (resource.status === AwsResourceStatus.TERMINATED) {
        return res.json({ success: true, message: "AWS resource is already terminated.", data: resource });
    }
    if (!resource.externalId) {
        if (resource.status === AwsResourceStatus.FAILED) {
            const updatedResource = await prisma.awsResource.update({
                where: { id: resource.id },
                data: { status: AwsResourceStatus.TERMINATED, lastError: null },
            });
            return res.json({ success: true, message: "Failed AWS resource record cleared.", data: updatedResource });
        }
        return res.status(409).json({ success: false, message: "AWS resource has no external ID to delete." });
    }
    if (!AWS_ENCRYPTION_KEY) {
        return res.status(500).json({ success: false, message: "AWS credential encryption is not configured." });
    }

    const deployment = await prisma.deployment.create({
        data: {
            userId,
            sketchId: resource.sketchId,
            connectionId: resource.connectionId,
            request: jsonValue({ operation: "terminate", resourceId: resource.id, instanceId: resource.externalId }),
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
        const updatedResource = await prisma.awsResource.update({
            where: { id: resource.id },
            data: { status: AwsResourceStatus.TERMINATED, actualState: jsonValue(result.data), lastError: null },
        });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue(result.data), finishedAt: new Date() } });
        return res.json({ success: true, message: `${resource.service} resource deleted successfully.`, data: { deploymentId: deployment.id, resource: updatedResource, result } });
    } catch (error) {
        const message = errorMessage(error);
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.FAILED, lastError: message } });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.FAILED, errorMessage: message, finishedAt: new Date() } });
        return res.status(502).json({ success: false, message: `${resource.service} resource deletion failed.`, error: message, data: { deploymentId: deployment.id } });
    }
}
