"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import type { AwsResourceCatalog } from "@/lib/aws";

type InstanceType = AwsResourceCatalog["instanceTypes"][number];

function specs(option: InstanceType) {
    return [
        option.vcpus == null ? "CPU unavailable" : `${option.vcpus} vCPU${option.vcpus === 1 ? "" : "s"}`,
        option.memoryMiB == null ? "Memory unavailable" : `${option.memoryMiB / 1024} GiB RAM`,
        option.architectures.join(" / ") || "Architecture unavailable",
    ].join(" · ");
}

export default function InstanceTypeField({ options, value, onChange }: {
    options: InstanceType[];
    value: string;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [family, setFamily] = useState("");
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const id = useId();
    const selected = options.find((option) => option.name === value);
    const families = [...new Set(options.map((option) => option.name.split(".")[0]))].sort();
    const filtered = options.filter((option) => (!family || option.name.split(".")[0] === family)
        && `${option.name} ${specs(option)}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    useEffect(() => {
        if (!open) return;
        searchInput.current?.focus();
        const dismiss = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as globalThis.Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
    }, [open]);

    return <div ref={root} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
        }
    }}>
        <span id={`${id}-label`} className="text-xs font-medium text-(--secondary-text-color)">Instance type</span>
        <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-selection`} aria-expanded={open} aria-controls={`${id}-options`}
            className="mt-2 flex min-h-16 w-full items-center gap-3 border border-white/15 bg-black/20 px-3 py-3 text-left transition hover:border-white/30 focus-visible:outline-2 focus-visible:outline-(--primary-color) disabled:cursor-not-allowed"
            onClick={() => { setOpen(!open); setSearch(""); setFamily(""); }}>
            <Cpu className="h-5 w-5 shrink-0 text-(--primary-color)" />
            <span id={`${id}-selection`} className="min-w-0 flex-1"><span className="block break-all font-mono text-sm font-semibold text-(--primary-text-color)">{value || "Choose an instance type"}</span>
                {selected && <span className="mt-1 block text-xs text-(--secondary-text-color)">{specs(selected)}</span>}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-(--secondary-text-color) transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div id={`${id}-options`} role="region" aria-label="Instance type options" className="border border-t-0 border-white/15 bg-(--surface-color)">
            <div className="grid gap-2 border-b border-white/10 p-3 sm:grid-cols-[1fr_9rem]">
                <label className="flex min-w-0 items-center gap-2 border border-white/15 px-2 focus-within:border-(--primary-color)">
                    <Search className="h-4 w-4 shrink-0 text-(--secondary-text-color)" />
                    <input ref={searchInput} aria-label="Search instance types" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search instance types" className="h-9 min-w-0 w-full bg-transparent text-sm text-(--primary-text-color) outline-none" />
                </label>
                <select aria-label="Instance family" value={family} onChange={(event) => setFamily(event.target.value)} className="h-9 min-w-0 border border-white/15 bg-(--surface-color) px-2 text-sm text-(--primary-text-color)">
                    <option value="">All families</option>{families.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <p className="px-3 py-2 text-xs text-(--secondary-text-color)" role="status">{filtered.length} instance types</p>
            <div className="max-h-72 overflow-y-auto overscroll-contain">
                {filtered.map((option) => <button key={option.name} type="button" aria-pressed={option.name === value}
                    className={`flex w-full items-start gap-3 border-t border-white/8 p-3 text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--primary-color) ${option.name === value ? "bg-(--primary-color)/10" : ""}`}
                    onClick={() => { onChange(option.name); setOpen(false); trigger.current?.focus(); }}>
                    <span className="min-w-0 flex-1"><span className="block break-all font-mono text-sm font-semibold text-(--primary-text-color)">{option.name}</span>
                        <span className="mt-1 block text-xs text-(--secondary-text-color)">{specs(option)}</span>
                        <span className="mt-1 block text-xs text-(--muted-text-color)">{option.networkPerformance || "Network unavailable"} · {option.instanceStorageGiB == null ? "Storage details unavailable" : option.instanceStorageGiB > 0 ? `${option.instanceStorageGiB} GB local storage` : "EBS only"}</span>
                    </span>
                    <span className="h-4 w-4 shrink-0 text-(--primary-color)">{option.name === value && <Check className="h-4 w-4" />}</span>
                </button>)}
                {!filtered.length && <p className="px-3 pb-4 text-sm text-(--secondary-text-color)">{options.length ? "No matching instance types. Try another search or family." : "No instance types are available in this catalog."}</p>}
            </div>
        </div>}
    </div>;
}
