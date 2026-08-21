"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Sparkles } from "lucide-react";
import { createAiSketch, type Sketch } from "@/lib/sketches";

export default function AiComposer({ onBuild }: { onBuild: (sketch: Sketch) => void }) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session?.accessToken || !query.trim()) return;
        try {
            setLoading(true);
            const response = await createAiSketch(session.accessToken, query);
            setMessage(response.message);
            if (response.type === "build") onBuild(response.sketch);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "AI request failed.");
        } finally {
            setLoading(false);
        }
    };

    return <div className="relative">
        <button aria-expanded={open} className="inline-flex items-center gap-2 border border-white/12 px-3 py-2 text-sm text-(--primary-text-color) hover:bg-white/6" onClick={() => setOpen((current) => !current)} type="button"><Sparkles className="h-4 w-4 text-(--secondary-color)" />AI</button>
        {open ? <form className="absolute right-0 top-11 z-30 w-80 border border-white/12 bg-[#151821] p-4 shadow-2xl" onSubmit={submit}>
            <label className="text-sm font-medium text-(--primary-text-color)" htmlFor="ai-query">Describe infrastructure</label>
            <textarea className="mt-3 min-h-28 w-full resize-none border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-(--primary-color)" id="ai-query" onChange={(event) => setQuery(event.target.value)} placeholder="Create a private S3 bucket and a queue for uploads." value={query} />
            {message ? <p className="mt-3 text-xs leading-5 text-(--secondary-text-color)">{message}</p> : null}
            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-(--primary-color) px-3 py-2 text-sm font-medium text-(--primary-bg-color) disabled:opacity-60" disabled={loading || !query.trim()} type="submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate graph</button>
        </form> : null}
    </div>;
}
