"use client";

import { Copy } from "lucide-react";
import { pushToast } from "@/lib/toast";

export default function ResourceDetails({ details }: { details: Record<string, unknown> }) {
    return <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {Object.entries(details).filter(([, value]) => value != null).map(([key, value]) => {
            const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
            const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
            return <div key={key} className="min-w-0">
                <dt className="flex items-center justify-between text-xs text-(--secondary-text-color)">{label}
                    <button type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`} className="grid h-7 w-7 shrink-0 place-items-center hover:bg-white/10" onClick={async () => {
                        try { await navigator.clipboard.writeText(text); pushToast({ message: `${label} copied.`, variant: "success" }); }
                        catch { pushToast({ message: "Unable to copy this value.", variant: "error" }); }
                    }}><Copy className="h-3.5 w-3.5" /></button>
                </dt>
                <dd className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-(--primary-text-color)">{text}</dd>
            </div>;
        })}
    </dl>;
}
