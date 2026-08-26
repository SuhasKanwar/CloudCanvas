"use client";

import { useCallback, useEffect, useState } from "react";

export function useSpeechSynthesis() {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSupported, setIsSupported] = useState(false);

    const cancel = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    }, []);

    const speak = useCallback((text: string) => {
        if (!window.speechSynthesis || !text.trim()) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => setIsSupported("speechSynthesis" in window), 0);
        return () => {
            window.clearTimeout(timeout);
            window.speechSynthesis?.cancel();
        };
    }, []);

    return { cancel, isSpeaking, isSupported, speak };
}
