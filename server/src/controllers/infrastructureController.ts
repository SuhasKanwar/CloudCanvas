import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { AwsResourceStatus, DeploymentStatus, SketchStatus } from "../generated/prisma/enums.js";
import prisma from "../lib/prisma.js";
import { AWS_ENCRYPTION_KEY, AWS_REGION } from "../lib/config.js";
import {
    awsResourceManager,
    decryptAwsSecret,
    encryptAwsSecret,
    type Ec2InstanceRequest,
} from "../services/aws/index.js";
import type { ApiResponse } from "../types/response.js";

const sketchInclude = {
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
    const result = await prisma.sketch.deleteMany({ where: { id: param(req, "sketchId"), userId } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch not found." });
    return res.json({ success: true, message: "Sketch deleted successfully." });
}

export async function createSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const sketch = await prisma.sketch.findFirst({ where: { id: param(req, "sketchId"), userId }, select: { id: true } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (typeof req.body?.type !== "string" || !req.body.type.trim() || req.body.config === undefined) {
        return res.status(400).json({ success: false, message: "Node type and config are required." });
    }

    const node = await prisma.sketchNode.create({
        data: {
            sketchId: sketch.id,
            type: req.body.type.trim(),
            label: typeof req.body.label === "string" ? req.body.label : null,
            positionX: typeof req.body.positionX === "number" ? req.body.positionX : 0,
            positionY: typeof req.body.positionY === "number" ? req.body.positionY : 0,
            config: jsonValue(req.body.config),
        },
    });
    return res.status(201).json({ success: true, message: "Sketch node created successfully.", data: node });
}

export async function updateSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const node = await prisma.sketchNode.findFirst({ where: { id: param(req, "nodeId"), sketch: { id: param(req, "sketchId"), userId } } });
    if (!node) return res.status(404).json({ success: false, message: "Sketch node not found." });
    const updated = await prisma.sketchNode.update({
        where: { id: node.id },
        data: {
            ...(typeof req.body?.type === "string" && { type: req.body.type.trim() }),
            ...(typeof req.body?.label === "string" && { label: req.body.label }),
            ...(typeof req.body?.positionX === "number" && { positionX: req.body.positionX }),
            ...(typeof req.body?.positionY === "number" && { positionY: req.body.positionY }),
            ...(req.body?.config !== undefined && { config: jsonValue(req.body.config) }),
        },
    });
    return res.json({ success: true, message: "Sketch node updated successfully.", data: updated });
}

export async function deleteSketchNode(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const result = await prisma.sketchNode.deleteMany({ where: { id: param(req, "nodeId"), sketch: { id: param(req, "sketchId"), userId } } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch node not found." });
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
    const nodes = await prisma.sketchNode.count({ where: { id: { in: [sourceNodeId, targetNodeId] }, sketch: { id: sketchId, userId } } });
    if (nodes !== 2) return res.status(400).json({ success: false, message: "Both edge nodes must belong to the sketch." });
    const edge = await prisma.sketchEdge.create({
        data: {
            sketchId,
            sourceNodeId,
            targetNodeId,
            sourceHandle: typeof req.body.sourceHandle === "string" ? req.body.sourceHandle : null,
            targetHandle: typeof req.body.targetHandle === "string" ? req.body.targetHandle : null,
        },
    });
    return res.status(201).json({ success: true, message: "Sketch edge created successfully.", data: edge });
}

export async function deleteSketchEdge(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const result = await prisma.sketchEdge.deleteMany({ where: { id: param(req, "edgeId"), sketch: { id: param(req, "sketchId"), userId } } });
    if (!result.count) return res.status(404).json({ success: false, message: "Sketch edge not found." });
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

    const connection = await prisma.awsConnection.create({
        data: {
            userId,
            name: name.trim(),
            region: typeof region === "string" && region.trim() ? region.trim() : AWS_REGION,
            accessKeyIdEncrypted: encryptAwsSecret(accessKeyId, AWS_ENCRYPTION_KEY),
            secretAccessKeyEncrypted: encryptAwsSecret(secretAccessKey, AWS_ENCRYPTION_KEY),
            sessionTokenEncrypted: typeof sessionToken === "string" && sessionToken ? encryptAwsSecret(sessionToken, AWS_ENCRYPTION_KEY) : null,
        },
        select: { id: true, name: true, region: true, encryptionKeyVersion: true, createdAt: true, updatedAt: true },
    });
    return res.status(201).json({ success: true, message: "AWS connection saved successfully.", data: connection });
}

export async function listAwsConnections(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const connections = await prisma.awsConnection.findMany({
        where: { userId },
        select: { id: true, name: true, region: true, encryptionKeyVersion: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
    });
    return res.json({ success: true, message: "AWS connections fetched successfully.", data: connections });
}

export async function deleteAwsConnection(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    try {
        const result = await prisma.awsConnection.deleteMany({ where: { id: param(req, "connectionId"), userId } });
        if (!result.count) return res.status(404).json({ success: false, message: "AWS connection not found." });
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
    const sketch = await prisma.sketch.findFirst({ where: { id: sketchId, userId }, select: { id: true, nodes: true } });
    if (!sketch) return res.status(404).json({ success: false, message: "Sketch not found." });
    if (typeof connectionId !== "string") return res.status(400).json({ success: false, message: "connectionId is required." });
    const connection = await prisma.awsConnection.findFirst({ where: { id: connectionId, userId } });
    if (!connection) return res.status(404).json({ success: false, message: "AWS connection not found." });
    const node = sketch.nodes[0];
    if (!node || sketch.nodes.length !== 1 || node.type !== "EC2_INSTANCE") {
        return res.status(400).json({ success: false, message: "v1 deployment supports exactly one EC2_INSTANCE node." });
    }

    const config = node.config as Record<string, unknown>;
    if (!config || typeof config.imageId !== "string" || !config.imageId) {
        return res.status(400).json({ success: false, message: "EC2 node config must include imageId." });
    }
    if (!AWS_ENCRYPTION_KEY) return res.status(500).json({ success: false, message: "AWS credential encryption is not configured." });

    const request: Ec2InstanceRequest = {
        imageId: config.imageId,
        ...(typeof config.instanceType === "string" && { instanceType: config.instanceType }),
        ...(typeof config.keyName === "string" && { keyName: config.keyName }),
        ...(Array.isArray(config.securityGroupIds) && { securityGroupIds: config.securityGroupIds.filter((value): value is string => typeof value === "string") }),
        ...(typeof config.subnetId === "string" && { subnetId: config.subnetId }),
        ...(typeof config.name === "string" && { name: config.name }),
        ...(typeof config.userData === "string" && { userData: config.userData }),
        ...(config.dryRun === true && { dryRun: true }),
    };
    const deployment = await prisma.deployment.create({
        data: { userId, sketchId, connectionId, request: jsonValue({ connectionId, nodeId: node.id, request }) },
    });
    const resource = await prisma.awsResource.upsert({
        where: { nodeId: node.id },
        create: { userId, sketchId, nodeId: node.id, connectionId, service: "EC2_INSTANCE", name: request.name ?? null, region: connection.region, status: AwsResourceStatus.PROVISIONING, desiredConfig: jsonValue(request) },
        update: { connectionId, name: request.name ?? null, region: connection.region, status: AwsResourceStatus.PROVISIONING, desiredConfig: jsonValue(request), lastError: null },
    });

    try {
        const credentials = {
            accessKeyId: decryptAwsSecret(connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
        const result = await awsResourceManager.createEc2Instance(request, credentials, connection.region);
        const instanceId = result.instances[0]?.instanceId ?? null;
        const updatedResource = await prisma.awsResource.update({
            where: { id: resource.id },
            data: { externalId: instanceId, status: AwsResourceStatus.RUNNING, actualState: jsonValue(result), lastError: null },
        });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue(result), finishedAt: new Date() } });
        return res.status(201).json({ success: true, message: "EC2 deployment completed successfully.", data: { deploymentId: deployment.id, resource: updatedResource, result } });
    } catch (error) {
        const message = errorMessage(error);
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.FAILED, lastError: message } });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.FAILED, errorMessage: message, finishedAt: new Date() } });
        return res.status(502).json({ success: false, message: "EC2 deployment failed.", error: message, data: { deploymentId: deployment.id } });
    }
}

