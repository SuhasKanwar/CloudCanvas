"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { ArrowRight, BadgeInfo, Loader2, LockKeyhole, Mail, User } from "lucide-react";
import { AUTH_CALLBACK_URL } from "@/lib/config";
import { useToast } from "@/components/ui/toast";

type AuthMode = "signin" | "signup";

const copy: Record<AuthMode, {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    footerLabel: string;
    footerHref: string;
    footerPrompt: string;
}> = {
    signin: {
        eyebrow: "Secure access",
        title: "Sign in to CloudCanvas.",
        description: "Pick up where you left off and open the dashboard directly.",
        primaryLabel: "Sign in",
        footerLabel: "Create account",
        footerHref: "/auth/signup",
        footerPrompt: "Need an account?",
    },
    signup: {
        eyebrow: "Get started",
        title: "Create your CloudCanvas account.",
        description: "Use email and password, or continue with Google.",
        primaryLabel: "Create account",
        footerLabel: "Sign in",
        footerHref: "/auth/signin",
        footerPrompt: "Already have an account?",
    },
};

export default function AuthPanel({ mode }: { mode: AuthMode }) {
    const router = useRouter();
    const { pushToast } = useToast();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const isSignup = mode === "signup";
    const content = copy[mode];

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const result = await signIn("credentials", {
                redirect: false,
                callbackUrl: AUTH_CALLBACK_URL,
                email,
                password,
                ...(isSignup && { name, register: "true" }),
            });

            if (result?.error) {
                const message = result.error === "CredentialsSignin"
                    ? isSignup
                        ? "We could not create that account. Try another email address."
                        : "No account matched those credentials. Create an account or check your password."
                    : result.error;
                setError(message);
                pushToast({ message, variant: "error" });
                return;
            }

            router.replace(result?.url ?? AUTH_CALLBACK_URL);
            router.refresh();
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : "Unable to complete authentication.";
            setError(message);
            pushToast({ message, variant: "error" });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = () => {
        void signIn("google", { callbackUrl: AUTH_CALLBACK_URL });
    };

    return (
        <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
            <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center">
                <div className="w-full rounded-4xl border border-white/10 bg-[color-mix(in_srgb,var(--surface-color)_92%,transparent)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur md:p-8">
                    <div className="flex items-center justify-between gap-4">
                        <Link href="/" className="inline-flex items-center gap-2 text-sm text-(--secondary-text-color) transition-colors hover:text-(--primary-text-color)">
                            CloudCanvas
                        </Link>
                        <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-(--muted-text-color)">
                            {content.eyebrow}
                        </span>
                    </div>

                    <div className="mt-8">
                        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-(--secondary-color)">
                            {mode === "signup" ? "New workspace" : "Welcome back"}
                        </p>
                        <h1 className="mt-3 text-3xl leading-tight text-(--primary-text-color) md:text-4xl">
                            {content.title}
                        </h1>
                        <p className="mt-3 max-w-lg text-sm leading-6 text-(--secondary-text-color) md:text-base">
                            {content.description}
                        </p>
                    </div>

                    <button
                        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-(--primary-text-color) transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleGoogle}
                        type="button"
                    >
                        Continue with Google
                        <ArrowRight className="h-4 w-4" />
                    </button>

                    <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-(--muted-text-color)">
                        <span className="h-px flex-1 bg-white/10" />
                        or use email
                        <span className="h-px flex-1 bg-white/10" />
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {isSignup ? (
                            <label className="block">
                                <span className="mb-2 flex items-center gap-2 text-sm text-(--secondary-text-color)">
                                    <User className="h-4 w-4" />
                                    Name
                                </span>
                                <input
                                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--primary-text-color) outline-none transition-colors placeholder:text-(--muted-text-color) focus:border-(--primary-color)"
                                    name="name"
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Your name"
                                    required={isSignup}
                                    type="text"
                                    value={name}
                                />
                            </label>
                        ) : null}

                        <label className="block">
                            <span className="mb-2 flex items-center gap-2 text-sm text-(--secondary-text-color)">
                                <Mail className="h-4 w-4" />
                                Email
                            </span>
                            <input
                                autoComplete="email"
                                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--primary-text-color) outline-none transition-colors placeholder:text-(--muted-text-color) focus:border-(--primary-color)"
                                name="email"
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                                required
                                type="email"
                                value={email}
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 flex items-center gap-2 text-sm text-(--secondary-text-color)">
                                <LockKeyhole className="h-4 w-4" />
                                Password
                            </span>
                            <input
                                autoComplete={isSignup ? "new-password" : "current-password"}
                                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--primary-text-color) outline-none transition-colors placeholder:text-(--muted-text-color) focus:border-(--primary-color)"
                                name="password"
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="••••••••"
                                required
                                type="password"
                                value={password}
                            />
                        </label>

                        {error ? (
                            <p className="flex items-start gap-2 rounded-2xl border border-(--danger-color)/30 bg-(--danger-color)/10 px-4 py-3 text-sm text-(--primary-text-color)">
                                <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-(--danger-color)" />
                                <span>{error}</span>
                            </p>
                        ) : null}

                        <button
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color) transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={loading}
                            type="submit"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {loading ? "Working..." : content.primaryLabel}
                        </button>
                    </form>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-(--secondary-text-color)">
                        <span>{content.footerPrompt}</span>
                        <Link className="inline-flex items-center gap-2 text-(--primary-text-color) transition-colors hover:text-(--primary-color)" href={content.footerHref}>
                            {content.footerLabel}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}
