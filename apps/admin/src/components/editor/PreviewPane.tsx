"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import { CodeBlock } from "@/components/mdx/CodeBlock";
import { CustomContainer } from "@/components/mdx/CustomContainer";

// 블록 요소에 소스 라인 번호 부착 (스크롤 동기화용)
function rehypeSourceLine() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const blockTags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "pre", "blockquote", "ul", "ol", "table", "hr", "div"];
      if (blockTags.includes(node.tagName) && node.position?.start?.line) {
        node.properties = node.properties || {};
        node.properties["data-line"] = node.position.start.line;
      }
    });
  };
}

// blog.giwon.dev와 동일한 rehype 플러그인
function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "code" && node.properties?.className) {
        const classes = node.properties.className as string[];
        if (classes.includes("language-mermaid")) {
          const code = node.children
            .filter(
              (child): child is { type: "text"; value: string } =>
                child.type === "text"
            )
            .map((child) => child.value)
            .join("");
          node.properties["data-mermaid"] = code;
        }
      }
    });
  };
}

function rehypeCodeLanguage() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName === "code" && (parent as Element)?.tagName === "pre") {
        const classes = (node.properties?.className as string[]) || [];
        const langClass = classes.find((c) => c.startsWith("language-"));
        const lang = langClass ? langClass.replace("language-", "") : "text";
        node.properties["data-language"] = lang;
        (parent as Element).properties["data-language"] = lang;
      }
    });
  };
}

// :::tip, :::warning, :::danger, :::info 컨테이너를 HTML로 변환
function transformContainers(source: string): string {
  return source.replace(
    /^:::(tip|warning|danger|info)(?:\s+(.*))?\n([\s\S]*?)^:::\s*$/gm,
    (_match, type, title, content) => {
      const escapedTitle = title ? ` title="${title.trim()}"` : "";
      return `<div data-container="${type}"${escapedTitle}>\n\n${content.trim()}\n\n</div>`;
    }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContainerDiv(props: any) {
  const type = props["data-container"];
  if (type) {
    return <CustomContainer type={type} title={props.title}>{props.children}</CustomContainer>;
  }
  return <div {...props} />;
}

// 닫히지 않은 코드 펜스를 이스케이프 처리
function escapeUnclosedCodeFences(text: string): string {
  const lines = text.split("\n");
  let insideCodeBlock = false;
  let openIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) {
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        openIndex = i;
      } else {
        insideCodeBlock = false;
        openIndex = -1;
      }
    }
  }

  if (insideCodeBlock && openIndex >= 0) {
    lines[openIndex] = lines[openIndex].replace(/^```/, "\\`\\`\\`");
    return lines.join("\n");
  }

  return text;
}

interface PreviewPaneProps {
  content: string;
}

export function PreviewPane({ content }: PreviewPaneProps) {
  return (
    <div className="p-6 bg-white">
      <article className="prose dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            rehypeRaw,
            rehypeSourceLine,
            rehypeMermaid,
            rehypeHighlight,
            rehypeCodeLanguage,
            rehypeSlug,
            rehypeKatex,
          ]}
          components={{
            pre: CodeBlock,
            div: ContainerDiv,
          }}
        >
          {escapeUnclosedCodeFences(transformContainers(content))}
        </ReactMarkdown>
      </article>
    </div>
  );
}
