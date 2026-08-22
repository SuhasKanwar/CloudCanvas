"use client";

import { useEffect, useRef } from "react";

export function useOutsideDismiss<T extends HTMLElement>(onDismiss: () => void) {
    const ref = useRef<T>(null);

    useEffect(() => {
        const dismiss = (event: PointerEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
        };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
    }, [onDismiss]);

    return ref;
}
