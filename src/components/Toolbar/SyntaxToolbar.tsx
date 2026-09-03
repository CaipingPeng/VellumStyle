import {useRef, useState} from "react";
import {
  Bold, Italic, Strikethrough, Code, Link, Heading,
  List, ListOrdered, Quote, SquareCode, Minus, Undo2, Redo2, ImageUp, Smile, Sparkles, Music, Clapperboard,
  Table2, Sigma,
} from "lucide-react";
import type {RefObject} from "react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import {
  detectSyntaxShortcutPlatform,
  formatSyntaxShortcut,
  type SyntaxAction,
} from "../Editor/syntaxActions.ts";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";
import UploadButton, {type UploadButtonHandle} from "../Upload/UploadButton.tsx";
import {syntaxCommandLabel} from "../../commands/registry.ts";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenEmoji?: () => void;
  onOpenPhoneUpload?: () => void;
  onOpenAiImage?: () => void;
  onOpenMusic?: () => void;
  onOpenVideoChannel?: () => void;
  onOpenTableEditor?: () => void;
  onOpenFormulaEditor?: () => void;
}

const ICON = 16;
const HEADING_ACTIONS = ["heading1", "heading2", "heading3", "heading4"] as const;

function Separator() {
  return <div aria-hidden="true" className="mx-1 h-[18px] w-px flex-none bg-border" />;
}

export default function SyntaxToolbar({
  editorRef,
  onPickFile,
  onPickLocal,
  onOpenEmoji,
  onOpenPhoneUpload,
  onOpenAiImage,
  onOpenMusic,
  onOpenVideoChannel,
  onOpenTableEditor,
  onOpenFormulaEditor,
}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const uploadRef = useRef<UploadButtonHandle>(null);
  const shortcutPlatform = detectSyntaxShortcutPlatform();
  const syntaxTitle = (action: SyntaxAction) =>
    `${syntaxCommandLabel(action)} (${formatSyntaxShortcut(action, shortcutPlatform)})`;
  const headingStart = formatSyntaxShortcut("heading1", shortcutPlatform);
  const headingEnd = formatSyntaxShortcut("heading4", shortcutPlatform);
  let commonLength = 0;
  while (
    commonLength < headingStart.length
    && headingStart[commonLength] === headingEnd[commonLength]
  ) commonLength++;
  const headingShortcut = `${headingStart}–${headingEnd.slice(commonLength)}`;
  const ed = () => editorRef.current;
  const run = (action: SyntaxAction) => () => ed()?.runSyntaxAction(action);
  const pickHeading = (action: SyntaxAction) => {
    ed()?.runSyntaxAction(action);
    setHeadingOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <IconButton title="撤销 (Ctrl+Z)" onClick={() => ed()?.undo()}><Undo2 size={ICON} /></IconButton>
      <IconButton title="重做 (Ctrl+Y)" onClick={() => ed()?.redo()}><Redo2 size={ICON} /></IconButton>
      <Separator />
      <IconButton title={syntaxTitle("bold")} onClick={run("bold")}><Bold size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("italic")} onClick={run("italic")}><Italic size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("strikethrough")} onClick={run("strikethrough")}><Strikethrough size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("inlineCode")} onClick={run("inlineCode")}><Code size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("link")} onClick={run("link")}><Link size={ICON} /></IconButton>
      <Menu
        open={uploadMenuOpen}
        onClose={() => setUploadMenuOpen(false)}
        minWidth={132}
        trigger={
          <IconButton title="上传图片" active={uploadMenuOpen} onClick={() => setUploadMenuOpen((open) => !open)}>
            <ImageUp size={ICON} />
          </IconButton>
        }
      >
        <MenuItem
          onClick={() => {
            setUploadMenuOpen(false);
            void uploadRef.current?.pick();
          }}
        >
          从本地上传
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUploadMenuOpen(false);
            onOpenPhoneUpload?.();
          }}
        >
          从手机上传
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUploadMenuOpen(false);
            onOpenAiImage?.();
          }}
        >
          <Sparkles size={14} />
          AI 配图
        </MenuItem>
      </Menu>
      <IconButton title="表情" onClick={onOpenEmoji}>
        <Smile size={ICON} />
      </IconButton>
      <IconButton title="插入音乐" onClick={onOpenMusic}>
        <Music size={ICON} />
      </IconButton>
      <IconButton title="插入视频号" onClick={onOpenVideoChannel}>
        <Clapperboard size={ICON} />
      </IconButton>
      <UploadButton ref={uploadRef} showTrigger={false} onPickFile={onPickFile} onPickLocal={onPickLocal} />
      <Separator />

      <Menu
        open={headingOpen}
        onClose={() => setHeadingOpen(false)}
        minWidth={80}
        trigger={
          <IconButton title={`标题 (${headingShortcut})`} active={headingOpen} onClick={() => setHeadingOpen((o) => !o)}>
            <Heading size={ICON} />
          </IconButton>
        }
      >
        {HEADING_ACTIONS.map((action, index) => (
          <MenuItem key={action} onClick={() => pickHeading(action)}>H{index + 1}</MenuItem>
        ))}
      </Menu>

      <IconButton title={syntaxTitle("unorderedList")} onClick={run("unorderedList")}><List size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("orderedList")} onClick={run("orderedList")}><ListOrdered size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("blockquote")} onClick={run("blockquote")}><Quote size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("codeBlock")} onClick={run("codeBlock")}><SquareCode size={ICON} /></IconButton>
      <IconButton title={syntaxTitle("horizontalRule")} onClick={run("horizontalRule")}><Minus size={ICON} /></IconButton>
      <IconButton title="插入或编辑表格" onClick={onOpenTableEditor}><Table2 size={ICON} /></IconButton>
      <IconButton title="插入或编辑公式" onClick={onOpenFormulaEditor}><Sigma size={ICON} /></IconButton>
    </div>
  );
}
