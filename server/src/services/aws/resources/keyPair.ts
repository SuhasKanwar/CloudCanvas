import {
    DeleteKeyPairCommand,
    ImportKeyPairCommand,
    type DeleteKeyPairCommandOutput,
    type ImportKeyPairCommandOutput,
} from "@aws-sdk/client-ec2";
import { Buffer } from "node:buffer";

export type KeyPairRequest =
    | { mode: "existing"; keyName: string }
    | { mode?: "import"; keyName: string; publicKeyMaterial: string };

export type KeyPairResult = { region: string; keyName: string; keyPairId?: string };
export type KeyPairSender = {
    import: (command: ImportKeyPairCommand) => Promise<ImportKeyPairCommandOutput>;
    delete: (command: DeleteKeyPairCommand) => Promise<DeleteKeyPairCommandOutput>;
};

export class KeyPairService {
    constructor(private readonly send: KeyPairSender, private readonly region: string) {}

    async create(request: KeyPairRequest): Promise<KeyPairResult> {
        if (request.mode === "existing") return { region: this.region, keyName: request.keyName };
        if (!request.keyName || !request.publicKeyMaterial) throw new Error("Key pair name and public key material are required.");
        const result = await this.send.import(new ImportKeyPairCommand({
            KeyName: request.keyName,
            PublicKeyMaterial: Buffer.from(request.publicKeyMaterial),
        }));
        return {
            region: this.region,
            keyName: request.keyName,
            ...(result.KeyPairId && { keyPairId: result.KeyPairId }),
        };
    }

    async delete(keyName: string): Promise<KeyPairResult> {
        await this.send.delete(new DeleteKeyPairCommand({ KeyName: keyName }));
        return { region: this.region, keyName };
    }
}
