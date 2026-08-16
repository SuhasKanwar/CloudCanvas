"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCcw } from "lucide-react";
import StatusScreen from "@/components/ui/StatusScreen";

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error;
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <StatusScreen
            action={(
                <>
                    <button className="inline-flex items-center gap-2 rounded-2xl bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color)" onClick={reset} type="button">
                        Retry
                        <RefreshCcw className="h-4 w-4" />
                    </button>
                    <Link className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-(--primary-text-color)" href="/">
                        Go home
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </>
            )}
            description={error.message || "The app hit an unexpected error."}
            eyebrow="Application error"
            title="Something went wrong."
        >
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--secondary-text-color)">
                <AlertTriangle className="h-4 w-4 text-(--danger-color)" />
                The error boundary caught this page before it could recover.
            </div>
        </StatusScreen>
    );
}
