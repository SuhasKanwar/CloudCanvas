import type { ReactNode } from "react";

type StatusScreenProps = {
    eyebrow: string;
    title: string;
    description: string;
    children?: ReactNode;
    action?: ReactNode;
};

export default function StatusScreen({
    eyebrow,
    title,
    description,
    children,
    action,
}: StatusScreenProps) {
    return (
        <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
            <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl flex-col justify-center">
                <div className="rounded-4xl border border-white/10 bg-[color-mix(in_srgb,var(--surface-color)_92%,transparent)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur md:p-8">
                    <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-(--secondary-color)">
                        {eyebrow}
                    </p>
                    <h1 className="mt-4 text-3xl leading-tight text-(--primary-text-color) md:text-4xl">
                        {title}
                    </h1>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-(--secondary-text-color) md:text-base">
                        {description}
                    </p>
                    {children ? <div className="mt-8">{children}</div> : null}
                    {action ? <div className="mt-8 flex flex-wrap gap-3">{action}</div> : null}
                </div>
            </section>
        </main>
    );
}