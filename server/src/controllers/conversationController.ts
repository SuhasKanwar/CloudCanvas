import type { Request, Response } from "express";

import { Prisma } from "../generated/prisma/client.js";
import { ChatMessageType, ChatRole } from "../generated/prisma/enums.js";
import { AWS_ENCRYPTION_KEY } from "../lib/config.js";
import prisma from "../lib/prisma.js";
import { AIServiceError, aiService, type AiChatMessage } from "../services/aiService.js";
import { awsResourceManager, decryptAwsSecret } from "../services/aws/index.js";
import type { ApiResponse } from "../types/response.js";

const MAX_MESSAGE_LENGTH = 8_000;

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function jsonValue(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function aiErrorStatus(error: AIServiceError) {
    if (error.code === "invalid_request") return 400;
    if (error.code === "timeout") return 504;
    if (error.code === "unavailable") return 503;
    return 502;
}

async function findOwnedSketch(req: Request) {
    if (!req.userId) return null;
    const sketchId = typeof req.params.sketchId === "string" ? req.params.sketchId : "";
    return prisma.sketch.findFirst({
        where: { id: sketchId, userId: req.userId },
        select: { id: true, userId: true, connectionId: true },
    });
}

async function getConversation(sketchId: string, userId: string) {
    return prisma.sketchConversation.upsert({
        where: { sketchId },
        create: { sketchId, userId },
        update: {},
    });
}

function toAiHistory(messages: readonly { role: ChatRole; content: string }[]): AiChatMessage[] {
    return messages.map((message) => ({
        role: message.role === ChatRole.USER ? "user" : "assistant",
        content: message.content,
    }));
}

async function awsCatalogContext(userId: string, connectionId: string | null) {
    if (!AWS_ENCRYPTION_KEY) return "";
    const connection = await prisma.awsConnection.findFirst({
        where: connectionId ? { id: connectionId, userId } : { userId, isActive: true },
        select: { id: true, region: true, accessKeyIdEncrypted: true, secretAccessKeyEncrypted: true, sessionTokenEncrypted: true },
    });
    if (!connection) return "";
    try {
        const credentials = {
            accessKeyId: decryptAwsSecret(connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
            secretAccessKey: decryptAwsSecret(connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
            ...(connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
        };
        const catalog = await awsResourceManager.getCatalog(credentials, connection.region, connection.id);
        return JSON.stringify({
            region: connection.region,
            vpcs: catalog.vpcs.slice(0, 25),
            subnets: catalog.subnets.slice(0, 40),
            securityGroups: catalog.securityGroups.slice(0, 40),
            keyPairs: catalog.keyPairs.slice(0, 40).map(({ name }) => ({ name })),
            images: catalog.images.slice(0, 24).map(({ id, category, title, architecture, rootDeviceName }) => ({ id, category, title, architecture, rootDeviceName })),
            instanceTypes: catalog.instanceTypes.slice(0, 80),
            instanceProfiles: catalog.instanceProfiles.slice(0, 25),
            launchTemplates: catalog.launchTemplates.slice(0, 25),
        });
    } catch {
        return "";
    }
}

export async function getSketchConversation(req: Request, res: Response<ApiResponse>) {
    const sketch = await findOwnedSketch(req);
    if (!sketch) return res.status(req.userId ? 404 : 401).json({ success: false, message: req.userId ? "Sketch not found." : "Authentication token is missing." });

    const conversation = await getConversation(sketch.id, sketch.userId);
    const messages = await prisma.chatMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return res.json({ success: true, message: "Conversation loaded.", data: { conversation, messages } });
}

export async function sendSketchConversationMessage(req: Request, res: Response<ApiResponse>) {
    const sketch = await findOwnedSketch(req);
    if (!sketch) return res.status(req.userId ? 404 : 401).json({ success: false, message: req.userId ? "Sketch not found." : "Authentication token is missing." });

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ success: false, message: "A chat message is required." });
    if (content.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ success: false, message: `Chat messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });

    const { conversation, history, userMessage } = await prisma.$transaction(async (tx) => {
        const conversation = await tx.sketchConversation.upsert({
            where: { sketchId: sketch.id },
            create: { sketchId: sketch.id, userId: sketch.userId },
            update: {},
        });
        const userMessage = await tx.chatMessage.create({
            data: { conversationId: conversation.id, role: ChatRole.USER, content },
        });
        const messages = await tx.chatMessage.findMany({
            where: { conversationId: conversation.id, id: { not: userMessage.id } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { role: true, content: true },
        });
        return { conversation, history: toAiHistory(messages), userMessage };
    });

    try {
        const context = await awsCatalogContext(sketch.userId, sketch.connectionId);
        const response = await aiService.query({ query: content, session_history: history, context });
        const assistantMessage = await prisma.chatMessage.create({
            data: response.data.type === "build"
                ? { conversationId: conversation.id, role: ChatRole.ASSISTANT, type: ChatMessageType.BUILD, content: response.data.message, build: jsonValue(response.data.build) }
                : { conversationId: conversation.id, role: ChatRole.ASSISTANT, type: ChatMessageType.TEXT, content: response.data.message },
        });
        return res.status(201).json({
            success: true,
            message: response.message,
            data: { conversationId: conversation.id, userMessage, assistantMessage },
        });
    } catch (error) {
        if (error instanceof AIServiceError) {
            return res.status(aiErrorStatus(error)).json({ success: false, message: error.message, data: { conversationId: conversation.id, userMessageId: userMessage.id } });
        }
        return res.status(502).json({ success: false, message: "AI assistant failed to respond.", error: errorMessage(error), data: { conversationId: conversation.id, userMessageId: userMessage.id } });
    }
}
