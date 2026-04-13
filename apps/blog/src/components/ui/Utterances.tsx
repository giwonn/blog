"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

export function Utterances() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;

    const scriptEl = document.createElement("script");
    scriptEl.src = "https://utteranc.es/client.js";
    scriptEl.async = true;
    scriptEl.setAttribute("repo", "giwonn/giwon-blog");
    scriptEl.setAttribute("issue-term", "pathname");
    scriptEl.setAttribute(
      "theme",
      resolvedTheme === "dark" ? "github-dark" : "github-light"
    );
    scriptEl.setAttribute("crossorigin", "anonymous");

    ref.current.innerHTML = "";
    ref.current.appendChild(scriptEl);
  }, [resolvedTheme]);

  return <div ref={ref} />;
}
