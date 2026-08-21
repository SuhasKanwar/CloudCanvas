import api from "./api";

export type AwsConnection = {
    id: string;
    name: string;
    region: string;
    encryptionKeyVersion: number;
    createdAt: string;
    updatedAt: string;
};

export type CreateAwsConnection = {
    name: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
};

type ApiEnvelope<T> = { data: T };

function authorization(accessToken: string) {
    return { headers: { Authorization: `Bearer ${accessToken}` } };
}

export async function listAwsConnections(accessToken: string): Promise<AwsConnection[]> {
    const response = await api.get<ApiEnvelope<AwsConnection[]>>("/api/aws/connections", authorization(accessToken));
    return response.data.data;
}

export async function createAwsConnection(accessToken: string, connection: CreateAwsConnection): Promise<AwsConnection> {
    const response = await api.post<ApiEnvelope<AwsConnection>>("/api/aws/connections", connection, authorization(accessToken));
    return response.data.data;
}

export async function deleteAwsConnection(accessToken: string, connectionId: string): Promise<void> {
    await api.delete(`/api/aws/connections/${connectionId}`, authorization(accessToken));
}
