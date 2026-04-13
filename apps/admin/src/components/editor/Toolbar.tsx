"use client";

import { EditorView } from "@codemirror/view";
import { CheatSheet } from "./CheatSheet";

interface ToolbarProps {
  editorView: EditorView | null;
  onImageUpload: () => void;
}

type MarkdownAction = {
  label: string;
  title: string;
  wrap?: { before: string; after: string };
  prefix?: string;
  block?: string;
};

const ACTIONS: (MarkdownAction | "divider")[] = [
  { label: "H1", title: "제목 1", prefix: "# " },
  { label: "H2", title: "제목 2", prefix: "## " },
  { label: "H3", title: "제목 3", prefix: "### " },
  { label: "H4", title: "제목 4", prefix: "#### " },
  "divider",
  { label: "B", title: "굵게", wrap: { before: "**", after: "**" } },
  { label: "I", title: "기울임", wrap: { before: "*", after: "*" } },
  { label: "S", title: "취소선", wrap: { before: "~~", after: "~~" } },
  "divider",
  { label: "인용", title: "인용", prefix: "> " },
  { label: "링크", title: "링크", wrap: { before: "[", after: "](url)" } },
  { label: "코드", title: "인라인 코드", wrap: { before: "`", after: "`" } },
  { label: "```", title: "코드 블록", block: "```\n\n```" },
  "divider",
];

export function Toolbar({ editorView, onImageUpload }: ToolbarProps) {
  const applyAction = (action: MarkdownAction) => {
    if (!editorView) return;
    const { state } = editorView;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    let insert: string;
    let cursorPos: number;

    if (action.wrap) {
      insert = `${action.wrap.before}${selectedText || "텍스트"}${action.wrap.after}`;
      cursorPos = selectedText
        ? from + insert.length
        : from + action.wrap.before.length;
    } else if (action.prefix) {
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      if (lineText.startsWith(action.prefix)) {
        editorView.dispatch({
          changes: { from: line.from, to: line.from + action.prefix.length, insert: "" },
        });
        return;
      }
      const headingMatch = lineText.match(/^#{1,4}\s/);
      if (headingMatch) {
        editorView.dispatch({
          changes: { from: line.from, to: line.from + headingMatch[0].length, insert: action.prefix },
        });
        return;
      }
      editorView.dispatch({
        changes: { from: line.from, insert: action.prefix },
      });
      return;
    } else if (action.block) {
      insert = selectedText ? action.block.replace("\n\n", `\n${selectedText}\n`) : action.block;
      cursorPos = from + 4;
      editorView.dispatch({
        changes: { from, to, insert: `\n${insert}\n` },
        selection: { anchor: cursorPos + 1 },
      });
      editorView.focus();
      return;
    } else {
      return;
    }

    editorView.dispatch({
      changes: { from, to, insert },
      selection: selectedText
        ? { anchor: from + insert.length }
        : { anchor: cursorPos, head: cursorPos + (selectedText || "텍스트").length },
    });
    editorView.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 bg-gray-50">
      {ACTIONS.map((action, i) =>
        action === "divider" ? (
          <div key={i} className="w-px h-6 bg-gray-300 mx-1" />
        ) : (
          <button
            key={action.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction(action)}
            className="px-3 py-1.5 text-sm font-medium rounded text-gray-600 hover:bg-gray-100"
            title={action.title}
          >
            {action.label}
          </button>
        )
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onImageUpload}
        className="px-3 py-1.5 text-sm font-medium rounded text-gray-600 hover:bg-gray-100"
        title="이미지 추가"
      >
        이미지
      </button>
      <div className="flex-1" />
      <CheatSheet />
    </div>
  );
}
