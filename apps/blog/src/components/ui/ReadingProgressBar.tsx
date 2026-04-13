"use client";

import { useEffect, useState } from "react";

export function ReadingProgressBar() {
    const [progress, setProgress] = useState(0);
    const [headerHeight, setHeaderHeight] = useState(0);

    useEffect(() => {
        const header = document.querySelector("header");
        if (header) {
            setHeaderHeight(header.offsetHeight);
        }

        function handleScroll() {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (docHeight > 0) {
                setProgress(Math.min((scrollTop / docHeight) * 100, 100));
            }
        }

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

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
