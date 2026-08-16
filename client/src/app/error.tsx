"use client";

export default function ErrorPage({ error }: { error: Error }) {
    return (
        <main aria-label={error.message}></main>
    );
}
