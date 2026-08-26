"use client";

import { Info } from "lucide-react";

type Props = { changes: Array<{ label: string }> };

export default function DeploymentChangeInfo({ changes }: Props) {
    if (!changes.length) return null;
    return <span className="group relative inline-flex"><button aria-label="Show pending deployment changes" className="grid h-4 w-4 place-items-center text-amber-200/80 hover:text-amber-100" onClick={(event) => event.stopPropagation()} type="button"><Info className="h-3.5 w-3.5" /></button><span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-52 -translate-x-1/2 border border-white/12 bg-[#151821] p-3 text-left text-xs leading-5 text-(--primary-text-color) shadow-xl group-focus-within:block group-hover:block"><span className="block font-medium">Will apply on publish</span><span className="mt-1 block text-(--secondary-text-color)">{changes.map((change) => change.label).join(", ")}</span></span></span>;
}
