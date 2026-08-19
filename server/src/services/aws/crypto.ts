import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encryptionKey(secret: string) {
    if (!secret) throw new Error("AWS_ENCRYPTION_KEY is required.");
    return createHash("sha256").update(secret).digest();
}

export function encryptAwsSecret(value: string, secret: string) {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encryptionKey(secret), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptAwsSecret(value: string, secret: string) {
    const [iv, authTag, encrypted] = value.split(":");
    if (!iv || !authTag || !encrypted) throw new Error("Invalid encrypted AWS credential.");
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
