import api, { authenticatedRequest } from "./api";

export type AwsConnection = {
    id: string;
    name: string;
    region: string;
    isActive: boolean;
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

export type AwsResourceCatalog = {
    warnings: string[];
    vpcs: Array<{ id: string; name: string; cidrBlock: string }>;
    subnets: Array<{ id: string; name: string; vpcId: string; availabilityZone: string }>;
    securityGroups: Array<{ id: string; name: string; description: string; vpcId: string }>;
    instanceProfiles: Array<{ arn: string; name: string }>;
    launchTemplates: Array<{ id: string; name: string }>;
    instances: Array<{ id: string; name: string; state: string; instanceType: string; vpcId: string; subnetId: string }>;
    instanceTypes: string[];
    keyPairs: Array<{ id: string; name: string; fingerprint: string }>;
    images: Array<{ id: string; label: string; description: string; rootDeviceName: string }>;
};

type ApiEnvelope<T> = { data: T };

export async function listAwsConnections(accessToken: string): Promise<AwsConnection[]> {
    const response = await api.get<ApiEnvelope<AwsConnection[]>>("/api/aws/connections", authenticatedRequest(accessToken));
    return response.data.data;
}

export async function createAwsConnection(accessToken: string, connection: CreateAwsConnection): Promise<AwsConnection> {
    const response = await api.post<ApiEnvelope<AwsConnection>>("/api/aws/connections", connection, authenticatedRequest(accessToken));
    return response.data.data;
}

export async function deleteAwsConnection(accessToken: string, connectionId: string): Promise<void> {
    await api.delete(`/api/aws/connections/${connectionId}`, authenticatedRequest(accessToken));
}

export async function setActiveAwsConnection(accessToken: string, connectionId: string): Promise<void> {
    await api.patch(`/api/aws/connections/${connectionId}/active`, undefined, authenticatedRequest(accessToken));
}

export async function getAwsResourceCatalog(accessToken: string, connectionId: string): Promise<AwsResourceCatalog> {
    const response = await api.get<ApiEnvelope<AwsResourceCatalog>>(`/api/aws/connections/${connectionId}/catalog`, authenticatedRequest(accessToken));
    return response.data.data;
}
