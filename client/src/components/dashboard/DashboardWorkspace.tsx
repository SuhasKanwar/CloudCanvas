"use client";

import { useState } from "react";
import { ArrowLeft, Cloud, Workflow } from "lucide-react";
import AwsConnectionsPanel from "./AwsConnectionsPanel";
import GraphEditor from "@/components/graph/GraphEditor";

export default function DashboardWorkspace() {
    const [view, setView] = useState<"canvas" | "aws">("canvas");

    if (view === "aws") return <main className="min-h-screen bg-[#101218]"><div className="border-b border-white/10 px-4 py-3"><button className="inline-flex items-center gap-2 text-sm text-(--secondary-text-color) hover:text-(--primary-text-color)" onClick={() => setView("canvas")} type="button"><ArrowLeft className="h-4 w-4" />Back to canvas</button></div><AwsConnectionsPanel /></main>;

    return <main className="flex h-screen min-h-150 flex-col overflow-hidden bg-[#101218]"><header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4"><div className="flex items-center gap-2 text-sm font-medium"><Cloud className="h-4 w-4 text-(--primary-color)" />CloudCanvas</div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-(--secondary-text-color)"><Workflow className="h-3.5 w-3.5" />Infrastructure graph</div></header><GraphEditor onOpenAwsSettings={() => setView("aws")} /></main>;
}
