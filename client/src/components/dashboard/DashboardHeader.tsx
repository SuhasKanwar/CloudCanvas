"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { ChevronDown, LayoutPanelTop, LogOut, Settings2, UserRound } from "lucide-react";
import api from "@/lib/api";

type DashboardView = "canvas" | "aws";

export default function DashboardHeader({ onNavigate, view }: { onNavigate: (view: DashboardView) => void; view: DashboardView }) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const user = session?.user;

    const logout = async () => {
        try {
            await api.post("/api/auth/signout");
        } finally {
            await signOut({ callbackUrl: "/" });
        }
    };

    return <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#101218] px-4 sm:px-6">
        <Link className="flex items-center gap-2.5" href="/">
            <Image alt="CloudCanvas" className="h-8 w-8 object-contain" height={32} priority src="/logo.png" width={32} />
            <span className="font-(family-name:--font-display) text-lg text-(--primary-text-color)">CloudCanvas</span>
        </Link>
        <nav aria-label="Dashboard" className="flex items-center gap-1 rounded border border-white/10 bg-white/4 p-1">
            <button aria-label="Canvas" className={`inline-flex items-center gap-2 px-2 py-1.5 text-sm sm:px-3 ${view === "canvas" ? "bg-white/10 text-(--primary-text-color)" : "text-(--secondary-text-color) hover:text-(--primary-text-color)"}`} onClick={() => onNavigate("canvas")} type="button"><LayoutPanelTop className="h-4 w-4" /><span className="hidden sm:inline">Canvas</span></button>
            <button aria-label="AWS settings" className={`inline-flex items-center gap-2 px-2 py-1.5 text-sm sm:px-3 ${view === "aws" ? "bg-white/10 text-(--primary-text-color)" : "text-(--secondary-text-color) hover:text-(--primary-text-color)"}`} onClick={() => onNavigate("aws")} type="button"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">AWS settings</span></button>
        </nav>
        <div className="relative">
            <button aria-expanded={open} className="flex items-center gap-2 border border-white/10 bg-white/4 px-2 py-1.5 text-sm text-(--primary-text-color) hover:bg-white/8" onClick={() => setOpen((current) => !current)} type="button">
                {user?.image ? <Image alt="" className="h-6 w-6 rounded-full" height={24} src={user.image} width={24} /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-(--primary-color)/20 text-(--primary-color)"><UserRound className="h-3.5 w-3.5" /></span>}
                <span className="hidden max-w-36 truncate sm:block">{user?.name ?? user?.email ?? "Account"}</span><ChevronDown className="h-3.5 w-3.5 text-(--secondary-text-color)" />
            </button>
            {open ? <div className="absolute right-0 top-11 z-50 w-56 border border-white/10 bg-[#151821] p-2 shadow-2xl">
                <div className="border-b border-white/10 px-3 py-2"><p className="truncate text-sm text-(--primary-text-color)">{user?.name ?? "CloudCanvas user"}</p><p className="mt-1 truncate text-xs text-(--secondary-text-color)">{user?.email}</p></div>
                <button className="mt-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--secondary-text-color) hover:bg-white/6 hover:text-(--primary-text-color)" onClick={() => void logout()} type="button"><LogOut className="h-4 w-4" />Log out</button>
            </div> : null}
        </div>
    </header>;
}
