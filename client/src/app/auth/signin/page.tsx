import { redirect } from "next/navigation";
import AuthPanel from "@/components/auth/AuthPanel";
import { getAuthSession } from "@/lib/session";

export default async function SignInPage() {
    const session = await getAuthSession();

    if (session) {
        redirect("/dashboard");
    }

    return <AuthPanel mode="signin" />;
}
