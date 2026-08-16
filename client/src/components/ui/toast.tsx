"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMemo, useSyncExternalStore, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { dismissToast, getToasts, pushToast, subscribe, type ToastInput, type ToastItem } from "@/lib/toast";

type ToastContextValue = {
    pushToast: (toast: ToastInput) => string;
    dismissToast: (id: string) => void;
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <>
            {children}
            {mounted ? createPortal(<ToastViewport toasts={toasts} />, document.body) : null}
        </>
    );
}

export function useToast(): ToastContextValue {
    return useMemo(() => ({
        pushToast,
        dismissToast,
    }), []);
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
    return (
        <div aria-label="Notifications" className="pointer-events-none fixed right-4 top-4 z-100 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
            {toasts.map((toast) => (
                <ToastCard key={toast.id} toast={toast} />
            ))}
        </div>
    );
}

function ToastCard({ toast }: { toast: ToastItem }) {
    const tone =
        toast.variant === "success"
            ? "border-(--success-color)/30 bg-(--success-color)/10 text-(--primary-text-color)"
            : toast.variant === "error"
                ? "border-(--danger-color)/30 bg-(--danger-color)/10 text-(--primary-text-color)"
                : "border-white/10 bg-black/30 text-(--primary-text-color)";

    return (
        <div className={`pointer-events-auto animate-toast-enter rounded-2xl border p-4 shadow-[0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur ${tone}`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-(--secondary-text-color)">
                        {toast.variant}
                    </p>
                    <p className="mt-2 text-sm leading-6">
                        {toast.message}
                    </p>
                </div>
                <button aria-label="Dismiss toast" className="rounded-full p-1 text-(--secondary-text-color) transition-colors hover:text-(--primary-text-color)" onClick={() => dismissToast(toast.id)} type="button">
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
