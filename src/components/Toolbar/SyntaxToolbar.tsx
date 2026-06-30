import {useState} from "react";
import {
  Bold, Italic, Strikethrough, Code, Link, Heading,
  List, ListOrdered, Quote, SquareCode, Minus, Undo2, Redo2,
} from "lucide-react";
import type {RefObject} from "react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import UploadButton from "../Upload/UploadButton.tsx";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenMaterialLibrary: () => void;
}

const ICON = 16;

function Separator() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}

export default function SyntaxToolbar({editorRef, onPickFile, onPickLocal, onOpenMaterialLibrary}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const ed = () => editorRef.current;
  const wrap = (b: string, a: string, ph: string) => () => ed()?.wrapSelection(b, a, ph);
  const prefix = (p: string) => () => ed()?.prefixLines(p);
  const pickHeading = (level: number) => {
    ed()?.prefixLines("#".repeat(level) + " ");
    setHeadingOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <IconButton title="撤销 (Ctrl+Z)" onClick={() => ed()?.undo()}><Undo2 size={ICON} /></IconButton>
      <IconButton title="重做 (Ctrl+Y)" onClick={() => ed()?.redo()}><Redo2 size={ICON} /></IconButton>
      <Separator />
      <IconButton title="加粗" onClick={wrap("**", "**", "加粗文本")}><Bold size={ICON} /></IconButton>
      <IconButton title="斜体" onClick={wrap("*", "*", "斜体文本")}><Italic size={ICON} /></IconButton>
      <IconButton title="删除线" onClick={wrap("~~", "~~", "删除文本")}><Strikethrough size={ICON} /></IconButton>
      <IconButton title="行内代码" onClick={wrap("`", "`", "代码")}><Code size={ICON} /></IconButton>
      <IconButton title="链接" onClick={() => ed()?.insertLink()}><Link size={ICON} /></IconButton>
      <UploadButton
        display="icon"
        onPickFile={onPickFile}
        onPickLocal={onPickLocal}
        onOpenMaterialLibrary={onOpenMaterialLibrary}
      />
      <Separator />

      <Menu
        open={headingOpen}
        onClose={() => setHeadingOpen(false)}
        minWidth={80}
        trigger={
          <IconButton title="标题" active={headingOpen} onClick={() => setHeadingOpen((o) => !o)}>
            <Heading size={ICON} />
          </IconButton>
        }
      >
        {[1, 2, 3, 4].map((lv) => (
          <MenuItem key={lv} onClick={() => pickHeading(lv)}>H{lv}</MenuItem>
        ))}
      </Menu>

      <IconButton title="无序列表" onClick={prefix("- ")}><List size={ICON} /></IconButton>
      <IconButton title="有序列表" onClick={prefix("1. ")}><ListOrdered size={ICON} /></IconButton>
      <IconButton title="引用" onClick={prefix("> ")}><Quote size={ICON} /></IconButton>
      <IconButton title="代码块" onClick={() => ed()?.insertCodeBlock()}><SquareCode size={ICON} /></IconButton>
      <IconButton title="分割线" onClick={() => ed()?.insertAtCursor("\n---\n")}><Minus size={ICON} /></IconButton>
    </div>
  );
}
