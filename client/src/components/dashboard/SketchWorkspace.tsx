"use client";

import { useState } from "react";
import AwsConnectionsPanel from "./AwsConnectionsPanel";
import GraphEditor from "@/components/graph/GraphEditor";

export default function SketchWorkspace({ sketchId }: { sketchId: string }) {
    const [view, setView] = useState<"editor" | "aws">("editor");

    return view === "aws"
        ? <AwsConnectionsPanel onBack={() => setView("editor")} />
        : <GraphEditor sketchId={sketchId} onOpenAwsSettings={() => setView("aws")} />;
}
