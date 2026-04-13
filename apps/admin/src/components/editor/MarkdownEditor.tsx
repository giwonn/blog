"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap } from "@codemirror/view";
import { Toolbar } from "./Toolbar";
import { PreviewPane } from "./PreviewPane";
import { uploadImage } from "@/actions/articles";

function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `${before}${selected || "텍스트"}${after}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? { anchor: from + insert.length }
      : { anchor: from + before.length, head: from + before.length + "텍스트".length },
  });
  return true;
}

const markdownKeymap = keymap.of([
  { key: "Mod-b", run: (view) => wrapSelection(view, "**", "**") },
  { key: "Mod-i", run: (view) => wrapSelection(view, "*", "*") },
  { key: "Mod-Shift-s", run: (view) => wrapSelection(view, "~~", "~~") },
  { key: "Mod-e", run: (view) => wrapSelection(view, "`", "`") },
  { key: "Mod-u", run: (view) => wrapSelection(view, "<u>", "</u>") },
]);

// ``` 입력 후 Enter → 자동으로 닫는 ``` 삽입
const autoCloseCodeBlock = keymap.of([
  {
    key: "Enter",
    run: (view) => {
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      if (/^```\w*$/.test(line.text)) {
        view.dispatch({
          changes: { from, insert: "\n\n```" },
          selection: { anchor: from + 1 },
        });
        return true;
      }
      return false;
    },
  },
]);

// 한국어 키보드 맥에서 ₩ → ` 변환
const wonToBacktick = EditorView.inputHandler.of((view, from, to, text) => {
  if (text === "₩") {
    view.dispatch({ changes: { from, to, insert: "`" }, selection: { anchor: from + 1 } });
    return true;
  }
  return false;
});

interface MarkdownEditorProps {
  content?: string;
  onChange?: (content: string) => void;
}

export function MarkdownEditor({ content = "", onChange }: MarkdownEditorProps) {
  const [value, setValue] = useState(content);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleChange = useCallback(
    (val: string) => {
      setValue(val);
      onChange?.(val);
    },
    [onChange]
  );

  const getEditorView = (): EditorView | null => {
    return editorRef.current?.view ?? null;
  };

  const insertImageMarkdown = useCallback(
    async (file: File) => {
      const view = getEditorView();
      if (!view) return;

      const placeholderText = "![업로드 중...]()";
      const { from } = view.state.selection.main;
      view.dispatch({
        changes: { from, insert: placeholderText },
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        const { url } = await uploadImage(formData);

        const currentDoc = view.state.doc.toString();
        const placeholderIndex = currentDoc.indexOf(placeholderText);
        if (placeholderIndex !== -1) {
          const replacement = `![image](${url})`;
          view.dispatch({
            changes: {
              from: placeholderIndex,
              to: placeholderIndex + placeholderText.length,
              insert: replacement,
            },
          });
          handleChange(view.state.doc.toString());
        }
      } catch {
        const currentDoc = view.state.doc.toString();
        const placeholderIndex = currentDoc.indexOf(placeholderText);
        if (placeholderIndex !== -1) {
          view.dispatch({
            changes: {
              from: placeholderIndex,
              to: placeholderIndex + placeholderText.length,
              insert: "",
            },
          });
          handleChange(view.state.doc.toString());
        }
      }
    },
    [handleChange]
  );

  const handleImageUploadClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) insertImageMarkdown(file);
    };
    input.click();
  }, [insertImageMarkdown]);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) insertImageMarkdown(file);
          return true;
        }
      }
      return false;
    },
    [insertImageMarkdown]
  );

  const handleDrop = useCallback(
    (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) {
        event.preventDefault();
        insertImageMarkdown(file);
        return true;
      }
      return false;
    },
    [insertImageMarkdown]
  );

  // 에디터 스크롤 → 프리뷰 라인 기반 동기화
  useEffect(() => {
    const editorScroller = editorScrollRef.current;
    const preview = previewRef.current;
    if (!editorScroller || !preview) return;

    const handleEditorScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;

      const view = editorRef.current?.view;
      if (!view) { syncingRef.current = false; return; }

      const maxScroll = editorScroller.scrollHeight - editorScroller.clientHeight;

      // 맨 위
      if (editorScroller.scrollTop <= 0) {
        preview.scrollTop = 0;
        requestAnimationFrame(() => { syncingRef.current = false; });
        return;
      }

      // 맨 아래
      if (maxScroll > 0 && editorScroller.scrollTop >= maxScroll - 1) {
        preview.scrollTop = preview.scrollHeight - preview.clientHeight;
        requestAnimationFrame(() => { syncingRef.current = false; });
        return;
      }

      // 에디터 뷰포트 상단에 실제로 보이는 라인 번호를 CM에서 직접 가져옴
      const editorRect = editorScroller.getBoundingClientRect();
      const topPos = view.posAtCoords({ x: editorRect.left, y: editorRect.top });
      const topLine = topPos !== null ? view.state.doc.lineAt(topPos).number : 1;

      // 프리뷰에서 해당 라인에 가장 가까운 요소와 다음 요소 찾기
      const lineElements = Array.from(preview.querySelectorAll<HTMLElement>("[data-line]"));
      let prevEl: HTMLElement | null = null;
      let nextEl: HTMLElement | null = null;
      for (const el of lineElements) {
        const line = Number(el.dataset.line);
        if (line <= topLine) {
          prevEl = el;
        } else {
          nextEl = el;
          break;
        }
      }

      if (prevEl) {
        // prevEl과 nextEl 사이를 보간
        const prevLine = Number(prevEl.dataset.line);
        const prevTop = prevEl.offsetTop;

        if (nextEl) {
          const nextLine = Number(nextEl.dataset.line);
          const nextTop = nextEl.offsetTop;
          const lineRatio = (topLine - prevLine) / (nextLine - prevLine || 1);
          preview.scrollTop = prevTop + lineRatio * (nextTop - prevTop);
        } else {
          preview.scrollTop = prevTop;
        }
      }

      requestAnimationFrame(() => { syncingRef.current = false; });
    };

    editorScroller.addEventListener("scroll", handleEditorScroll);
    return () => editorScroller.removeEventListener("scroll", handleEditorScroll);
  });

  const eventHandlers = EditorView.domEventHandlers({
    paste: (event) => handlePaste(event),
    drop: (event) => handleDrop(event),
  });

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex flex-col flex-1 min-h-0">
      <Toolbar editorView={getEditorView()} onImageUpload={handleImageUploadClick} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto border-r border-gray-200 max-lg:border-r-0" ref={editorScrollRef}>
          <CodeMirror
            ref={editorRef}
            value={value}
            onChange={handleChange}
            extensions={[
              autoCloseCodeBlock,
              markdownKeymap,
              markdown({ base: markdownLanguage, codeLanguages: languages }),
              EditorView.lineWrapping,
              wonToBacktick,
              eventHandlers,
            ]}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: true,
              closeBrackets: false,
            }}
            placeholder="마크다운을 입력하세요..."
            className="h-full"
          />
        </div>

        <div className="flex-1 hidden lg:block overflow-y-auto" ref={previewRef}>
          <PreviewPane content={value} />
        </div>
      </div>
    </div>
  );
}
