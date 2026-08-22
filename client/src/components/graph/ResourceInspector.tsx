"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Code2, Plus, Tag, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import { getAwsResourceCatalog, listAwsConnections, type AwsResourceCatalog } from "@/lib/aws";
import type { ResourceNodeData } from "./resourceNode";

type Props = { connectionId: string | null; node: Node<ResourceNodeData>; onChange: (label: string, config: Record<string, unknown>) => void; onDelete: () => void };
type FieldProps = { label: string; value: string | number; onChange: (value: string) => void; type?: "number" | "text" };

const inputClass = "mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-(--primary-color)";

function Field({ label, value, onChange, type = "text" }: FieldProps) {
    return <label className="block"><span className="text-xs text-(--secondary-text-color)">{label}</span><input className={inputClass} min={type === "number" ? 0 : undefined} onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: ReadonlyArray<ReadonlyArray<string>>; value: string }) {
    return <label className="block"><span className="text-xs text-(--secondary-text-color)">{label}</span><select className={inputClass} onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([option = "", title = ""]) => <option className="bg-[#151821]" key={option} value={option}>{title}</option>)}</select></label>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
    return <label className="flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm text-(--secondary-text-color)"><span>{label}</span><input checked={checked} className="h-4 w-4 accent-(--primary-color)" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}

function LineList({ label, onChange, value }: { label: string; onChange: (values: string[]) => void; value: unknown }) {
    const lines = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").join("\n") : "";
    return <label className="block"><span className="text-xs text-(--secondary-text-color)">{label}</span><textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => onChange(event.target.value.split("\n").map((entry) => entry.trim()).filter(Boolean))} value={lines} /></label>;
}

function SecurityGroupPicker({ groups, onChange, value }: { groups: AwsResourceCatalog["securityGroups"]; onChange: (value: string[]) => void; value: unknown }) {
    const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
    return <div><span className="text-xs text-(--secondary-text-color)">Security groups</span><div className="mt-2 max-h-36 space-y-2 overflow-auto border border-white/10 bg-black/20 p-3">{groups.map((group) => <label className="flex items-start gap-2 text-xs text-(--secondary-text-color)" key={group.id}><input checked={selected.includes(group.id)} className="mt-0.5 accent-(--primary-color)" onChange={(event) => onChange(event.target.checked ? [...selected, group.id] : selected.filter((id) => id !== group.id))} type="checkbox" /><span><b className="font-medium text-(--primary-text-color)">{group.name}</b> <span className="font-mono">{group.id}</span></span></label>)}</div></div>;
}

function Ec2Form({ catalog, config, update }: { catalog: AwsResourceCatalog | null; config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const mode = String(config.mode ?? "create");
    if (mode === "existing") return <><Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} /><Select label="Existing EC2 instance" onChange={(value) => update("instanceId", value)} options={[["", "Select instance"], ...(catalog?.instances ?? []).map((instance) => [instance.id, `${instance.name} (${instance.state})`])]} value={String(config.instanceId ?? "")} /></>;
    return <>
        <Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} />
        <Field label="AMI ID" onChange={(value) => update("imageId", value)} value={String(config.imageId ?? "")} />
        <Select label="Launch template" onChange={(value) => update("launchTemplateId", value)} options={[["", "No launch template"], ...(catalog?.launchTemplates ?? []).map((template) => [template.id, template.name])]} value={String(config.launchTemplateId ?? "")} />
        <Select label="Instance type" onChange={(value) => update("instanceType", value)} options={[["t3.micro", "t3.micro"], ["t3.small", "t3.small"], ["t3.medium", "t3.medium"], ["t3.large", "t3.large"], ["m5.large", "m5.large"], ["c5.large", "c5.large"]]} value={String(config.instanceType ?? "t3.micro")} />
        <Field label="Instance count" onChange={(value) => update("instanceCount", Number(value) || 1)} type="number" value={Number(config.instanceCount ?? 1)} />
        <Field label="Instance name" onChange={(value) => update("name", value)} value={String(config.name ?? "")} />
        <Field label="Key pair name" onChange={(value) => update("keyName", value)} value={String(config.keyName ?? "")} />
        <Select label="Subnet" onChange={(value) => update("subnetId", value)} options={[["", "Default subnet"], ...(catalog?.subnets ?? []).map((subnet) => [subnet.id, `${subnet.name} (${subnet.availabilityZone})`])]} value={String(config.subnetId ?? "")} />
        <SecurityGroupPicker groups={catalog?.securityGroups ?? []} onChange={(value) => update("securityGroupIds", value)} value={config.securityGroupIds} />
        <Select label="IAM instance profile" onChange={(value) => update("iamInstanceProfile", value)} options={[["", "No instance profile"], ...(catalog?.instanceProfiles ?? []).map((profile) => [profile.arn, profile.name])]} value={String(config.iamInstanceProfile ?? "")} />
        <label className="block"><span className="text-xs text-(--secondary-text-color)">User data</span><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => update("userData", event.target.value)} value={String(config.userData ?? "")} /></label>
        <Select label="Shutdown behavior" onChange={(value) => update("shutdownBehavior", value)} options={[["stop", "Stop"], ["terminate", "Terminate"]]} value={String(config.shutdownBehavior ?? "stop")} />
        <Select label="Instance metadata access" onChange={(value) => update("metadataHttpTokens", value)} options={[["required", "Require IMDSv2"], ["optional", "Allow IMDSv1"]]} value={String(config.metadataHttpTokens ?? "required")} />
        <Toggle checked={config.monitoring === true} label="Detailed monitoring" onChange={(value) => update("monitoring", value)} />
        <Toggle checked={config.ebsOptimized === true} label="EBS optimized" onChange={(value) => update("ebsOptimized", value)} />
        <Toggle checked={config.disableApiTermination === true} label="Termination protection" onChange={(value) => update("disableApiTermination", value)} />
    </>;
}

