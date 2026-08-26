"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Rocket } from "lucide-react";
import { listAwsConnections, type AwsConnection } from "@/lib/aws";
import { publishSketch } from "@/lib/sketches";
import { useOutsideDismiss } from "@/hooks/useOutsideDismiss";

export default function PublishSketchButton({ connectionId: sketchConnectionId, onPublished, sketchId }: { connectionId: string | null; onPublished: (connectionId: string) => Promise<void> | void; sketchId: string }) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [connections, setConnections] = useState<AwsConnection[]>([]);
    const [connectionId, setConnectionId] = useState("");
    const [publishing, setPublishing] = useState(false);
    const publishRef = useOutsideDismiss<HTMLDivElement>(() => setOpen(false));
    const activeConnection = connections.find((connection) => connection.isActive);
    const sketchConnection = connections.find((connection) => connection.id === sketchConnectionId);

    useEffect(() => {
        if (!session?.accessToken) return;
        void listAwsConnections(session.accessToken).then((data) => { setConnections(data); setConnectionId(sketchConnectionId ?? data.find((connection) => connection.isActive)?.id ?? data[0]?.id ?? ""); }).catch(() => undefined);
    }, [session?.accessToken, sketchConnectionId]);

    const publish = async () => {
        if (!session?.accessToken || !sketchId || !connectionId) return;
        try {
            setPublishing(true);
            await publishSketch(session.accessToken, sketchId, connectionId);
            await onPublished(connectionId);
            setOpen(false);
        } finally {
            setPublishing(false);
        }
    };

    return <div className="relative" ref={publishRef}>
        <button aria-expanded={open} className="inline-flex items-center gap-2 border border-(--secondary-color)/50 px-3 py-2 text-sm text-(--secondary-color) hover:bg-(--secondary-color)/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!sketchId} onClick={() => setOpen((current) => !current)} type="button"><Rocket className="h-4 w-4" />Publish <span className="hidden border-l border-(--secondary-color)/30 pl-2 text-xs sm:inline">{sketchConnection?.name ?? activeConnection?.name ?? "No account"}</span></button>
        {open ? <div className="absolute right-0 top-11 z-30 w-72 border border-white/12 bg-[#151821] p-4 shadow-2xl"><p className="text-sm font-medium">Publish infrastructure</p><p className="mt-2 text-xs leading-5 text-(--secondary-text-color)">{sketchConnection ? `This sketch is associated with ${sketchConnection.name}.` : "The active account is selected by default. Choose an account to associate with this sketch."}</p>{connections.length ? <select className="mt-4 w-full border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-(--primary-color)" onChange={(event) => setConnectionId(event.target.value)} value={connectionId}>{connections.map((connection) => <option className="bg-[#151821]" key={connection.id} value={connection.id}>{connection.name}{connection.isActive ? " - active" : ""} ({connection.region})</option>)}</select> : <p className="mt-4 text-sm text-(--warning-color)">Add an AWS connection before publishing.</p>}<button className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-(--secondary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) disabled:opacity-50" disabled={!connectionId || publishing} onClick={() => void publish()} type="button">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}Publish sketch</button></div> : null}
    </div>;
}
