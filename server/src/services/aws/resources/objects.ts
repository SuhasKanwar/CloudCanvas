import { S3Client, DeleteObjectsCommand, GetBucketCorsCommand, ListObjectsV2Command, PutBucketCorsCommand, PutObjectCommand, type CORSRule } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function objectKey(value: unknown, folder = false): string {
    if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)
        || value.split("/").some((part, index, parts) => part === "." || part === ".." || (!part && index < parts.length - 1))
        || (folder && !value.endsWith("/")) || (!folder && value.endsWith("/")) || Buffer.byteLength(value) > 1024) {
        throw new Error("Invalid S3 object path.");
    }
    return value;
}

export function objectPrefix(value: unknown): string {
    if (value === "" || value == null) return "";
    return objectKey(value, true);
}

export class BucketObjects {
    constructor(private readonly client: S3Client, private readonly bucket: string) {}

    async list(prefix: string, continuationToken?: string) {
        const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, Delimiter: "/", MaxKeys: 100, ContinuationToken: continuationToken }));
        return { folders: (result.CommonPrefixes ?? []).flatMap((entry) => entry.Prefix && entry.Prefix !== prefix ? [entry.Prefix] : []),
            files: (result.Contents ?? []).flatMap((entry) => entry.Key && entry.Key !== prefix ? [{ key: entry.Key, size: entry.Size ?? 0, lastModified: entry.LastModified?.toISOString() }] : []),
            nextToken: result.NextContinuationToken ?? null };
    }

    async createFolder(prefix: string) {
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: prefix, Body: "" }));
    }

    async allowBrowserUpload(origin: string) {
        let existing: CORSRule[] = [];
        try {
            existing = (await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket }))).CORSRules ?? [];
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "NoSuchCORSConfiguration") throw error;
        }
        if (existing.some((rule) => rule.AllowedOrigins?.includes(origin) && rule.AllowedMethods?.includes("POST"))) return;
        await this.client.send(new PutBucketCorsCommand({ Bucket: this.bucket, CORSConfiguration: { CORSRules: [
            ...existing,
            { AllowedOrigins: [origin], AllowedMethods: ["POST"], AllowedHeaders: ["*"], MaxAgeSeconds: 300 },
        ] } }));
    }

    async uploadForm(key: string, contentType: string) {
        return createPresignedPost(this.client, { Bucket: this.bucket, Key: key, Expires: 600,
            Fields: { "Content-Type": contentType },
            Conditions: [["content-length-range", 0, MAX_UPLOAD_BYTES], ["eq", "$Content-Type", contentType]],
        });
    }

    async delete(key: string, folder: boolean) {
        if (!folder) {
            const result = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: key }] } }));
            if (result.Errors?.length) throw new Error("Could not delete the S3 object.");
            return;
        }
        while (true) {
            const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: key, MaxKeys: 1000 }));
            const objects = (page.Contents ?? []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []);
            if (!objects.length) break;
            if (objects.length) {
                const result = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
                if (result.Errors?.length) throw new Error(`Could not delete ${result.Errors.length} S3 objects.`);
            }
        }
    }
}
