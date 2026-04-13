"use client";

import { useSyncExternalStore } from "react";

function subscribeResize(callback: () => void) {
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
}

function subscribeScroll(callback: () => void) {
    window.addEventListener("scroll", callback, { passive: true });
    window.addEventListener("resize", callback);
    return () => {
        window.removeEventListener("scroll", callback);
        window.removeEventListener("resize", callback);
    };
}

function getHeaderHeight() {
    return document.querySelector("header")?.offsetHeight ?? 0;
}

function getProgress() {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 0;
    return Math.min((window.scrollY / docHeight) * 100, 100);
}

const getServerZero = () => 0;

export function ReadingProgressBar() {
    const headerHeight = useSyncExternalStore(subscribeResize, getHeaderHeight, getServerZero);
    const progress = useSyncExternalStore(subscribeScroll, getProgress, getServerZero);

    if (!headerHeight) return null;

    return (
        <div
            className="fixed left-0 right-0 z-40 h-[3px]"
            style={{ top: headerHeight }}
        >
            <div
                className="h-full bg-blue-500 transition-[width] duration-100 ease-out"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}
