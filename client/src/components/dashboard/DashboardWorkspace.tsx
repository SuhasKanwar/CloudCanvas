"use client";

import { useState } from "react";
import AwsConnectionsPanel from "./AwsConnectionsPanel";
import DashboardHeader from "./DashboardHeader";
import SketchIndex from "./SketchIndex";

export default function DashboardWorkspace() {
    const [view, setView] = useState<"sketches" | "aws">("sketches");

    return <main className="flex min-h-screen flex-col bg-[#101218]"><DashboardHeader />{view === "aws" ? <AwsConnectionsPanel onBack={() => setView("sketches")} /> : <SketchIndex onOpenAwsSettings={() => setView("aws")} />}</main>;
}
