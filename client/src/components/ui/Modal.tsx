"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

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
    useEffect(() => {
        if (!open || !dismissible) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [dismissible, onClose, open]);

    return <AnimatePresence>{open ? <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-3 backdrop-blur-sm sm:p-6" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={dismissible ? onClose : undefined}>
        <motion.section animate={{ opacity: 1, scale: 1, y: 0 }} aria-label={title} aria-modal="true" className={`flex w-full flex-col overflow-hidden rounded-lg border border-white/12 bg-[var(--surface-color)] shadow-[0_28px_90px_rgba(0,0,0,0.56)] ${size === "compact" ? "max-w-md" : "h-[min(88vh,52rem)] max-w-6xl"}`} exit={{ opacity: 0, scale: 0.985, y: 16 }} initial={{ opacity: 0, scale: 0.985, y: 16 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" transition={{ duration: 0.2, ease: "easeOut" }}>
            <header className="flex items-start justify-between gap-5 border-b border-white/10 bg-black/10 px-5 py-4 sm:px-7 sm:py-5"><div className="min-w-0"><p className="font-(family-name:--font-display) text-lg font-semibold text-(--primary-text-color)">{title}</p><p className="mt-1 max-w-2xl text-sm leading-5 text-(--secondary-text-color)">{description}</p></div>{dismissible ? <button aria-label="Close dialog" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-transparent text-(--secondary-text-color) transition hover:border-white/10 hover:bg-white/6 hover:text-(--primary-text-color)" onClick={onClose} type="button"><X className="h-4 w-4" /></button> : null}</header>
            <div className="min-h-0 flex-1">{children}</div>
        </motion.section>
    </motion.div> : null}</AnimatePresence>;
}
