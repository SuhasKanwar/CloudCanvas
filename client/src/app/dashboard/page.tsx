import { redirect } from "next/navigation";
import DashboardWorkspace from "@/components/dashboard/DashboardWorkspace";
import { getAuthSession } from "@/lib/session";

export default async function DashboardPage() {
    const session = await getAuthSession();
    if (!session?.accessToken) redirect("/auth/signin");
    return <DashboardWorkspace />;
}
