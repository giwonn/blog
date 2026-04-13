"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidProps {
    chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const renderChart = async () => {
            if (!containerRef.current) return;

            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                });

                const { svg } = await mermaid.render(
                    `mermaid-${Math.random().toString(36).slice(2)}`,
                    chart
                );
                containerRef.current.innerHTML = svg;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to render diagram");
            }
        };

        renderChart();
    }, [chart]);

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-lg">
                <p>Mermaid Error: {error}</p>
                <pre className="mt-2 text-sm">{chart}</pre>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="my-4 flex justify-center [&>svg]:max-w-full p-4 border border-gray-700 rounded-lg bg-gray-900/50"
        />
    );
}
