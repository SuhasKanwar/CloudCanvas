"use client";

import { useState } from "react";
import AwsConnectionsPanel from "./AwsConnectionsPanel";
import GraphEditor from "@/components/graph/GraphEditor";
import DashboardHeader from "./DashboardHeader";

export default function DashboardWorkspace() {
    const [view, setView] = useState<"canvas" | "aws">("canvas");

    return <main className="flex h-screen min-h-150 flex-col overflow-hidden bg-[#101218]"><DashboardHeader onNavigate={setView} view={view} />{view === "aws" ? <AwsConnectionsPanel /> : <GraphEditor onOpenAwsSettings={() => setView("aws")} />}</main>;
}
