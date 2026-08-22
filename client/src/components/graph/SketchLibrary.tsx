"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FolderOpen, Loader2 } from "lucide-react";
import { getSketch, listSketches, type Sketch } from "@/lib/sketches";
import { useOutsideDismiss } from "@/hooks/useOutsideDismiss";

export default function SketchLibrary({ onLoad }: { onLoad: (sketch: Sketch) => void }) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [sketches, setSketches] = useState<Sketch[]>([]);
    const [loading, setLoading] = useState(false);
    const libraryRef = useOutsideDismiss<HTMLDivElement>(() => setOpen(false));

    useEffect(() => {
        if (!open || !session?.accessToken) return;
        setLoading(true);
        void listSketches(session.accessToken).then(setSketches).catch(() => undefined).finally(() => setLoading(false));
    }, [open, session?.accessToken]);

    const load = async (sketchId: string) => {
        if (!session?.accessToken) return;
        const sketch = await getSketch(session.accessToken, sketchId);
        onLoad(sketch);
        setOpen(false);
    };

    return <div className="relative" ref={libraryRef}>
        <button aria-expanded={open} className="inline-flex items-center gap-2 border border-white/12 px-3 py-2 text-sm text-(--primary-text-color) hover:bg-white/6" onClick={() => setOpen((current) => !current)} type="button"><FolderOpen className="h-4 w-4 text-(--secondary-text-color)" />Sketches</button>
        {open ? <div className="absolute right-0 top-11 z-30 w-72 border border-white/12 bg-[#151821] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium">Saved sketches {loading ? <Loader2 className="h-4 w-4 animate-spin text-(--secondary-text-color)" /> : null}</div>
            <div className="max-h-72 overflow-auto">
                {!loading && sketches.length === 0 ? <p className="px-4 py-6 text-sm text-(--secondary-text-color)">No saved sketches.</p> : null}
                {sketches.map((sketch) => <button className="block w-full border-b border-white/8 px-4 py-3 text-left hover:bg-white/6" key={sketch.id} onClick={() => void load(sketch.id)} type="button"><span className="block truncate text-sm text-(--primary-text-color)">{sketch.name}</span><span className="mt-1 block font-mono text-[10px] uppercase text-(--secondary-text-color)">{sketch.status}</span></button>)}
            </div>
        </div> : null}
    </div>;
}