function SecurityGroupForm({ catalog, config, update }: { catalog: AwsResourceCatalog | null; config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const mode = String(config.mode ?? "create");
    if (mode === "existing") return <><Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} /><Select label="Existing security group" onChange={(value) => { const group = catalog?.securityGroups.find((entry) => entry.id === value); update("__all__", { mode: "existing", groupId: value, groupName: group?.name ?? "" }); }} options={[["", "Select security group"], ...(catalog?.securityGroups ?? []).map((group) => [group.id, `${group.name} (${group.id})`])]} value={String(config.groupId ?? "")} /></>;
    const rules = Array.isArray(config.ingressRules) ? config.ingressRules as Array<Record<string, unknown>> : [];
    const updateRule = (index: number, key: string, value: unknown) => update("ingressRules", rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [key]: value } : rule));
    return <>
        <Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} />
        <Field label="Security group name" onChange={(value) => update("groupName", value)} value={String(config.groupName ?? "")} />
        <Field label="Description" onChange={(value) => update("description", value)} value={String(config.description ?? "")} />
        <Select label="VPC" onChange={(value) => update("vpcId", value)} options={[["", "Select VPC"], ...(catalog?.vpcs ?? []).map((vpc) => [vpc.id, `${vpc.name} (${vpc.cidrBlock})`])]} value={String(config.vpcId ?? "")} />
        <div className="border-t border-white/10 pt-4"><div className="flex items-center justify-between"><span className="text-xs text-(--secondary-text-color)">Inbound rules</span><button className="p-1 text-(--secondary-color) hover:bg-white/6" onClick={() => update("ingressRules", [...rules, { protocol: "tcp", fromPort: 443, toPort: 443, cidrIpv4: "0.0.0.0/0" }])} title="Add inbound rule" type="button"><Plus className="h-4 w-4" /></button></div>{rules.map((rule, index) => <div className="mt-3 space-y-2 border border-white/10 p-3" key={index}><Select label="Protocol" onChange={(value) => updateRule(index, "protocol", value)} options={[["tcp", "TCP"], ["udp", "UDP"], ["icmp", "ICMP"], ["-1", "All traffic"]]} value={String(rule.protocol ?? "tcp")} />{rule.protocol !== "-1" ? <div className="grid grid-cols-2 gap-2"><Field label="From" onChange={(value) => updateRule(index, "fromPort", Number(value))} type="number" value={Number(rule.fromPort ?? 0)} /><Field label="To" onChange={(value) => updateRule(index, "toPort", Number(value))} type="number" value={Number(rule.toPort ?? 0)} /></div> : null}<Field label="IPv4 CIDR" onChange={(value) => updateRule(index, "cidrIpv4", value)} value={String(rule.cidrIpv4 ?? "")} /><button className="text-xs text-(--danger-color)" onClick={() => update("ingressRules", rules.filter((_, ruleIndex) => ruleIndex !== index))} type="button">Remove rule</button></div>)}</div>
    </>;
}

