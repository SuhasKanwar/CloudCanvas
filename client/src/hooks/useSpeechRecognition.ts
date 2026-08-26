"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
type SpeechEvent = { resultIndex: number; results: SpeechResultList };
type BrowserRecognition = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    onresult: ((event: SpeechEvent) => void) | null;
    start: () => void;
    stop: () => void;
};
type BrowserRecognitionConstructor = new () => BrowserRecognition;

function recognitionConstructor(): BrowserRecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    const browserWindow = window as typeof window & { SpeechRecognition?: BrowserRecognitionConstructor; webkitSpeechRecognition?: BrowserRecognitionConstructor };
    return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onTranscript: (transcript: string) => void) {
    const recognitionRef = useRef<BrowserRecognition | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);

    const stop = useCallback(() => recognitionRef.current?.stop(), []);

    const start = useCallback(() => {
        const Recognition = recognitionConstructor();
        if (!Recognition) return;
        const recognition = new Recognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = navigator.language;
        recognition.onresult = (event) => {
            const nextTranscript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) => event.results[event.resultIndex + index])
                .filter((result) => result.isFinal)
                .map((result) => result[0].transcript)
                .join(" ")
                .trim();
            if (nextTranscript) onTranscript(nextTranscript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
    }, [onTranscript]);

    useEffect(() => {
        const timeout = window.setTimeout(() => setIsSupported(Boolean(recognitionConstructor())), 0);
        return () => {
            window.clearTimeout(timeout);
            recognitionRef.current?.stop();
        };
    }, []);

    return { isListening, isSupported, start, stop };
}
