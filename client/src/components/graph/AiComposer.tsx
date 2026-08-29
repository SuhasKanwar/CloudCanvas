"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, CheckCircle2, Loader2, Mic, PanelRightClose, Send, Sparkles, Square, Trash2, Wand2 } from "lucide-react";

import ConfirmModal from "@/components/ui/ConfirmModal";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { md } from "@/lib/markdown";
import { clearSketchConversation, getSketchConversation, sendSketchConversationMessage, type SketchConversationMessage } from "@/lib/sketches";
import type { GraphDefinition } from "@cloudcanvas/graph-contract";

function resizeInput(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
}

export default function AiComposer({ onApplyBlueprint, sketchId }: { onApplyBlueprint: (build: Omit<GraphDefinition, "schemaVersion">) => Promise<void>; sketchId: string }) {
    const { data: session } = useSession();
    const accessToken = session?.accessToken;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<SketchConversationMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingConversation, setLoadingConversation] = useState(true);
    const [applyingBuildId, setApplyingBuildId] = useState<string | null>(null);
    const [clearing, setClearing] = useState(false);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const appendTranscript = useCallback((transcript: string) => setQuery((current) => current ? `${current} ${transcript}` : transcript), []);
    const { isListening, isSupported: speechInputSupported, start, stop } = useSpeechRecognition(appendTranscript);

    const loadConversation = useCallback(async () => {
        if (!accessToken) return;
        setLoadingConversation(true);
        try {
            const conversation = await getSketchConversation(accessToken, sketchId);
            setMessages(conversation.messages);
            setError(null);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Unable to load the AI conversation.");
        } finally {
            setLoadingConversation(false);
        }
    }, [accessToken, sketchId]);

    useEffect(() => {
        const timeout = window.setTimeout(() => void loadConversation(), 0);
        return () => window.clearTimeout(timeout);
    }, [loadConversation]);

    useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [loading, messages, open]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const prompt = query.trim();
        if (!accessToken || !prompt || loading) return;
        setQuery("");
        setError(null);
        setLoading(true);
        try {
            const response = await sendSketchConversationMessage(accessToken, sketchId, prompt);
            setMessages((current) => [...current, response.userMessage, response.assistantMessage]);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "AI request failed.");
            void loadConversation();
        } finally {
            setLoading(false);
        }
    };

    const applyBlueprint = async (message: SketchConversationMessage) => {
        if (!message.build || applyingBuildId) return;
        setApplyingBuildId(message.id);
        setError(null);
        try {
            await onApplyBlueprint(message.build);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Unable to apply the blueprint.");
        } finally {
            setApplyingBuildId(null);
        }
    };

    const clearConversation = async () => {
        if (!accessToken || clearing) return;
        setClearing(true);
        setError(null);
        try {
            await clearSketchConversation(accessToken, sketchId);
            setMessages([]);
            setConfirmingClear(false);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Unable to clear the conversation.");
        } finally {
            setClearing(false);
        }
    };

    return <div className="absolute right-4 top-18 z-20">
        <AnimatePresence initial={false}>
            {open ? <motion.aside animate={{ opacity: 1, x: 0 }} className="flex h-[min(35rem,calc(100dvh-7.5rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-none border border-white/12 bg-[var(--surface-color)] shadow-2xl shadow-black/45" exit={{ opacity: 0, x: 18 }} initial={{ opacity: 0, scale: 0.99, x: 18 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-none border border-(--accent-color)/30 bg-(--accent-color)/10 text-(--accent-color)"><Bot className="h-4 w-4" /></span><div><p className="font-(family-name:--font-display) text-sm font-semibold text-(--primary-text-color)">CloudCanvas AI</p><p className="text-[11px] text-(--secondary-text-color)">Sketch conversation</p></div></div><div className="flex items-center"><button aria-label="Clear conversation" className="grid h-8 w-8 place-items-center rounded-none text-(--secondary-text-color) transition hover:bg-(--danger-color)/10 hover:text-(--danger-color) disabled:opacity-40" disabled={clearing || loading || messages.length === 0} onClick={() => setConfirmingClear(true)} title="Clear conversation" type="button"><Trash2 className="h-4 w-4" /></button><button aria-label="Collapse AI assistant" className="grid h-8 w-8 place-items-center rounded-none text-(--secondary-text-color) transition hover:bg-white/8 hover:text-(--primary-text-color)" onClick={() => setOpen(false)} title="Collapse" type="button"><PanelRightClose className="h-4 w-4" /></button></div></header>
                <div aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-auto p-3" ref={scrollRef}>{loadingConversation ? <div className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Loader2 className="h-3.5 w-3.5 animate-spin text-(--primary-color)" />Loading conversation</div> : null}{!loadingConversation && messages.length === 0 ? <div className="border-l-2 border-(--accent-color) bg-white/4 px-3 py-2 text-sm leading-5 text-(--secondary-text-color)">Ask about this infrastructure or describe what you want to build.</div> : null}{messages.map((message) => <ChatMessage applying={applyingBuildId === message.id} key={message.id} message={message} onApply={() => void applyBlueprint(message)} />)}{loading ? <div className="flex items-center gap-2 text-xs text-(--secondary-text-color)"><Loader2 className="h-3.5 w-3.5 animate-spin text-(--secondary-color)" />Thinking</div> : null}{error ? <p className="border-l-2 border-(--danger-color) bg-(--danger-color)/8 px-3 py-2 text-xs leading-5 text-(--danger-color)">{error}</p> : null}</div>
                <form className="border-t border-white/10 bg-black/12 p-2" onSubmit={submit}><div className="border border-white/12 bg-black/20 transition focus-within:border-(--primary-color)"><textarea aria-label="Ask CloudCanvas AI" className="block min-h-10 max-h-40 w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 text-(--primary-text-color) outline-none placeholder:text-(--muted-text-color)" onChange={(event) => { setQuery(event.target.value); resizeInput(event.currentTarget); }} onInput={(event) => resizeInput(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about this sketch" rows={1} value={query} /><div className="flex items-center justify-between border-t border-white/8 px-2 py-1.5"><div>{speechInputSupported ? <button aria-label={isListening ? "Stop voice input" : "Start voice input"} className={`grid h-8 w-8 place-items-center rounded-none transition ${isListening ? "bg-(--danger-color)/18 text-(--danger-color)" : "text-(--secondary-text-color) hover:bg-white/7 hover:text-(--primary-text-color)"}`} onClick={isListening ? stop : start} type="button">{isListening ? <Square className="h-3 w-3" /> : <Mic className="h-4 w-4" />}</button> : null}</div><button aria-label="Send AI request" className="inline-flex h-8 items-center gap-2 rounded-none bg-(--primary-color) px-3 text-xs font-medium text-(--primary-bg-color) transition hover:brightness-110 disabled:opacity-40" disabled={loading || !query.trim()} type="submit"><Send className="h-3.5 w-3.5" />Send</button></div></div></form>
            </motion.aside> : <motion.button animate={{ opacity: 1, scale: 1 }} aria-label="Open CloudCanvas AI" className="inline-flex items-center gap-2 rounded-none border border-(--accent-color)/35 bg-[var(--surface-color)] px-3 py-2 text-sm font-medium text-(--primary-text-color) shadow-lg shadow-black/25 transition hover:border-(--accent-color) hover:bg-white/6" initial={{ opacity: 0, scale: 0.96 }} onClick={() => setOpen(true)} type="button"><Sparkles className="h-4 w-4 text-(--accent-color)" />AI assistant</motion.button>}
        </AnimatePresence>
        <ConfirmModal confirmLabel="Clear conversation" confirming={clearing} description="Permanently delete every message in this sketch conversation. This cannot be undone." onClose={() => setConfirmingClear(false)} onConfirm={() => void clearConversation()} open={confirmingClear} title="Clear conversation?" variant="danger" />
    </div>;
}

function ChatMessage({ applying, message, onApply }: { applying: boolean; message: SketchConversationMessage; onApply: () => void }) {
    const isUser = message.role === "USER";
    const nodeCount = message.type === "BUILD" && Array.isArray(message.build?.nodes) ? message.build.nodes.length : 0;
    return <motion.article animate={{ opacity: 1, y: 0 }} className={`max-w-[92%] border px-3 py-2.5 text-sm leading-6 ${isUser ? "ml-auto border-(--secondary-color)/45 bg-(--secondary-color) text-[#201508]" : "border-white/10 bg-white/4 text-(--primary-text-color)"}`} initial={{ opacity: 0, y: 5 }} transition={{ duration: 0.16 }}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-medium uppercase tracking-[0.12em] opacity-65"><span>{isUser ? "You" : "CloudCanvas"}</span>{message.type === "BUILD" ? <span className="inline-flex items-center gap-1"><Wand2 className="h-3 w-3" />{nodeCount} node{nodeCount === 1 ? "" : "s"}</span> : null}</div>{isUser ? <p className="whitespace-pre-wrap">{message.content}</p> : <div className="[&_a]:text-(--secondary-color) [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_code]:bg-black/25 [&_code]:px-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:bg-black/25 [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: md.render(message.content) }} />}{message.type === "BUILD" ? <div className="mt-3 flex items-center justify-between gap-2 border-t border-current/15 pt-2 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Blueprint saved to this conversation<button className="ml-auto border border-current/25 px-2 py-1 text-[11px] font-medium transition hover:bg-white/10 disabled:opacity-50" disabled={applying} onClick={onApply} type="button">{applying ? "Applying..." : "Apply to canvas"}</button></div> : null}</motion.article>;
}
