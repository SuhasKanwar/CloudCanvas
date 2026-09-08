"use client";

import { useState } from "react";

export default function LambdaCodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const [error, setError] = useState("");
    const [fileName, setFileName] = useState("");
    return <div className="space-y-2">
        <label className="block text-xs text-(--secondary-text-color)">Deployment package (.zip)
            <input type="file" accept=".zip,application/zip" className="mt-2 block w-full border border-white/15 p-3 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-(--primary-color)" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setError("");
                if (!file.name.toLowerCase().endsWith(".zip") || file.size > 5 * 1024 * 1024) {
                    setError("Choose a ZIP package up to 5 MB.");
                    return;
                }
                try {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error("The file is not a ZIP archive.");
                    let binary = "";
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    onChange(btoa(binary));
                    setFileName(file.name);
                } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "Unable to read the package.");
                }
            }} />
        </label>
        {value && <p className="text-xs text-(--secondary-text-color)">{fileName || "Saved deployment package"} ({Math.round(value.length * 0.75 / 1024)} KB)</p>}
        {error && <p role="alert" className="text-xs text-(--danger-color)">{error}</p>}
    </div>;
}
