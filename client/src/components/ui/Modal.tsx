"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

type Props = {
    children: ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
};

export default function Modal({ children, onClose, open, title }: Props) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose, open]);

    return <AnimatePresence>{open ? <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-6" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={onClose}>
        <motion.section animate={{ opacity: 1, scale: 1, y: 0 }} aria-label={title} aria-modal="true" className="flex h-[min(88vh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/12 bg-[#11161f] shadow-2xl shadow-black/50" exit={{ opacity: 0, scale: 0.98, y: 12 }} initial={{ opacity: 0, scale: 0.98, y: 12 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" transition={{ duration: 0.18, ease: "easeOut" }}>
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7"><div><p className="font-serif text-lg font-semibold text-(--primary-text-color)">{title}</p><p className="mt-0.5 text-xs text-(--secondary-text-color)">Changes are applied to this sketch immediately.</p></div><button aria-label="Close configuration" className="grid h-9 w-9 place-items-center rounded-md text-(--secondary-text-color) transition hover:bg-white/8 hover:text-(--primary-text-color)" onClick={onClose} type="button"><X className="h-4 w-4" /></button></header>
            <div className="min-h-0 flex-1">{children}</div>
        </motion.section>
    </motion.div> : null}</AnimatePresence>;
}
