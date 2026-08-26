"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Code2, Link2, Monitor, Plus, Tag, Terminal, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import { getAwsResourceCatalog, listAwsConnections, type AwsResourceCatalog } from "@/lib/aws";
import Skeleton from "@/components/ui/Skeleton";
import type { ResourceNodeData } from "./resourceNode";
import type { AwsResourceSnapshot } from "@/lib/sketches";
import { getPendingDeploymentChanges } from "@/lib/deploymentChanges";
import DeploymentChangeInfo from "./DeploymentChangeInfo";

type Ec2Bindings = { keyPair?: string; securityGroups: string[] };
type Props = { bindings?: Ec2Bindings; connectionId: string | null; node: Node<ResourceNodeData>; resource?: AwsResourceSnapshot; onChange: (label: string, config: Record<string, unknown>) => void; onDelete: () => void };
type FieldProps = { label: string; value: string | number; onChange: (value: string) => void; type?: "number" | "text" };

const inputClass = "mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-(--primary-text-color) outline-none transition placeholder:text-(--muted-text-color) hover:border-white/20 focus:border-(--primary-color) focus:ring-2 focus:ring-(--primary-color)/15";

function Field({ label, value, onChange, type = "text" }: FieldProps) {
    return <label className="block"><span className="text-xs font-medium text-(--secondary-text-color)">{label}</span><input className={inputClass} min={type === "number" ? 0 : undefined} onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function InstanceTypeField({ options, value, onChange }: { options: AwsResourceCatalog["instanceTypes"]; value: string; onChange: (value: string) => void }) {
    const selected = options.find((option) => option.name === value);
    const memory = selected?.memoryMiB ? `${Math.round(selected.memoryMiB / 102.4) / 10} GiB memory` : "";
    const details = selected ? [`${selected.vcpus ?? "Unknown"} vCPUs`, memory, selected.architectures.join(", "), selected.networkPerformance, selected.instanceStorageGiB ? `${selected.instanceStorageGiB} GB instance storage` : "EBS only"].filter(Boolean) : [];
    return <div><label className="block"><span className="text-xs font-medium text-(--secondary-text-color)">Instance type</span><input className={inputClass} list="ec2-instance-types" onChange={(event) => onChange(event.target.value)} value={value} /><datalist id="ec2-instance-types">{options.map((option) => <option key={option.name} label={[`${option.vcpus ?? "?"} vCPU`, option.memoryMiB ? `${Math.round(option.memoryMiB / 1024)} GiB` : ""].filter(Boolean).join(" · ")} value={option.name} />)}</datalist></label>{details.length ? <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-(--secondary-text-color)">{details.join(" · ")}</p> : null}</div>;
}

function AmiField({ images, value, onChange }: { images: AwsResourceCatalog["images"]; value: string; onChange: (image: AwsResourceCatalog["images"][number] | null) => void }) {
    const [category, setCategory] = useState<"amazon-linux" | "windows">("amazon-linux");
    const options = images.filter((image) => image.category === category);
    return <div>
        <span className="text-xs text-(--secondary-text-color)">Application and OS image</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={`flex min-h-16 items-center gap-2 border p-3 text-left text-xs ${category === "amazon-linux" ? "border-(--secondary-color) bg-(--secondary-color)/10 text-(--primary-text-color)" : "border-white/10 text-(--secondary-text-color) hover:bg-white/6"}`} onClick={() => setCategory("amazon-linux")} type="button"><Terminal className="h-4 w-4 shrink-0 text-amber-300" /><span>Amazon Linux</span></button>
            <button className={`flex min-h-16 items-center gap-2 border p-3 text-left text-xs ${category === "windows" ? "border-(--secondary-color) bg-(--secondary-color)/10 text-(--primary-text-color)" : "border-white/10 text-(--secondary-text-color) hover:bg-white/6"}`} onClick={() => setCategory("windows")} type="button"><Monitor className="h-4 w-4 shrink-0 text-sky-300" /><span>Windows Server</span></button>
        </div>
        <div className="mt-2 max-h-72 overflow-auto border border-white/10 bg-black/20">
            {options.length ? options.map((image) => {
                const selected = image.id === value;
                return <button className={`flex w-full items-start gap-3 border-b border-white/8 px-3 py-3 text-left last:border-0 hover:bg-white/6 ${selected ? "bg-(--secondary-color)/10" : ""}`} key={image.id} onClick={() => onChange(image)} type="button">
                    <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center border ${selected ? "border-(--secondary-color) bg-(--secondary-color) text-black" : "border-white/30"}`}>{selected ? <Check className="h-3 w-3" /> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block font-medium text-(--primary-text-color)">{image.title}</span><span className="mt-1 block font-mono text-[10px] text-(--muted-text-color)">{image.id}</span><span className="mt-1 block text-[11px] text-(--secondary-text-color)">{[image.architecture, `Released ${image.release}`, `EBS root: ${image.rootDeviceName || "/dev/xvda"}`].filter(Boolean).join(" · ")}</span></span>
                </button>;
            }) : <p className="px-3 py-4 text-xs text-(--secondary-text-color)">No AMIs are available.</p>}
        </div>
    </div>;
}

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: ReadonlyArray<ReadonlyArray<string>>; value: string }) {
    return <label className="block"><span className="text-xs font-medium text-(--secondary-text-color)">{label}</span><select className={inputClass} onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([option = "", title = ""]) => <option className="bg-[#151821]" key={option} value={option}>{title}</option>)}</select></label>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
    return <label className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-3 text-sm text-(--secondary-text-color) transition hover:border-white/20"><span>{label}</span><input checked={checked} className="h-4 w-4 accent-(--primary-color)" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}

function LineList({ label, onChange, value }: { label: string; onChange: (values: string[]) => void; value: unknown }) {
    const lines = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").join("\n") : "";
    return <label className="block"><span className="text-xs text-(--secondary-text-color)">{label}</span><textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => onChange(event.target.value.split("\n").map((entry) => entry.trim()).filter(Boolean))} value={lines} /></label>;
}

function SecurityGroupPicker({ groups, linkedGroups, onChange, value }: { groups: AwsResourceCatalog["securityGroups"]; linkedGroups: string[]; onChange: (value: string[]) => void; value: unknown }) {
    const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
    const linked = selected.filter((entry) => entry.match(/^\$\{[^}]+\.securityGroupId\}$/));
    const manual = selected.filter((entry) => !linked.includes(entry));
    return <div><span className="text-xs text-(--secondary-text-color)">Security groups</span>{linkedGroups.length ? <div className="mt-2 space-y-1 border border-(--secondary-color)/30 bg-(--secondary-color)/8 p-3 text-xs text-(--secondary-color)">{linkedGroups.map((group) => <p className="flex items-center gap-2" key={group}><Link2 className="h-3.5 w-3.5" />{group}</p>)}</div> : null}<div className="mt-2 max-h-36 space-y-2 overflow-auto border border-white/10 bg-black/20 p-3">{groups.map((group) => <label className="flex items-start gap-2 text-xs text-(--secondary-text-color)" key={group.id}><input checked={manual.includes(group.id)} className="mt-0.5 accent-(--primary-color)" onChange={(event) => onChange(event.target.checked ? [...linked, ...manual, group.id] : [...linked, ...manual.filter((id) => id !== group.id)])} type="checkbox" /><span><b className="font-medium text-(--primary-text-color)">{group.name}</b> <span className="font-mono">{group.id}</span></span></label>)}</div></div>;
}

function Ec2Form({ bindings, catalog, config, deployed, update }: { bindings?: Ec2Bindings; catalog: AwsResourceCatalog | null; config: Record<string, unknown>; deployed: boolean; update: (key: string, value: unknown) => void }) {
    const mode = String(config.mode ?? "create");
    if (mode === "existing") return <><Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} /><Select label="Existing EC2 instance" onChange={(value) => update("instanceId", value)} options={[["", "Select instance"], ...(catalog?.instances ?? []).map((instance) => [instance.id, `${instance.name} (${instance.state})`])]} value={String(config.instanceId ?? "")} /></>;
    return <>
        {deployed ? <p className="border border-amber-300/25 bg-amber-300/8 p-3 text-xs leading-5 text-amber-100">AMI, instance type, key pair, storage, subnet, instance profile, user data, and metadata options are fixed after launch. Change the supported controls below, then publish the sketch.</p> : null}
        <fieldset disabled={deployed} className="space-y-5 disabled:opacity-55">
        <Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["create", "Create new"], ["existing", "Use existing"]]} value={mode} />
        <AmiField images={catalog?.images ?? []} onChange={(image) => update("__all__", { ...config, imageId: image?.id ?? "", ...(image && { rootDeviceName: image.rootDeviceName }) })} value={String(config.imageId ?? "")} />
        <Field label="Custom AMI ID" onChange={(value) => update("imageId", value)} value={String(config.imageId ?? "")} />
        <Select label="Launch template" onChange={(value) => update("launchTemplateId", value)} options={[["", "No launch template"], ...(catalog?.launchTemplates ?? []).map((template) => [template.id, template.name])]} value={String(config.launchTemplateId ?? "")} />
        <InstanceTypeField onChange={(value) => update("instanceType", value)} options={catalog?.instanceTypes ?? []} value={String(config.instanceType ?? "t3.micro")} />
        <Field label="Instance count" onChange={(value) => update("instanceCount", Number(value) || 1)} type="number" value={Number(config.instanceCount ?? 1)} />
        <Field label="Instance name" onChange={(value) => update("name", value)} value={String(config.name ?? "")} />
        {bindings?.keyPair ? <div className="border border-(--secondary-color)/30 bg-(--secondary-color)/8 p-3 text-xs text-(--secondary-color)"><span className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5" />Linked key pair</span><p className="mt-1 truncate font-medium text-(--primary-text-color)">{bindings.keyPair}</p></div> : <Field label="Key pair name" onChange={(value) => update("keyName", value)} value={String(config.keyName ?? "")} />}
        <div className="border-t border-white/10 pt-4"><p className="text-xs text-(--secondary-text-color)">Root EBS volume</p><Field label="Storage (GiB)" onChange={(value) => update("rootVolumeSizeGiB", value ? Number(value) : undefined)} type="number" value={String(config.rootVolumeSizeGiB ?? "")} /><Select label="Volume type" onChange={(value) => update("rootVolumeType", value)} options={[["gp3", "General purpose SSD (gp3)"], ["gp2", "General purpose SSD (gp2)"]]} value={String(config.rootVolumeType ?? "gp3")} /><Toggle checked={config.deleteRootVolumeOnTermination !== false} label="Delete volume on termination" onChange={(value) => update("deleteRootVolumeOnTermination", value)} /></div>
        <Select label="Subnet" onChange={(value) => update("subnetId", value)} options={[["", "Default subnet"], ...(catalog?.subnets ?? []).map((subnet) => [subnet.id, `${subnet.name} (${subnet.availabilityZone})`])]} value={String(config.subnetId ?? "")} />
        </fieldset>
        <SecurityGroupPicker groups={catalog?.securityGroups ?? []} linkedGroups={bindings?.securityGroups ?? []} onChange={(value) => update("securityGroupIds", value)} value={config.securityGroupIds} />
        <fieldset disabled={deployed} className="space-y-5 disabled:opacity-55">
        <Select label="IAM instance profile" onChange={(value) => update("iamInstanceProfile", value)} options={[["", "No instance profile"], ...(catalog?.instanceProfiles ?? []).map((profile) => [profile.arn, profile.name])]} value={String(config.iamInstanceProfile ?? "")} />
        <label className="block"><span className="text-xs text-(--secondary-text-color)">User data</span><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => update("userData", event.target.value)} value={String(config.userData ?? "")} /></label>
        <Select label="Instance metadata access" onChange={(value) => update("metadataHttpTokens", value)} options={[["required", "Require IMDSv2"], ["optional", "Allow IMDSv1"]]} value={String(config.metadataHttpTokens ?? "required")} />
        <Toggle checked={config.ebsOptimized === true} label="EBS optimized" onChange={(value) => update("ebsOptimized", value)} />
        </fieldset>
        <Select label="Shutdown behavior" onChange={(value) => update("shutdownBehavior", value)} options={[["stop", "Stop"], ["terminate", "Terminate"]]} value={String(config.shutdownBehavior ?? "stop")} />
        <Toggle checked={config.monitoring === true} label="Detailed monitoring" onChange={(value) => update("monitoring", value)} />
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

function KeyPairForm({ catalog, config, update }: { catalog: AwsResourceCatalog | null; config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const mode = String(config.mode ?? "existing");
    return <><Select label="Resource mode" onChange={(value) => update("mode", value)} options={[["existing", "Use existing"], ["import", "Import public key"]]} value={mode} />{mode === "existing" ? <Select label="Existing key pair" onChange={(value) => update("keyName", value)} options={[["", "Select key pair"], ...(catalog?.keyPairs ?? []).map((keyPair) => [keyPair.name, keyPair.name])]} value={String(config.keyName ?? "")} /> : <><Field label="Key pair name" onChange={(value) => update("keyName", value)} value={String(config.keyName ?? "")} /><label className="block"><span className="text-xs text-(--secondary-text-color)">Public key material</span><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => update("publicKeyMaterial", event.target.value)} value={String(config.publicKeyMaterial ?? "")} /></label></>}</>;
}

function IamForm({ config, update }: { config: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
    const updateTrustedService = (trustedService: string) => {
        const next = { ...config };
        delete next.assumeRolePolicyDocument;
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

function ConfigurationSkeleton() {
    return <div className="space-y-6" aria-label="Loading resource configuration"><div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-11 w-full" /></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-11 w-full" /></div><div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-11 w-full" /></div></div><div className="space-y-3 border-t border-white/10 pt-6"><Skeleton className="h-3 w-32" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div></div>;
}

export default function ResourceInspector({ bindings, connectionId, node, resource, onChange, onDelete }: Props) {
    const { data: session } = useSession();
    const { config, service } = node.data;
    const [catalog, setCatalog] = useState<AwsResourceCatalog | null>(null);
    const catalogRequired = service === "EC2_INSTANCE" || service === "SECURITY_GROUP" || service === "KEY_PAIR";
    const [catalogLoading, setCatalogLoading] = useState(catalogRequired);
    const update = (key: string, value: unknown) => onChange(node.data.label, key === "__all__" ? value as Record<string, unknown> : { ...config, [key]: value });
    const stateEntries = Object.entries(resource?.actualState ?? {}).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").slice(0, 12);
    const deployed = resource?.status === "RUNNING";
    const changes = deployed && resource ? getPendingDeploymentChanges(service, config, resource.desiredConfig) : [];
    const formLocked = deployed && service !== "EC2_INSTANCE" && service !== "S3_BUCKET";

    useEffect(() => {
        const accessToken = session?.accessToken;
        if (!accessToken || !catalogRequired) return;
        let active = true;
        void listAwsConnections(accessToken).then((connections) => {
            const connection = connections.find((entry) => entry.id === connectionId) ?? connections.find((entry) => entry.isActive) ?? connections[0];
            return connection ? getAwsResourceCatalog(accessToken, connection.id) : null;
        }).then((data) => { if (active) setCatalog(data); }).catch(() => { if (active) setCatalog(null); }).finally(() => { if (active) setCatalogLoading(false); });
        return () => { active = false; };
    }, [catalogRequired, connectionId, session?.accessToken]);

    return <div className="h-full overflow-auto p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-(--primary-text-color)"><span className="flex items-center gap-2"><Code2 className="h-4 w-4 text-(--secondary-color)" />Resource settings</span><button aria-label="Delete node" className="grid h-9 w-9 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-(--danger-color)/10 hover:text-(--danger-color)" onClick={onDelete} title="Delete node" type="button"><Trash2 className="h-4 w-4" /></button></div>
        <div className="mt-6 max-w-4xl space-y-5">
            <label className="block"><span className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Tag className="h-3.5 w-3.5" />Node label</span><input className={inputClass} onChange={(event) => onChange(event.target.value, config)} value={node.data.label} /></label>
            <div className="rounded-md border border-white/8 bg-black/15 px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--secondary-text-color)">{service.replaceAll("_", " ")}</p></div>
            {resource ? <section className="border border-white/10 bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-(--primary-text-color)">Deployment status</p><span className={`font-mono text-[10px] ${resource.status === "RUNNING" ? "text-emerald-300" : resource.status === "FAILED" ? "text-rose-300" : "text-amber-300"}`}>{resource.status.replaceAll("_", " ")}</span></div>{resource.lastError ? <p className="mt-3 text-xs leading-5 text-(--danger-color)">{resource.lastError}</p> : null}{deployed ? <p className={`mt-3 flex items-center gap-1 text-xs ${changes.length ? "text-amber-200" : "text-(--secondary-text-color)"}`}>{changes.length ? <>Changes pending. Publish this sketch to apply the supported updates. <DeploymentChangeInfo changes={changes} /></> : "No unpublished configuration changes."}</p> : null}{stateEntries.length ? <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">{stateEntries.map(([key, value]) => <div key={key}><dt className="text-[11px] text-(--secondary-text-color)">{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-0.5 break-all font-mono text-xs text-(--primary-text-color)">{String(value)}</dd></div>)}</dl> : null}</section> : null}
            {catalogLoading ? <ConfigurationSkeleton /> : <>
            {catalog?.warnings.length ? <p className="rounded-md border border-(--warning-color)/40 bg-(--warning-color)/8 p-3 text-xs leading-5 text-(--warning-color)">{catalog.warnings.join(" ")}</p> : null}
            {formLocked ? <p className="border border-amber-300/25 bg-amber-300/8 p-3 text-xs leading-5 text-amber-100">This resource type does not support configuration updates yet. Delete and replace it to change its deployment settings.</p> : null}
            <fieldset disabled={formLocked} className="space-y-5 disabled:opacity-55">
            {service === "EC2_INSTANCE" ? <Ec2Form bindings={bindings} catalog={catalog} config={config} deployed={deployed} update={update} /> : null}
            {service === "KEY_PAIR" ? <KeyPairForm catalog={catalog} config={config} update={update} /> : null}
            {service === "SECURITY_GROUP" ? <SecurityGroupForm catalog={catalog} config={config} update={update} /> : null}
            {service === "ECR_REPOSITORY" ? <><Field label="Repository name" onChange={(value) => update("repositoryName", value)} value={String(config.repositoryName ?? "")} /><Select label="Tag mutability" onChange={(value) => update("imageTagMutability", value)} options={[["MUTABLE", "Mutable"], ["IMMUTABLE", "Immutable"]]} value={String(config.imageTagMutability ?? "MUTABLE")} /><Toggle checked={config.scanOnPush === true} label="Scan on push" onChange={(value) => update("scanOnPush", value)} /></> : null}
            {service === "S3_BUCKET" ? <><fieldset disabled={deployed} className="disabled:opacity-55"><Field label="Bucket name" onChange={(value) => update("bucketName", value)} value={String(config.bucketName ?? "")} /></fieldset>{deployed ? <p className="text-xs text-(--secondary-text-color)">Bucket names are fixed after creation. The remaining controls are applied on publish.</p> : null}<Select label="Encryption" onChange={(value) => update("encryption", value)} options={[["SSE-S3", "Amazon S3 managed keys"], ["SSE-KMS", "Customer managed KMS key"]]} value={String(config.encryption ?? "SSE-S3")} />{config.encryption === "SSE-KMS" ? <Field label="KMS key ARN" onChange={(value) => update("kmsKeyArn", value)} value={String(config.kmsKeyArn ?? "")} /> : null}<Toggle checked={config.versioning === true} label="Versioning" onChange={(value) => update("versioning", value)} /><Toggle checked={config.blockPublicAccess !== false} label="Block all public access" onChange={(value) => update("blockPublicAccess", value)} /><Toggle checked={config.enforceHttps !== false} label="Require HTTPS" onChange={(value) => update("enforceHttps", value)} /></> : null}
            {service === "IAM_ROLE" ? <IamForm config={config} update={update} /> : null}
            {service === "LAMBDA_FUNCTION" ? <><Field label="Function name" onChange={(value) => update("functionName", value)} value={String(config.functionName ?? "")} /><Field label="Role ARN" onChange={(value) => update("roleArn", value)} value={String(config.roleArn ?? "")} /><Field label="Handler" onChange={(value) => update("handler", value)} value={String(config.handler ?? "")} /><Select label="Runtime" onChange={(value) => update("runtime", value)} options={[["nodejs22.x", "Node.js 22"], ["nodejs20.x", "Node.js 20"], ["python3.13", "Python 3.13"], ["python3.12", "Python 3.12"]]} value={String(config.runtime ?? "nodejs22.x")} /><label className="block"><span className="text-xs text-(--secondary-text-color)">ZIP payload (base64)</span><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => update("codeZipBase64", event.target.value)} value={String(config.codeZipBase64 ?? "")} /></label><Field label="Description" onChange={(value) => update("description", value)} value={String(config.description ?? "")} /><Field label="Memory (MB)" onChange={(value) => update("memorySize", Number(value) || 128)} type="number" value={Number(config.memorySize ?? 128)} /><Field label="Timeout (seconds)" onChange={(value) => update("timeout", Number(value) || 1)} type="number" value={Number(config.timeout ?? 3)} /></> : null}
            {service === "DYNAMODB_TABLE" ? <DynamoDbForm config={config} update={update} /> : null}
            {service === "SQS_QUEUE" ? <><Field label="Queue name" onChange={(value) => update("queueName", value)} value={String(config.queueName ?? "")} /><Field label="Visibility timeout (seconds)" onChange={(value) => update("visibilityTimeoutSeconds", Number(value) || 0)} type="number" value={Number(config.visibilityTimeoutSeconds ?? 30)} /><Field label="Message retention (seconds)" onChange={(value) => update("messageRetentionPeriodSeconds", Number(value) || 60)} type="number" value={Number(config.messageRetentionPeriodSeconds ?? 345600)} /></> : null}
            {service === "SNS_TOPIC" ? <><Field label="Topic name" onChange={(value) => update("topicName", value)} value={String(config.topicName ?? "")} /><Toggle checked={config.fifoTopic === true} label="FIFO topic" onChange={(value) => update("fifoTopic", value)} /></> : null}
            </fieldset>
            </>}
        </div>
    </div>;
}
