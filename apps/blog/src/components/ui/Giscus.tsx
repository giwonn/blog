"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

export function Giscus() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;

    const scriptEl = document.createElement("script");
    scriptEl.src = "https://giscus.app/client.js";
    scriptEl.async = true;
    scriptEl.setAttribute("data-repo", "giwonn/blog");
    scriptEl.setAttribute("data-repo-id", "R_kgDOSDAzuQ");
    scriptEl.setAttribute("data-category", "Announcements");
    scriptEl.setAttribute("data-category-id", "DIC_kwDOSDAzuc4C7Lts");
    scriptEl.setAttribute("data-mapping", "pathname");
    scriptEl.setAttribute("data-strict", "1");
    scriptEl.setAttribute("data-reactions-enabled", "1");
    scriptEl.setAttribute("data-emit-metadata", "0");
    scriptEl.setAttribute("data-input-position", "top");
    scriptEl.setAttribute("data-lang", "ko");
    scriptEl.setAttribute(
      "data-theme",
      resolvedTheme === "dark" ? "dark" : "light"
    );
    scriptEl.setAttribute("crossorigin", "anonymous");

    ref.current.innerHTML = "";
    ref.current.appendChild(scriptEl);
  }, [resolvedTheme]);

  return <div ref={ref} />;
}
