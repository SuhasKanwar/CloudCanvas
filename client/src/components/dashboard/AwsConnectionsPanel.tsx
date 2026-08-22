"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Check, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import {
    createAwsConnection,
    deleteAwsConnection,
    listAwsConnections,
    setActiveAwsConnection,
    type AwsConnection,
} from "@/lib/aws";

const defaultForm = { name: "", region: "ap-south-1", accessKeyId: "", secretAccessKey: "", sessionToken: "" };
const regions = ["ap-south-1", "us-east-1", "us-east-2", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"];

export default function AwsConnectionsPanel({ onBack }: { onBack: () => void }) {
    const { data: session, status } = useSession();
    const [connections, setConnections] = useState<AwsConnection[]>([]);
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const accessToken = session?.accessToken;

    useEffect(() => {
        if (status === "loading") return;
        if (!accessToken) {
            setLoading(false);
            return;
        }
        void listAwsConnections(accessToken)
            .then(setConnections)
            .catch(() => undefined)
            .finally(() => setLoading(false));
    }, [accessToken, status]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!accessToken) return;
        setSaving(true);
        try {
            const connection = await createAwsConnection(accessToken, {
                ...form,
                ...(form.sessionToken ? { sessionToken: form.sessionToken } : {}),
            });
            setConnections((current) => [connection, ...current]);
            setForm(defaultForm);
        } catch {
            // The API interceptor displays the server response.
        } finally {
            setSaving(false);
        }
    };

    const remove = async (connectionId: string) => {
        if (!accessToken) return;
        try {
            await deleteAwsConnection(accessToken, connectionId);
            setConnections((current) => current.filter((connection) => connection.id !== connectionId));
        } catch {
            // The API interceptor displays the server response.
        }
    };

    const activate = async (connectionId: string) => {
        if (!accessToken) return;
        try {
            await setActiveAwsConnection(accessToken, connectionId);
            setConnections((current) => current.map((connection) => ({ ...connection, isActive: connection.id === connectionId })));
        } catch {
            // The API interceptor displays the server response.
        }
    };

    return (
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <button className="mb-4 inline-flex items-center gap-2 text-sm text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" />Back to canvas</button>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--secondary-color)">Workspace</p>
                    <h1 className="mt-2 text-3xl text-(--primary-text-color)">AWS connections</h1>
                </div>
                <p className="max-w-md text-sm leading-6 text-(--secondary-text-color)">Configure the account used when a sketch is deployed.</p>
            </div>

            <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg text-(--primary-text-color)">Saved accounts</h2>
                        {loading ? <Loader2 aria-label="Loading AWS connections" className="h-4 w-4 animate-spin text-(--secondary-text-color)" /> : null}
                    </div>
                    <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
                        {!loading && connections.length === 0 ? <p className="py-8 text-sm text-(--secondary-text-color)">No AWS account is configured.</p> : null}
                        {connections.map((connection) => (
                            <div className="flex items-center justify-between gap-4 py-4" key={connection.id}>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-(--primary-text-color)">{connection.name}</p>
                                    <p className="mt-1 flex items-center gap-2 font-mono text-xs text-(--secondary-text-color)">{connection.region}{connection.isActive ? <span className="inline-flex items-center gap-1 text-(--success-color)"><Check className="h-3 w-3" />Active</span> : null}</p>
                                </div>
                                <div className="flex items-center gap-1"><button className="px-2 py-1 text-xs text-(--secondary-text-color) hover:text-(--primary-text-color) disabled:opacity-40" disabled={connection.isActive} onClick={() => void activate(connection.id)} type="button">{connection.isActive ? "In use" : "Use"}</button><button aria-label={`Delete ${connection.name}`} className="shrink-0 p-2 text-(--secondary-text-color) transition-colors hover:text-(--danger-color)" onClick={() => void remove(connection.id)} type="button"><Trash2 className="h-4 w-4" /></button></div>
                            </div>
                        ))}
                    </div>
                </div>

                <form className="border border-white/10 p-5" onSubmit={submit}>
                    <div className="flex items-center gap-2 text-sm font-medium text-(--primary-text-color)"><KeyRound className="h-4 w-4" />Add account</div>
                    <div className="mt-5 space-y-4">
                        <Field label="Connection name" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
                        <label className="block text-xs text-(--secondary-text-color)"><span>Region</span><select className="mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-(--primary-text-color) outline-none focus:border-(--primary-color)" onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} value={form.region}>{regions.map((region) => <option className="bg-[#151821]" key={region} value={region}>{region}</option>)}</select></label>
                        <Field label="Access key ID" value={form.accessKeyId} onChange={(accessKeyId) => setForm((current) => ({ ...current, accessKeyId }))} />
                        <Field label="Secret access key" secret value={form.secretAccessKey} onChange={(secretAccessKey) => setForm((current) => ({ ...current, secretAccessKey }))} />
                        <Field label="Session token (optional)" secret value={form.sessionToken} onChange={(sessionToken) => setForm((current) => ({ ...current, sessionToken }))} required={false} />
                    </div>
                    <button className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color) disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !accessToken} type="submit">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Save connection
                    </button>
                </form>
            </div>
        </section>
    );
}

function Field({ label, onChange, required = true, secret = false, value }: {
    label: string;
    onChange: (value: string) => void;
    required?: boolean;
    secret?: boolean;
    value: string;
}) {
    return <label className="block text-xs text-(--secondary-text-color)">
        <span>{label}</span>
        <input className="mt-2 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-(--primary-text-color) outline-none focus:border-(--primary-color)" onChange={(event) => onChange(event.target.value)} required={required} type={secret ? "password" : "text"} value={value} />
    </label>;
}
