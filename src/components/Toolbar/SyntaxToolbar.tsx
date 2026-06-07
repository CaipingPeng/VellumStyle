import {useState, useRef, useEffect, type CSSProperties, type RefObject} from "react";
import {
  Bold, Italic, Strikethrough, Code, Link, Heading,
  List, ListOrdered, Quote, SquareCode, Minus,
} from "lucide-react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
}

const btnStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  background: "#fff",
  color: "#333",
  cursor: "pointer",
  padding: 0,
};

const ICON = 16;

export default function SyntaxToolbar({editorRef}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingWrapRef = useRef<HTMLDivElement>(null);

  // 点击空白关闭标题下拉
  useEffect(() => {
    if (!headingOpen) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!headingWrapRef.current?.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [headingOpen]);

  const ed = () => editorRef.current;

  const wrap = (b: string, a: string, ph: string) => () => ed()?.wrapSelection(b, a, ph);
  const prefix = (p: string) => () => ed()?.prefixLines(p);

  const pickHeading = (level: number) => {
    ed()?.prefixLines("#".repeat(level) + " ");
    setHeadingOpen(false);
  };

  return (
    <div style={{display: "flex", alignItems: "center", gap: 4}}>
      <button type="button" title="加粗" style={btnStyle} onClick={wrap("**", "**", "加粗文本")}>
        <Bold size={ICON} />
      </button>
      <button type="button" title="斜体" style={btnStyle} onClick={wrap("*", "*", "斜体文本")}>
        <Italic size={ICON} />
      </button>
      <button type="button" title="删除线" style={btnStyle} onClick={wrap("~~", "~~", "删除文本")}>
        <Strikethrough size={ICON} />
      </button>
      <button type="button" title="行内代码" style={btnStyle} onClick={wrap("`", "`", "代码")}>
        <Code size={ICON} />
      </button>
      <button type="button" title="链接" style={btnStyle} onClick={() => ed()?.insertLink()}>
        <Link size={ICON} />
      </button>

      {/* 标题下拉 */}
      <div ref={headingWrapRef} style={{position: "relative"}}>
        <button type="button" title="标题" style={btnStyle} onClick={() => setHeadingOpen((o) => !o)}>
          <Heading size={ICON} />
        </button>
        {headingOpen && (
          <div
            style={{
              position: "absolute",
              top: 34,
              left: 0,
              background: "#fff",
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              zIndex: 10,
              minWidth: 80,
            }}
          >
            {[1, 2, 3, 4].map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => pickHeading(lv)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "6px 12px",
                  border: "none",
                  background: "#fff",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                H{lv}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" title="无序列表" style={btnStyle} onClick={prefix("- ")}>
        <List size={ICON} />
      </button>
      <button type="button" title="有序列表" style={btnStyle} onClick={prefix("1. ")}>
        <ListOrdered size={ICON} />
      </button>
      <button type="button" title="引用" style={btnStyle} onClick={prefix("> ")}>
        <Quote size={ICON} />
      </button>
      <button type="button" title="代码块" style={btnStyle} onClick={() => ed()?.insertCodeBlock()}>
        <SquareCode size={ICON} />
      </button>
      <button type="button" title="分割线" style={btnStyle} onClick={() => ed()?.insertAtCursor("\n---\n")}>
        <Minus size={ICON} />
      </button>
    </div>
  );
}
