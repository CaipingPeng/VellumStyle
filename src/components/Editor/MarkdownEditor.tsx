import {forwardRef, useImperativeHandle, useMemo, useRef} from "react";
import CodeMirror, {type ReactCodeMirrorRef} from "@uiw/react-codemirror";
import {markdown, markdownLanguage} from "@codemirror/lang-markdown";
import {languages} from "@codemirror/language-data";
import {EditorView} from "@codemirror/view";

export interface MarkdownEditorHandle {
  // 在当前光标处插入文本（替换选区）。供工具栏上传按钮调用。
  insertAtCursor: (text: string) => void;
  // 编辑器滚动容器（.cm-scroller），供同步滚动监听
  getScroller: () => HTMLElement | null;
  // 顶部可视行号（0-based，与渲染 data-line 同基准）
  getTopLine: () => number;
  // 滚动编辑器使指定行（0-based）出现在视口顶部
  scrollToLine: (line: number) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  // 粘贴图片时触发；返回的 Promise 完成后编辑器无需额外处理（插入由回调内部完成）。
  onPasteImage?: (file: File) => void;
}

// Markdown 编辑器：CodeMirror 6，自动换行、无行号，支持光标插入与粘贴图片。
const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({value, onChange, onPasteImage}, ref) => {
    const cmRef = useRef<ReactCodeMirrorRef>(null);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text) => {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
      getScroller: () => cmRef.current?.view?.scrollDOM ?? null,
      getTopLine: () => {
        const view = cmRef.current?.view;
        if (!view) {
          return 0;
        }
        // 视口顶部像素对应的块行号（CodeMirror 行 1-based，转 0-based 与 data-line 对齐）
        const top = view.scrollDOM.scrollTop;
        const blockInfo = view.lineBlockAtHeight(top);
        return view.state.doc.lineAt(blockInfo.from).number - 1;
      },
      scrollToLine: (line) => {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        const docLine = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
        const pos = view.state.doc.line(docLine).from;
        view.dispatch({effects: EditorView.scrollIntoView(pos, {y: "start"})});
      },
    }));

    const extensions = useMemo(
      () => [
        markdown({base: markdownLanguage, codeLanguages: languages}),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste(event) {
            if (!onPasteImage) {
              return false;
            }
            const items = event.clipboardData?.items;
            if (!items) {
              return false;
            }
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  event.preventDefault();
                  onPasteImage(file);
                  return true;
                }
              }
            }
            return false;
          },
        }),
      ],
      [onPasteImage],
    );

    return (
      <CodeMirror
        ref={cmRef}
        value={value}
        height="100%"
        style={{height: "100%", fontSize: 14}}
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
        }}
      />
    );
  },
);

MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
