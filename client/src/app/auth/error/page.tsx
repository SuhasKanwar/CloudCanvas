import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import StatusScreen from "@/components/ui/StatusScreen";
import { getAuthSession } from "@/lib/session";

const errorMessages: Record<string, string> = {
    AccessDenied: "CloudCanvas could not verify that request. Try signing in again.",
    Configuration: "Auth is misconfigured. Check the provider and environment values.",
    OAuthAccountNotLinked: "That Google account is already linked to a different sign-in method.",
    CredentialsSignin: "The email or password was rejected by the server.",
    Default: "Authentication failed. Try again or use a different sign-in method.",
};

export default async function AuthErrorPage({
    searchParams,
}: {
    searchParams?: { error?: string };
}) {
    const session = await getAuthSession();

    if (session) {
        redirect("/dashboard");
    }

    const code = searchParams?.error ?? "Default";
    const message = errorMessages[code] ?? errorMessages.Default;

    return (
        <StatusScreen
            action={(
                <>
                    <Link className="inline-flex items-center gap-2 rounded-2xl bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color)" href="/auth/signin">
                        Back to sign in
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-(--primary-text-color)" href="/">
                        Return home
                    </Link>
                </>
            )}
            description={message}
            eyebrow="Authentication error"
            title="Sign-in did not complete."
        >
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--secondary-text-color)">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--warning-color)" />
                <div className="space-y-1">
                    <p>Auth error code</p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-(--primary-text-color)">
                        {code}
                    </p>
                </div>
            </div>
        </StatusScreen>
    );
}