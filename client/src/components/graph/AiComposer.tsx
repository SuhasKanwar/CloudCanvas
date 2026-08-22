"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Loader2, PanelRightClose, Send, Sparkles } from "lucide-react";
import { createAiSketch, type AiChatMessage, type Sketch } from "@/lib/sketches";

export default function AiComposer({ onBuild }: { onBuild: (sketch: Sketch) => void }) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const prompt = query.trim();
        if (!session?.accessToken || !prompt || loading) return;
        setQuery("");
        setError(null);
        setLoading(true);
        setMessages((current) => [...current, { role: "user", content: prompt }]);
        try {
            const response = await createAiSketch(session.accessToken, prompt, messages);
            setMessages((current) => [...current, { role: "assistant", content: response.message }]);
            if (response.type === "build") onBuild(response.sketch);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "AI request failed.");
        } finally {
            setLoading(false);
        }
    };

    return <div className="absolute right-4 top-18 z-20">
        <AnimatePresence initial={false}>
            {open ? <motion.aside animate={{ opacity: 1, x: 0 }} className="flex h-[min(40rem,calc(100dvh-7.5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-white/12 bg-[#121822]/95 shadow-2xl shadow-black/45 backdrop-blur-xl" exit={{ opacity: 0, x: 18 }} initial={{ opacity: 0, x: 18 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="flex items-center gap-2 font-serif text-base font-semibold text-(--primary-text-color)"><span className="grid h-7 w-7 place-items-center rounded-md bg-(--accent-color)/15 text-(--accent-color)"><Bot className="h-4 w-4" /></span>CloudCanvas AI</span><button aria-label="Collapse AI assistant" className="grid h-8 w-8 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-white/8 hover:text-(--primary-text-color)" onClick={() => setOpen(false)} type="button"><PanelRightClose className="h-4 w-4" /></button></header>
                <div aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-auto p-4">{messages.map((message, index) => <motion.div animate={{ opacity: 1, y: 0 }} className={`max-w-[90%] rounded-md px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-(--secondary-color) text-[#201508]" : "border border-white/10 bg-white/5 text-(--primary-text-color)"}`} initial={{ opacity: 0, y: 5 }} key={`${message.role}-${index}`} transition={{ duration: 0.16 }}>{message.content}</motion.div>)}{loading ? <div className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Loader2 className="h-3.5 w-3.5 animate-spin text-(--secondary-color)" />Thinking</div> : null}{error ? <p className="rounded-md border border-(--danger-color)/35 bg-(--danger-color)/8 px-3 py-2 text-xs leading-5 text-(--danger-color)">{error}</p> : null}</div>
                <form className="border-t border-white/10 p-3" onSubmit={submit}><div className="flex items-end gap-2 rounded-md border border-white/12 bg-black/20 p-2 focus-within:border-(--primary-color) focus-within:ring-2 focus-within:ring-(--primary-color)/12"><textarea aria-label="Ask CloudCanvas AI" className="min-h-10 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-(--primary-text-color) outline-none placeholder:text-(--muted-text-color)" onChange={(event) => setQuery(event.target.value)} placeholder="Ask CloudCanvas AI" rows={2} value={query} /><button aria-label="Send AI request" className="grid h-9 w-9 place-items-center rounded-md bg-(--primary-color) text-(--primary-bg-color) transition hover:brightness-110 disabled:opacity-40" disabled={loading || !query.trim()} type="submit"><Send className="h-4 w-4" /></button></div></form>
            </motion.aside> : <motion.button animate={{ opacity: 1, scale: 1 }} aria-label="Open CloudCanvas AI" className="inline-flex items-center gap-2 rounded-md border border-(--accent-color)/35 bg-[#151821]/95 px-3 py-2 text-sm font-medium text-(--primary-text-color) shadow-lg shadow-black/25 backdrop-blur transition hover:border-(--accent-color) hover:bg-[#1a202b]" initial={{ opacity: 0, scale: 0.96 }} onClick={() => setOpen(true)} type="button"><Sparkles className="h-4 w-4 text-(--accent-color)" />AI assistant</motion.button>}
        </AnimatePresence>
    </div>;
}
