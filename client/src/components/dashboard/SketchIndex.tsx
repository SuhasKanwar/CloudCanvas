"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, FilePlus2, Loader2, Trash2 } from "lucide-react";
import { createSketch, deleteSketch, listSketches, type Sketch } from "@/lib/sketches";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function SketchIndex({ onOpenAwsSettings }: { onOpenAwsSettings: () => void }) {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [sketches, setSketches] = useState<Sketch[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [sketchToDelete, setSketchToDelete] = useState<Sketch | null>(null);

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

    const remove = async () => {
        if (!session?.accessToken || !sketchToDelete) return;
        setDeleting(true);
        try {
            await deleteSketch(session.accessToken, sketchToDelete.id);
            setSketches((current) => current.filter((entry) => entry.id !== sketchToDelete.id));
            setSketchToDelete(null);
        } finally {
            setDeleting(false);
        }
    };

    return <section className="dashboard-enter mx-auto w-full max-w-6xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8">
            <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--secondary-color)">Workspace</p>
                <h1 className="mt-3 text-3xl font-semibold text-(--primary-text-color)">Infrastructure sketches</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-(--secondary-text-color)">Create, open, and deploy AWS resource graphs from one workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm text-(--secondary-text-color) transition hover:border-white/20 hover:bg-white/6 hover:text-(--primary-text-color)" onClick={onOpenAwsSettings} type="button">AWS connections</button>
                <button className="inline-flex items-center gap-2 rounded-md bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) shadow-lg shadow-(--primary-color)/15 transition hover:brightness-110 disabled:opacity-60" disabled={creating || !session?.accessToken} onClick={() => void create()} type="button">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}New sketch</button>
            </div>
        </div>
        <div className="dashboard-stagger mt-7 divide-y divide-white/10 border-y border-white/10 bg-black/8">
            {loading ? <div className="flex items-center gap-2 py-10 text-sm text-(--secondary-text-color)"><Loader2 className="h-4 w-4 animate-spin" />Loading sketches</div> : null}
            {!loading && sketches.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-(--secondary-text-color)">No sketches yet.</p><button className="mt-4 text-sm text-(--secondary-color) hover:text-(--primary-text-color)" onClick={() => void create()} type="button">Create your first sketch</button></div> : null}
            {sketches.map((sketch) => <div className="dashboard-interactive flex items-center gap-4 px-4 py-4 hover:bg-white/4 sm:px-5" key={sketch.id}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-[var(--surface-strong-color)] text-(--secondary-color)"><FilePlus2 className="h-4 w-4" /></span><Link className="min-w-0 flex-1" href={`/dashboard/sketches/${sketch.id}`}><p className="truncate font-(family-name:--font-display) text-sm font-semibold text-(--primary-text-color)">{sketch.name}</p><p className="mt-1 font-mono text-[11px] uppercase text-(--secondary-text-color)">{sketch.status} · updated {new Date(sketch.updatedAt).toLocaleDateString()}</p></Link>
                <Link aria-label={`Open ${sketch.name}`} className="grid h-9 w-9 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-white/7 hover:text-(--primary-text-color)" href={`/dashboard/sketches/${sketch.id}`} title="Open sketch"><ArrowRight className="h-4 w-4" /></Link>
                <button aria-label={`Delete ${sketch.name}`} className="grid h-9 w-9 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-(--danger-color)/10 hover:text-(--danger-color)" onClick={() => setSketchToDelete(sketch)} title="Delete sketch" type="button"><Trash2 className="h-4 w-4" /></button>
            </div>)}
        </div>
        <ConfirmModal confirmLabel="Delete sketch" confirming={deleting} description={`Delete ${sketchToDelete?.name ?? "this sketch"} and all of its managed AWS resources. This cannot be undone.`} onClose={() => setSketchToDelete(null)} onConfirm={() => void remove()} open={Boolean(sketchToDelete)} title="Delete sketch?" variant="danger" />
    </section>;
}
