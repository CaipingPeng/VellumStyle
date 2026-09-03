import {
  formatSyntaxShortcut,
  type SyntaxAction,
} from "../components/Editor/syntaxActions.ts";

export type CommandGroup = "视图" | "编辑" | "插入" | "应用";

export interface AppCommand {
  id: string;
  label: string;
  group: CommandGroup;
  keywords: readonly string[];
  shortcut?: string;
  run: () => void | Promise<void>;
}

export interface CommandRegistryActions {
  toggleDocuments: () => void;
  toggleOutline: () => void;
  openSettings: () => void;
  openMaterialLibrary: () => void;
  openEmoji: () => void;
  openPhoneUpload: () => void;
  openAiImage: () => void;
  openMusic: () => void;
  openVideoChannel: () => void;
  openTableEditor: () => void;
  openFormulaEditor: () => void;
  openTemplateLibrary: () => void;
  openDocumentHistory: () => void | Promise<void>;
  syncNow: () => void | Promise<void>;
  undo: () => void;
  redo: () => void;
  openSearch: () => void;
  runSyntaxAction: (action: SyntaxAction) => void;
}

interface SyntaxCommandMeta {
  action: SyntaxAction;
  label: string;
  keywords: readonly string[];
}

export const SYNTAX_COMMANDS: readonly SyntaxCommandMeta[] = [
  {action: "bold", label: "加粗", keywords: ["bold", "strong"]},
  {action: "italic", label: "斜体", keywords: ["italic", "emphasis"]},
  {action: "strikethrough", label: "删除线", keywords: ["strike", "del"]},
  {action: "inlineCode", label: "行内代码", keywords: ["code", "inline"]},
  {action: "link", label: "链接", keywords: ["link", "url", "超链接", "插入链接"]},
  {action: "heading1", label: "一级标题", keywords: ["h1", "标题"]},
  {action: "heading2", label: "二级标题", keywords: ["h2", "标题"]},
  {action: "heading3", label: "三级标题", keywords: ["h3", "标题"]},
  {action: "heading4", label: "四级标题", keywords: ["h4", "标题"]},
  {action: "orderedList", label: "有序列表", keywords: ["ol", "list", "列表"]},
  {action: "unorderedList", label: "无序列表", keywords: ["ul", "list", "列表"]},
  {action: "blockquote", label: "引用", keywords: ["quote", "blockquote", "引用块"]},
  {action: "codeBlock", label: "代码块", keywords: ["code", "fence", "代码"]},
  {action: "horizontalRule", label: "分割线", keywords: ["hr", "divider", "横线"]},
];

export function syntaxCommandLabel(action: SyntaxAction): string {
  return SYNTAX_COMMANDS.find((command) => command.action === action)?.label ?? action;
}

export function buildCommandRegistry(actions: CommandRegistryActions): AppCommand[] {
  const commands: AppCommand[] = [
    {id: "view.documents", label: "切换文档目录", group: "视图", keywords: ["目录", "文档树", "sidebar"], run: actions.toggleDocuments},
    {id: "view.outline", label: "切换大纲导航", group: "视图", keywords: ["标题", "outline", "导航"], run: actions.toggleOutline},
    {id: "app.settings", label: "打开设置", group: "应用", keywords: ["配置", "preferences", "settings"], run: actions.openSettings},
    {id: "app.sync", label: "立即保存并同步", group: "应用", keywords: ["云同步", "webdav", "save", "sync"], shortcut: "Ctrl+S", run: actions.syncNow},
    {id: "edit.undo", label: "撤销", group: "编辑", keywords: ["undo"], shortcut: "Ctrl+Z", run: actions.undo},
    {id: "edit.redo", label: "重做", group: "编辑", keywords: ["redo"], shortcut: "Ctrl+Y", run: actions.redo},
    {id: "edit.search", label: "查找与替换", group: "编辑", keywords: ["find", "replace", "搜索"], shortcut: "Ctrl+H", run: actions.openSearch},
    {id: "insert.material", label: "打开永久素材库", group: "插入", keywords: ["图片", "音频", "视频", "material"], run: actions.openMaterialLibrary},
    {id: "insert.emoji", label: "插入表情", group: "插入", keywords: ["emoji", "微信表情"], run: actions.openEmoji},
    {id: "insert.phone", label: "从手机上传图片", group: "插入", keywords: ["扫码", "phone", "图片"], run: actions.openPhoneUpload},
    {id: "insert.ai-image", label: "微信 AI 配图", group: "插入", keywords: ["生成图片", "ai", "image"], run: actions.openAiImage},
    {id: "insert.music", label: "插入音乐", group: "插入", keywords: ["qq音乐", "music", "音频"], run: actions.openMusic},
    {id: "insert.video-channel", label: "插入视频号", group: "插入", keywords: ["视频", "channel", "video"], run: actions.openVideoChannel},
    {id: "insert.table", label: "插入或编辑表格", group: "插入", keywords: ["table", "grid", "表格"], run: actions.openTableEditor},
    {id: "insert.formula", label: "插入或编辑公式", group: "插入", keywords: ["latex", "math", "公式"], run: actions.openFormulaEditor},
    {id: "insert.template", label: "打开模板与常用片段", group: "插入", keywords: ["template", "snippet", "模板", "片段"], run: actions.openTemplateLibrary},
    {id: "edit.history", label: "查看本地版本历史", group: "编辑", keywords: ["history", "diff", "恢复", "版本", "差异"], run: actions.openDocumentHistory},
  ];

  for (const syntax of SYNTAX_COMMANDS) {
    commands.push({
      id: `syntax.${syntax.action}`,
      label: syntax.label,
      group: "编辑",
      keywords: syntax.keywords,
      shortcut: formatSyntaxShortcut(syntax.action),
      run: () => actions.runSyntaxAction(syntax.action),
    });
  }
  return commands;
}

function searchableText(command: AppCommand): string {
  return [command.label, command.group, ...command.keywords].join(" ").toLocaleLowerCase();
}

export function filterCommands(commands: readonly AppCommand[], query: string): AppCommand[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...commands];
  return commands.filter((command) => {
    const text = searchableText(command);
    return terms.every((term) => text.includes(term));
  });
}

export type CommandPaletteShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

export function isCommandPaletteShortcut(event: CommandPaletteShortcutEvent): boolean {
  return event.key.toLocaleLowerCase() === "p"
    && (event.ctrlKey || event.metaKey)
    && event.shiftKey
    && !event.altKey;
}
