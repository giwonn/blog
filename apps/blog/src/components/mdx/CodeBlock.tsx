"use client";

import { useState, useRef, isValidElement, ReactElement } from "react";
import { Mermaid } from "./Mermaid";

interface CodeBlockProps {
    children: React.ReactNode;
}

interface CodeElementProps {
    className?: string;
    children?: React.ReactNode;
    "data-mermaid"?: string;
    "data-language"?: string;
}

function getCodeContent(children: React.ReactNode): { language: string | null; code: string; mermaidCode: string | null } {
    if (isValidElement(children)) {
        const element = children as ReactElement<CodeElementProps>;
        const className = element.props.className || "";
        const language = element.props["data-language"] || className.replace("language-", "") || null;
        const mermaidCode = element.props["data-mermaid"] || null;
        const code = typeof element.props.children === "string" ? element.props.children : "";
        return { language, code, mermaidCode };
    }
    return { language: null, code: "", mermaidCode: null };
}

export function CodeBlock({ children }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);
    const preRef = useRef<HTMLPreElement>(null);

    const { language, mermaidCode } = getCodeContent(children);

    // Render Mermaid diagrams
    if (language === "mermaid" && mermaidCode) {
        return <Mermaid chart={mermaidCode.trim()} />;
    }

    const handleCopy = async () => {
        const codeText = preRef.current?.textContent || "";

        try {
            await navigator.clipboard.writeText(codeText);
        } catch {
            // Fallback for environments where Clipboard API is blocked
            const textarea = document.createElement("textarea");
            textarea.value = codeText;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative">
            <pre ref={preRef} data-language={language || "text"}>{children}</pre>
            <button
                onClick={handleCopy}
                className="absolute top-11 right-3 p-1.5 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                aria-label="Copy code"
            >
                {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                )}
            </button>
        </div>
    );
}
