"use client";

import { useCallback, useRef, useState } from "react";
import { createHistory } from "@/lib/canvasState";

export function useCanvasHistory<T>() {
    const history = useRef(createHistory<T>());
    const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
    const refresh = useCallback(() => setAvailability({ canUndo: history.current.canUndo(), canRedo: history.current.canRedo() }), []);

    const record = useCallback((value: T) => { history.current.record(value); refresh(); }, [refresh]);
    const reset = useCallback(() => { history.current.clear(); refresh(); }, [refresh]);
    const undo = useCallback((current: T) => { const value = history.current.undo(current); refresh(); return value; }, [refresh]);
    const redo = useCallback((current: T) => { const value = history.current.redo(current); refresh(); return value; }, [refresh]);

    return { ...availability, record, reset, undo, redo };
}