function IamForm({ config, update }: { config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const updateTrustedService = (trustedService: string) => {
        const { assumeRolePolicyDocument: _legacyPolicy, ...next } = config;
        update("__all__", { ...next, trustedService });
    };
    return <>
        <Field label="Role name" onChange={(value) => update("roleName", value)} value={String(config.roleName ?? "")} />
        <Select label="Trusted service" onChange={updateTrustedService} options={[["ec2.amazonaws.com", "EC2"], ["lambda.amazonaws.com", "Lambda"], ["ecs-tasks.amazonaws.com", "ECS tasks"]]} value={String(config.trustedService ?? "ec2.amazonaws.com")} />
        <LineList label="Managed policy ARNs" onChange={(value) => update("managedPolicyArns", value)} value={config.managedPolicyArns} />
        <Field label="Description" onChange={(value) => update("description", value)} value={String(config.description ?? "")} />
        <Field label="Path" onChange={(value) => update("path", value)} value={String(config.path ?? "/")} />
        <Field label="Maximum session duration (seconds)" onChange={(value) => update("maxSessionDuration", Number(value) || 3600)} type="number" value={Number(config.maxSessionDuration ?? 3600)} />
        <Field label="Permissions boundary ARN" onChange={(value) => update("permissionsBoundaryArn", value)} value={String(config.permissionsBoundaryArn ?? "")} />
    </>;
}

function DynamoDbForm({ config, update }: { config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const keySchema = Array.isArray(config.keySchema) ? config.keySchema as Array<Record<string, unknown>> : [];
    const attributes = Array.isArray(config.attributeDefinitions) ? config.attributeDefinitions as Array<Record<string, unknown>> : [];
    const hash = keySchema.find((entry) => entry.KeyType === "HASH")?.AttributeName ?? "id";
    const range = keySchema.find((entry) => entry.KeyType === "RANGE")?.AttributeName ?? "";
    const attributeType = (name: unknown) => attributes.find((entry) => entry.AttributeName === name)?.AttributeType ?? "S";
    const updateKeys = (nextHash: string, nextHashType: string, nextRange: string, nextRangeType: string) => update("__all__", { ...config, keySchema: [{ AttributeName: nextHash, KeyType: "HASH" }, ...(nextRange ? [{ AttributeName: nextRange, KeyType: "RANGE" }] : [])], attributeDefinitions: [{ AttributeName: nextHash, AttributeType: nextHashType }, ...(nextRange ? [{ AttributeName: nextRange, AttributeType: nextRangeType }] : [])] });
    return <>
        <Field label="Table name" onChange={(value) => update("tableName", value)} value={String(config.tableName ?? "")} />
        <Field label="Partition key" onChange={(value) => updateKeys(value, String(attributeType(hash)), String(range), String(attributeType(range)))} value={String(hash)} />
        <Select label="Partition key type" onChange={(value) => updateKeys(String(hash), value, String(range), String(attributeType(range)))} options={[["S", "String"], ["N", "Number"], ["B", "Binary"]]} value={String(attributeType(hash))} />
        <Field label="Sort key" onChange={(value) => updateKeys(String(hash), String(attributeType(hash)), value, String(attributeType(range)))} value={String(range)} />
        {range ? <Select label="Sort key type" onChange={(value) => updateKeys(String(hash), String(attributeType(hash)), String(range), value)} options={[["S", "String"], ["N", "Number"], ["B", "Binary"]]} value={String(attributeType(range))} /> : null}
        <Select label="Billing mode" onChange={(value) => update("billingMode", value)} options={[["PAY_PER_REQUEST", "On-demand"], ["PROVISIONED", "Provisioned"]]} value={String(config.billingMode ?? "PAY_PER_REQUEST")} />
        {config.billingMode === "PROVISIONED" ? <><Field label="Read capacity units" onChange={(value) => update("readCapacityUnits", Number(value) || 1)} type="number" value={Number(config.readCapacityUnits ?? 1)} /><Field label="Write capacity units" onChange={(value) => update("writeCapacityUnits", Number(value) || 1)} type="number" value={Number(config.writeCapacityUnits ?? 1)} /></> : null}
    </>;
}

export default function ResourceInspector({ connectionId, node, onChange, onDelete }: Props) {
    const { data: session } = useSession();
    const { config, service } = node.data;
    const [catalog, setCatalog] = useState<AwsResourceCatalog | null>(null);
    const update = (key: string, value: unknown) => onChange(node.data.label, key === "__all__" ? value as Record<string, unknown> : { ...config, [key]: value });

    useEffect(() => {
        const accessToken = session?.accessToken;
        if (!accessToken || (service !== "EC2_INSTANCE" && service !== "SECURITY_GROUP")) return;
        void listAwsConnections(accessToken).then((connections) => {
            const connection = connections.find((entry) => entry.id === connectionId) ?? connections.find((entry) => entry.isActive) ?? connections[0];
            return connection ? getAwsResourceCatalog(accessToken, connection.id) : null;
        }).then((data) => setCatalog(data)).catch(() => setCatalog(null));
    }, [connectionId, service, session?.accessToken]);

    return <div className="h-full overflow-auto p-5">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-(--primary-text-color)"><span className="flex items-center gap-2"><Code2 className="h-4 w-4 text-(--secondary-color)" />Resource settings</span><button aria-label="Delete node" className="p-2 text-(--secondary-text-color) hover:text-(--danger-color)" onClick={onDelete} title="Delete node" type="button"><Trash2 className="h-4 w-4" /></button></div>
        <div className="mt-6 space-y-5">
            <label className="block"><span className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Tag className="h-3.5 w-3.5" />Node label</span><input className={inputClass} onChange={(event) => onChange(event.target.value, config)} value={node.data.label} /></label>
            <div className="border-y border-white/10 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--secondary-text-color)">{service.replaceAll("_", " ")}</p></div>
            {service === "EC2_INSTANCE" ? <Ec2Form catalog={catalog} config={config} update={update} /> : null}
            {service === "SECURITY_GROUP" ? <SecurityGroupForm catalog={catalog} config={config} update={update} /> : null}
            {service === "ECR_REPOSITORY" ? <><Field label="Repository name" onChange={(value) => update("repositoryName", value)} value={String(config.repositoryName ?? "")} /><Select label="Tag mutability" onChange={(value) => update("imageTagMutability", value)} options={[["MUTABLE", "Mutable"], ["IMMUTABLE", "Immutable"]]} value={String(config.imageTagMutability ?? "MUTABLE")} /><Toggle checked={config.scanOnPush === true} label="Scan on push" onChange={(value) => update("scanOnPush", value)} /></> : null}
            {service === "S3_BUCKET" ? <Field label="Bucket name" onChange={(value) => update("bucketName", value)} value={String(config.bucketName ?? "")} /> : null}
            {service === "IAM_ROLE" ? <IamForm config={config} update={update} /> : null}
            {service === "LAMBDA_FUNCTION" ? <><Field label="Function name" onChange={(value) => update("functionName", value)} value={String(config.functionName ?? "")} /><Field label="Role ARN" onChange={(value) => update("roleArn", value)} value={String(config.roleArn ?? "")} /><Field label="Handler" onChange={(value) => update("handler", value)} value={String(config.handler ?? "")} /><Select label="Runtime" onChange={(value) => update("runtime", value)} options={[["nodejs22.x", "Node.js 22"], ["nodejs20.x", "Node.js 20"], ["python3.13", "Python 3.13"], ["python3.12", "Python 3.12"]]} value={String(config.runtime ?? "nodejs22.x")} /><label className="block"><span className="text-xs text-(--secondary-text-color)">ZIP payload (base64)</span><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => update("codeZipBase64", event.target.value)} value={String(config.codeZipBase64 ?? "")} /></label><Field label="Description" onChange={(value) => update("description", value)} value={String(config.description ?? "")} /><Field label="Memory (MB)" onChange={(value) => update("memorySize", Number(value) || 128)} type="number" value={Number(config.memorySize ?? 128)} /><Field label="Timeout (seconds)" onChange={(value) => update("timeout", Number(value) || 1)} type="number" value={Number(config.timeout ?? 3)} /></> : null}
            {service === "DYNAMODB_TABLE" ? <DynamoDbForm config={config} update={update} /> : null}
            {service === "SQS_QUEUE" ? <><Field label="Queue name" onChange={(value) => update("queueName", value)} value={String(config.queueName ?? "")} /><Field label="Visibility timeout (seconds)" onChange={(value) => update("visibilityTimeoutSeconds", Number(value) || 0)} type="number" value={Number(config.visibilityTimeoutSeconds ?? 30)} /><Field label="Message retention (seconds)" onChange={(value) => update("messageRetentionPeriodSeconds", Number(value) || 60)} type="number" value={Number(config.messageRetentionPeriodSeconds ?? 345600)} /></> : null}
            {service === "SNS_TOPIC" ? <><Field label="Topic name" onChange={(value) => update("topicName", value)} value={String(config.topicName ?? "")} /><Toggle checked={config.fifoTopic === true} label="FIFO topic" onChange={(value) => update("fifoTopic", value)} /></> : null}
        </div>
    </div>;
}
