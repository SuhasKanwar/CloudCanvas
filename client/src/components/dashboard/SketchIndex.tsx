"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, FilePlus2, Loader2, Trash2 } from "lucide-react";
import { createSketch, deleteSketch, listSketches, type Sketch } from "@/lib/sketches";

export default function SketchIndex({ onOpenAwsSettings }: { onOpenAwsSettings: () => void }) {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [sketches, setSketches] = useState<Sketch[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (status === "loading") return;
        if (!session?.accessToken) return;
        void listSketches(session.accessToken)
            .then(setSketches)
            .catch(() => undefined)
            .finally(() => setLoading(false));
    }, [session?.accessToken, status]);

    const create = async () => {
        if (!session?.accessToken) return;
        setCreating(true);
        try {
            const sketch = await createSketch(session.accessToken);
            router.push(`/dashboard/sketches/${sketch.id}`);
        } finally {
            setCreating(false);
        }
    };

    const remove = async (sketch: Sketch) => {
        if (!session?.accessToken || !window.confirm(`Delete ${sketch.name}?`)) return;
        await deleteSketch(session.accessToken, sketch.id);
        setSketches((current) => current.filter((entry) => entry.id !== sketch.id));
    };

    return <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-7">
            <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--secondary-color)">Workspace</p>
                <h1 className="mt-2 text-3xl text-(--primary-text-color)">Infrastructure sketches</h1>
                <p className="mt-2 text-sm text-(--secondary-text-color)">Create, open, and deploy an AWS resource graph.</p>
            </div>
            <div className="flex gap-2">
                <button className="border border-white/10 px-3 py-2 text-sm text-(--secondary-text-color) hover:bg-white/6 hover:text-(--primary-text-color)" onClick={onOpenAwsSettings} type="button">AWS connections</button>
                <button className="inline-flex items-center gap-2 bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) disabled:opacity-60" disabled={creating || !session?.accessToken} onClick={() => void create()} type="button">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}New sketch</button>
            </div>
        </div>
        <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {loading ? <div className="flex items-center gap-2 py-10 text-sm text-(--secondary-text-color)"><Loader2 className="h-4 w-4 animate-spin" />Loading sketches</div> : null}
            {!loading && sketches.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-(--secondary-text-color)">No sketches yet.</p><button className="mt-4 text-sm text-(--secondary-color) hover:text-(--primary-text-color)" onClick={() => void create()} type="button">Create your first sketch</button></div> : null}
            {sketches.map((sketch) => <div className="flex items-center gap-4 py-4" key={sketch.id}>
                <Link className="min-w-0 flex-1" href={`/dashboard/sketches/${sketch.id}`}><p className="truncate text-sm font-medium text-(--primary-text-color)">{sketch.name}</p><p className="mt-1 font-mono text-[11px] uppercase text-(--secondary-text-color)">{sketch.status} · updated {new Date(sketch.updatedAt).toLocaleDateString()}</p></Link>
                <Link aria-label={`Open ${sketch.name}`} className="p-2 text-(--secondary-text-color) hover:text-(--primary-text-color)" href={`/dashboard/sketches/${sketch.id}`} title="Open sketch"><ArrowRight className="h-4 w-4" /></Link>
                <button aria-label={`Delete ${sketch.name}`} className="p-2 text-(--secondary-text-color) hover:text-(--danger-color)" onClick={() => void remove(sketch)} title="Delete sketch" type="button"><Trash2 className="h-4 w-4" /></button>
            </div>)}
        </div>
    </section>;
}
