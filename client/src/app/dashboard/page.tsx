import { redirect } from "next/navigation";
import AwsConnectionsPanel from "@/components/dashboard/AwsConnectionsPanel";
import { getAuthSession } from "@/lib/session";

export default async function DashboardPage() {
    const session = await getAuthSession();
    if (!session?.accessToken) redirect("/auth/signin");
    return <main><AwsConnectionsPanel /></main>;
}