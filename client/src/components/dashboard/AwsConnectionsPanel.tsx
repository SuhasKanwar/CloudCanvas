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
import ConfirmModal from "@/components/ui/ConfirmModal";

const defaultForm = { name: "", region: "ap-south-1", accessKeyId: "", secretAccessKey: "", sessionToken: "" };
const regions = ["ap-south-1", "us-east-1", "us-east-2", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"];

export default function AwsConnectionsPanel({ onBack }: { onBack: () => void }) {
    const { data: session, status } = useSession();
    const [connections, setConnections] = useState<AwsConnection[]>([]);
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [connectionToDelete, setConnectionToDelete] = useState<AwsConnection | null>(null);
    const [deleting, setDeleting] = useState(false);

    const accessToken = session?.accessToken;

    useEffect(() => {
        if (status === "loading") return;
        if (!accessToken) return;
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

    const remove = async () => {
        if (!accessToken || !connectionToDelete) return;
        setDeleting(true);
        try {
            await deleteAwsConnection(accessToken, connectionToDelete.id);
            setConnections((current) => current.filter((connection) => connection.id !== connectionToDelete.id));
            setConnectionToDelete(null);
        } catch {
            // The API interceptor displays the server response.
        } finally {
            setDeleting(false);
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
        <section className="dashboard-enter mx-auto w-full max-w-6xl px-4 py-9 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8">
                <div>
                    <button className="mb-4 inline-flex items-center gap-2 text-sm text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" />Back to canvas</button>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--secondary-color)">Workspace</p>
                    <h1 className="mt-3 text-3xl font-semibold text-(--primary-text-color)">AWS connections</h1>
                </div>
                <p className="max-w-md text-sm leading-6 text-(--secondary-text-color)">Configure the account used when a sketch is deployed.</p>
            </div>

            <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div>
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg text-(--primary-text-color)">Saved accounts</h2>
                        {loading ? <Loader2 aria-label="Loading AWS connections" className="h-4 w-4 animate-spin text-(--secondary-text-color)" /> : null}
                    </div>
                    <div className="dashboard-stagger mt-4 divide-y divide-white/10 border-y border-white/10 bg-black/8">
                        {!loading && connections.length === 0 ? <p className="py-8 text-sm text-(--secondary-text-color)">No AWS account is configured.</p> : null}
                        {connections.map((connection) => (
                            <div className="dashboard-interactive flex items-center justify-between gap-4 px-4 py-4 hover:bg-white/4" key={connection.id}>
                                <div className="min-w-0">
                                    <p className="truncate font-(family-name:--font-display) text-sm font-semibold text-(--primary-text-color)">{connection.name}</p>
                                    <p className="mt-1 flex items-center gap-2 font-mono text-xs text-(--secondary-text-color)">{connection.region}{connection.isActive ? <span className="inline-flex items-center gap-1 text-(--success-color)"><Check className="h-3 w-3" />Active</span> : null}</p>
                                </div>
                                <div className="flex items-center gap-1"><button className="rounded-md px-2.5 py-1.5 text-xs text-(--secondary-text-color) transition hover:bg-white/6 hover:text-(--primary-text-color) disabled:opacity-40" disabled={connection.isActive} onClick={() => void activate(connection.id)} type="button">{connection.isActive ? "In use" : "Use"}</button><button aria-label={`Delete ${connection.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-(--danger-color)/10 hover:text-(--danger-color)" onClick={() => setConnectionToDelete(connection)} type="button"><Trash2 className="h-4 w-4" /></button></div>
                            </div>
                        ))}
                    </div>
                </div>

                <form className="dashboard-enter rounded-lg border border-white/10 bg-[var(--surface-color)] p-5 shadow-xl shadow-black/15" onSubmit={submit}>
                    <div className="flex items-center gap-2 font-(family-name:--font-display) text-sm font-semibold text-(--primary-text-color)"><span className="grid h-8 w-8 place-items-center rounded-md bg-(--primary-color)/10 text-(--primary-color)"><KeyRound className="h-4 w-4" /></span>Add account</div>
                    <div className="mt-5 space-y-4">
                        <Field label="Connection name" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
                        <label className="block text-xs text-(--secondary-text-color)"><span>Region</span><select className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-(--primary-text-color) outline-none transition focus:border-(--primary-color)" onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} value={form.region}>{regions.map((region) => <option className="bg-[#151821]" key={region} value={region}>{region}</option>)}</select></label>
                        <Field label="Access key ID" value={form.accessKeyId} onChange={(accessKeyId) => setForm((current) => ({ ...current, accessKeyId }))} />
                        <Field label="Secret access key" secret value={form.secretAccessKey} onChange={(secretAccessKey) => setForm((current) => ({ ...current, secretAccessKey }))} />
                        <Field label="Session token (optional)" secret value={form.sessionToken} onChange={(sessionToken) => setForm((current) => ({ ...current, sessionToken }))} required={false} />
                    </div>
                    <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color) shadow-lg shadow-(--primary-color)/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !accessToken} type="submit">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Save connection
                    </button>
                </form>
            </div>
            <ConfirmModal confirmLabel="Delete connection" confirming={deleting} description={`Delete ${connectionToDelete?.name ?? "this AWS connection"}. Sketches using it can no longer be deployed with these credentials.`} onClose={() => setConnectionToDelete(null)} onConfirm={() => void remove()} open={Boolean(connectionToDelete)} title="Delete AWS connection?" variant="danger" />
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
        <input className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-(--primary-text-color) outline-none transition focus:border-(--primary-color)" onChange={(event) => onChange(event.target.value)} required={required} type={secret ? "password" : "text"} value={value} />
    </label>;
}
