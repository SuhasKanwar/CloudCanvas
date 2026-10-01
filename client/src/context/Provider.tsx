"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ToastProvider } from "@/components/ui/toast";
import InvalidSessionHandler from "@/components/auth/InvalidSessionHandler";

export default function Provider({ children, session }: { children: React.ReactNode; session: Session | null; }) {
    return (
        <SessionProvider session={session}>
            <InvalidSessionHandler />
            <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
    );
}
