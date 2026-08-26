"use client";

import { AlertTriangle, HelpCircle, PencilLine } from "lucide-react";
import Modal from "./Modal";

type ConfirmVariant = "danger" | "neutral" | "warning";

const styles: Record<ConfirmVariant, { button: string; icon: typeof AlertTriangle; tone: string }> = {
    danger: { button: "bg-(--danger-color) text-white hover:brightness-110", icon: AlertTriangle, tone: "border-(--danger-color)/30 bg-(--danger-color)/10 text-(--danger-color)" },
    neutral: { button: "bg-(--primary-color) text-(--primary-bg-color) hover:brightness-110", icon: PencilLine, tone: "border-(--primary-color)/30 bg-(--primary-color)/10 text-(--primary-color)" },
    warning: { button: "bg-(--warning-color) text-black hover:brightness-110", icon: HelpCircle, tone: "border-(--warning-color)/30 bg-(--warning-color)/10 text-(--warning-color)" },
};

export default function ConfirmModal({ cancelLabel = "Cancel", confirmLabel = "Confirm", confirming = false, description, onClose, onConfirm, open, title, variant = "neutral" }: { cancelLabel?: string; confirmLabel?: string; confirming?: boolean; description: string; onClose: () => void; onConfirm: () => void; open: boolean; title: string; variant?: ConfirmVariant }) {
    const style = styles[variant];
    const Icon = style.icon;
    return <Modal description={description} dismissible={!confirming} onClose={onClose} open={open} size="compact" title={title}><div className="px-5 py-6 sm:px-7"><span className={`grid h-10 w-10 place-items-center rounded-none border ${style.tone}`}><Icon className="h-5 w-5" /></span><div className="mt-8 flex justify-end gap-2 border-t border-white/8 pt-5"><button className="h-9 rounded-none border border-white/10 px-4 text-sm text-(--secondary-text-color) transition hover:bg-white/6 hover:text-(--primary-text-color) disabled:opacity-50" data-modal-autofocus={!confirming} disabled={confirming} onClick={onClose} type="button">{cancelLabel}</button><button className={`h-9 rounded-none px-4 text-sm font-medium shadow-lg transition disabled:opacity-50 ${style.button}`} disabled={confirming} onClick={onConfirm} type="button">{confirming ? "Working..." : confirmLabel}</button></div></div></Modal>;
}
