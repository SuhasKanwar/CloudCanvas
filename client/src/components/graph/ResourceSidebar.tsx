"use client";

import { Settings2 } from "lucide-react";
import type { AwsService } from "@cloudcanvas/graph-contract";
import { awsServiceOptions } from "./resourceNode";

export default function ResourceSidebar({ disabled, onAdd, onOpenAwsSettings }: { disabled?: boolean; onAdd: (service: AwsService) => void; onOpenAwsSettings: () => void }) {
    return <aside className="min-h-0 overflow-auto border-r border-white/10 px-3 py-4">
        <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-(--secondary-text-color)">AWS services</p>
        <div className="mt-3 space-y-1">
            {awsServiceOptions.map((option) => {
                const Icon = option.icon;
                return <button className="flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left text-sm text-(--secondary-text-color) transition hover:bg-white/6 hover:text-(--primary-text-color) disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} key={option.service} onClick={() => onAdd(option.service)} type="button"><Icon className={`h-4 w-4 ${option.accent}`} /><span>{option.title}</span></button>;
            })}
        </div>
        <button className="mt-6 flex w-full items-center gap-2 border-t border-white/10 px-2 pt-4 text-sm text-(--secondary-text-color) transition hover:text-(--primary-text-color)" onClick={onOpenAwsSettings} type="button"><Settings2 className="h-4 w-4" />AWS settings</button>
    </aside>;
}
