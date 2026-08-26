"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
    children: ReactNode;
    description?: string;
    dismissible?: boolean;
    onClose: () => void;
    open: boolean;
    size?: "default" | "compact";
    title: string;
};

export default function Modal({ children, description = "Changes are applied to this sketch immediately.", dismissible = true, onClose, open, size = "default", title }: Props) {
    const dialogRef = useRef<HTMLElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();

    useEffect(() => {
        if (!open || !dismissible) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [dismissible, onClose, open]);

    useEffect(() => {
        if (!open) return;
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("[data-modal-autofocus], button, input, select, textarea")?.focus());
        return () => {
            window.cancelAnimationFrame(frame);
            previousFocusRef.current?.focus();
        };
    }, [open]);

    return <AnimatePresence>{open ? <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3 sm:p-6" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={dismissible ? onClose : undefined}>
        <motion.section animate={{ opacity: 1, scale: 1, y: 0 }} aria-labelledby={titleId} aria-modal="true" className={`flex w-full flex-col overflow-hidden rounded-none border border-white/14 border-t-2 border-t-[var(--primary-color)] bg-[#10151d] shadow-[0_32px_96px_rgba(0,0,0,0.68)] ${size === "compact" ? "max-w-md" : "h-[min(88vh,52rem)] max-w-6xl"}`} exit={{ opacity: 0, scale: 0.99, y: 10 }} initial={{ opacity: 0, scale: 0.99, y: 10 }} onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog" transition={{ duration: 0.16, ease: "easeOut" }}>
            <header className="flex min-h-16 items-center justify-between gap-5 border-b border-white/10 bg-black/18 px-5 sm:px-7"><div className="min-w-0"><h2 className="font-(family-name:--font-display) text-base font-semibold text-(--primary-text-color)" id={titleId}>{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-(--secondary-text-color)">{description}</p></div>{dismissible ? <button aria-label="Close dialog" className="grid h-9 w-9 shrink-0 place-items-center rounded-none border border-white/10 text-(--secondary-text-color) transition hover:border-white/25 hover:bg-white/7 hover:text-(--primary-text-color)" data-modal-autofocus onClick={onClose} type="button"><X className="h-4 w-4" /></button> : null}</header>
            <div className="min-h-0 flex-1">{children}</div>
        </motion.section>
    </motion.div> : null}</AnimatePresence>;
}
