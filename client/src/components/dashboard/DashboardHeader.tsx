"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import api from "@/lib/api";
import { useOutsideDismiss } from "@/hooks/useOutsideDismiss";

export default function DashboardHeader() {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const menuRef = useOutsideDismiss<HTMLDivElement>(() => setOpen(false));
    const user = session?.user;

    const logout = async () => {
        try {
            await api.post("/api/auth/signout");
        } finally {
            await signOut({ callbackUrl: "/" });
        }
    };

    return <header className="relative z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[var(--surface-color)]/95 px-4 backdrop-blur sm:px-6">
        <Link className="flex items-center gap-3" href="/">
            <span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-black/15"><Image alt="CloudCanvas" className="h-7 w-7 object-contain" height={28} priority src="/logo.png" width={28} /></span>
            <span className="font-(family-name:--font-display) text-lg font-semibold text-(--primary-text-color)">CloudCanvas</span>
        </Link>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-(--secondary-text-color) sm:block">Infrastructure workspace</span>
        <div className="relative" ref={menuRef}>
            <button aria-expanded={open} className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/15 px-2 text-sm text-(--primary-text-color) transition hover:border-white/20 hover:bg-white/6" onClick={() => setOpen((current) => !current)} type="button">
                {user?.image ? <Image alt="" className="h-6 w-6 rounded-full" height={24} src={user.image} width={24} /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-(--primary-color)/20 text-(--primary-color)"><UserRound className="h-3.5 w-3.5" /></span>}
                <span className="hidden max-w-36 truncate sm:block">{user?.name ?? user?.email ?? "Account"}</span><ChevronDown className="h-3.5 w-3.5 text-(--secondary-text-color)" />
            </button>
            {open ? <div className="absolute right-0 top-11 z-50 w-60 rounded-md border border-white/10 bg-[var(--surface-muted-color)] p-2 shadow-2xl">
                <div className="border-b border-white/10 px-3 py-2"><p className="truncate text-sm text-(--primary-text-color)">{user?.name ?? "CloudCanvas user"}</p><p className="mt-1 truncate text-xs text-(--secondary-text-color)">{user?.email}</p></div>
                <button className="mt-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--secondary-text-color) hover:bg-white/6 hover:text-(--primary-text-color)" onClick={() => void logout()} type="button"><LogOut className="h-4 w-4" />Log out</button>
            </div> : null}
        </div>
    </header>;
}
