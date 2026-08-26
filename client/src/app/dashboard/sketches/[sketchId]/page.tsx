import { redirect } from "next/navigation";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import SketchWorkspace from "@/components/dashboard/SketchWorkspace";
import { getAuthSession } from "@/lib/session";

export default async function SketchPage({ params }: { params: Promise<{ sketchId: string }> }) {
    const session = await getAuthSession();
    if (!session?.accessToken) redirect("/auth/signin");
    const { sketchId } = await params;

    return <main className="flex h-screen min-h-150 flex-col overflow-hidden bg-[#101218]"><DashboardHeader /><SketchWorkspace sketchId={sketchId} /></main>;
}
