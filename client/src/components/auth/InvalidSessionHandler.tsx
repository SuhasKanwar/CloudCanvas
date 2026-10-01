"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function InvalidSessionHandler() {
    useEffect(() => {
        const clearSession = () => {
            void signOut({ redirect: false }).finally(() => window.location.replace("/auth/signin"));
        };
        window.addEventListener("cloudcanvas:invalid-session", clearSession);
        return () => window.removeEventListener("cloudcanvas:invalid-session", clearSession);
    }, []);
    return null;
}
