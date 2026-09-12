import type { Request, Response } from "express";
import { S3Client } from "@aws-sdk/client-s3";
import prisma from "../lib/prisma.js";
import { ALLOWED_ORIGINS, AWS_ENCRYPTION_KEY } from "../lib/config.js";
import { decryptAwsSecret } from "../services/aws/crypto.js";
import { BucketObjects, MAX_UPLOAD_BYTES, objectKey, objectPrefix } from "../services/aws/resources/objects.js";
import type { ApiResponse } from "../types/response.js";

async function ownedBucket(req: Request, res: Response<ApiResponse>) {
    if (!req.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return null; }
    if (!AWS_ENCRYPTION_KEY) { res.status(500).json({ success: false, message: "AWS credential encryption is not configured." }); return null; }
    const resource = await prisma.awsResource.findFirst({ where: {
        id: String(req.params.resourceId), sketchId: String(req.params.sketchId), userId: req.userId,
        service: "S3_BUCKET", status: "RUNNING", managed: true,
    }, include: { connection: true } });
    if (!resource?.externalId) { res.status(404).json({ success: false, message: "Deployed S3 bucket not found for this sketch." }); return null; }
    const credentials = {
        accessKeyId: decryptAwsSecret(resource.connection.accessKeyIdEncrypted, AWS_ENCRYPTION_KEY),
        secretAccessKey: decryptAwsSecret(resource.connection.secretAccessKeyEncrypted, AWS_ENCRYPTION_KEY),
        ...(resource.connection.sessionTokenEncrypted && { sessionToken: decryptAwsSecret(resource.connection.sessionTokenEncrypted, AWS_ENCRYPTION_KEY) }),
    };
    return new BucketObjects(new S3Client({ region: resource.region, credentials }), resource.externalId);
}

export async function listBucketObjects(req: Request, res: Response<ApiResponse>) {
    try {
        const bucket = await ownedBucket(req, res);
        if (!bucket) return;
        const prefix = objectPrefix(req.query.prefix);
        const token = req.query.token;
        if (token != null && (typeof token !== "string" || token.length > 4096)) return res.status(400).json({ success: false, message: "Invalid continuation token." });
        return res.json({ success: true, message: "Bucket objects loaded.", data: await bucket.list(prefix, token) });
    } catch (error) { return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Could not list bucket objects." }); }
}

export async function createBucketFolder(req: Request, res: Response<ApiResponse>) {
    try {
        const bucket = await ownedBucket(req, res);
        if (!bucket) return;
        const key = objectPrefix(req.body?.key);
        if (!key) throw new Error("Folder path is required.");
        await bucket.createFolder(key);
        return res.status(201).json({ success: true, message: "Folder created." });
    } catch (error) { return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Could not create folder." }); }
}

export async function signBucketUpload(req: Request, res: Response<ApiResponse>) {
    try {
        const bucket = await ownedBucket(req, res);
        if (!bucket) return;
        const origin = req.get("Origin");
        if (!origin || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ success: false, message: "This origin cannot upload to the bucket." });
        const key = objectKey(req.body?.key);
        const size = req.body?.size;
        const contentType = req.body?.contentType;
        if (!Number.isSafeInteger(size) || size < 0 || size > MAX_UPLOAD_BYTES || typeof contentType !== "string" || !contentType || contentType.length > 200) {
            return res.status(400).json({ success: false, message: "Invalid file size or content type (100 MB maximum)." });
        }
        await bucket.allowBrowserUpload(origin);
        return res.json({ success: true, message: "Upload prepared.", data: await bucket.uploadForm(key, contentType) });
    } catch (error) { return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Could not prepare upload." }); }
}

export async function deleteBucketObject(req: Request, res: Response<ApiResponse>) {
    try {
        const bucket = await ownedBucket(req, res);
        if (!bucket) return;
        if (typeof req.body?.folder !== "boolean") throw new Error("Specify whether the path is a folder.");
        const key = req.body.folder ? objectKey(req.body.key, true) : objectKey(req.body.key);
        await bucket.delete(key, req.body.folder);
        return res.json({ success: true, message: req.body.folder ? "Folder deleted." : "File deleted." });
    } catch (error) { return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Could not delete bucket object." }); }
}
