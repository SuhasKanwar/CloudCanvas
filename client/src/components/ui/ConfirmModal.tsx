"use client";

import Modal from "./Modal";

type ConfirmVariant = "danger" | "neutral" | "warning";

const buttonStyles: Record<ConfirmVariant, string> = {
    danger: "bg-(--danger-color) text-white hover:brightness-110",
    neutral: "bg-(--primary-color) text-(--primary-bg-color) hover:brightness-110",
    warning: "bg-(--warning-color) text-black hover:brightness-110",
};

export default function ConfirmModal({ cancelLabel = "Cancel", confirmLabel = "Confirm", confirming = false, description, onClose, onConfirm, open, title, variant = "neutral" }: { cancelLabel?: string; confirmLabel?: string; confirming?: boolean; description: string; onClose: () => void; onConfirm: () => void; open: boolean; title: string; variant?: ConfirmVariant }) {
    return <Modal description={description} dismissible={!confirming} onClose={onClose} open={open} size="compact" title={title}><div className="flex justify-end gap-2 bg-black/12 px-5 py-3 sm:px-7"><button className="h-9 rounded-none border border-white/10 px-4 text-sm text-(--secondary-text-color) transition hover:bg-white/6 hover:text-(--primary-text-color) disabled:opacity-50" data-modal-autofocus={!confirming} disabled={confirming} onClick={onClose} type="button">{cancelLabel}</button><button className={`h-9 rounded-none px-4 text-sm font-medium transition disabled:opacity-50 ${buttonStyles[variant]}`} disabled={confirming} onClick={onConfirm} type="button">{confirming ? "Working..." : confirmLabel}</button></div></Modal>;
}