export async function deleteAwsResource(req: Request, res: Response<ApiResponse>) {
    const userId = ownedUser(req, res);
    if (!userId) return;
    const resource = await prisma.awsResource.findFirst({
        where: { id: param(req, "resourceId"), sketchId: param(req, "sketchId"), userId },
        include: { connection: true },
    });
    if (!resource) return res.status(404).json({ success: false, message: "AWS resource not found." });
    if (resource.service !== "EC2_INSTANCE") {
        return res.status(400).json({ success: false, message: "Only EC2 resource deletion is supported right now." });
    }
    if (resource.status === AwsResourceStatus.TERMINATED) {
        return res.json({ success: true, message: "EC2 resource is already terminated.", data: resource });
    }
    if (!resource.externalId) {
        return res.status(409).json({ success: false, message: "EC2 resource has no AWS instance ID to terminate." });
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
        const result = await awsResourceManager.terminateEc2Instances([resource.externalId], credentials, resource.region);
        const updatedResource = await prisma.awsResource.update({
            where: { id: resource.id },
            data: { status: AwsResourceStatus.TERMINATED, actualState: jsonValue(result), lastError: null },
        });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.SUCCEEDED, response: jsonValue(result), finishedAt: new Date() } });
        return res.json({ success: true, message: "EC2 resource terminated successfully.", data: { deploymentId: deployment.id, resource: updatedResource, result } });
    } catch (error) {
        const message = errorMessage(error);
        await prisma.awsResource.update({ where: { id: resource.id }, data: { status: AwsResourceStatus.FAILED, lastError: message } });
        await prisma.deployment.update({ where: { id: deployment.id }, data: { status: DeploymentStatus.FAILED, errorMessage: message, finishedAt: new Date() } });
        return res.status(502).json({ success: false, message: "EC2 resource termination failed.", error: message, data: { deploymentId: deployment.id } });
    }
}
