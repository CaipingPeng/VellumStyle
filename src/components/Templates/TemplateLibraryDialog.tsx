import {useEffect, useMemo, useRef, useState, type RefObject} from "react";
import {FilePlus2, Plus, Search, Trash2} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";
import {toast} from "../Toast/toast.ts";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import {
  createTemplateId,
  deleteArticleTemplate,
  listArticleTemplates,
  parseTemplateTags,
  saveArticleTemplate,
  type ArticleTemplate,
} from "../../utils/articleTemplates.ts";
import {baseName} from "../../utils/path.ts";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
  currentContent: string;
  currentDocumentPath: string | null;
  onClose: () => void;
}

interface Draft {
  id: string;
  name: string;
  description: string;
  tags: string;
  content: string;
  updatedAt: number;
}

function blankDraft(content = "", name = ""): Draft {
  return {id: createTemplateId(), name, description: "", tags: "", content, updatedAt: Date.now()};
}

function toDraft(template: ArticleTemplate): Draft {
  return {...template, tags: template.tags.join("，")};
}

function documentName(path: string | null): string {
  return path ? baseName(path).replace(/\.md$/i, "") : "";
}

export default function TemplateLibraryDialog({editorRef, currentContent, currentDocumentPath, onClose}: Props) {
  const [templates, setTemplates] = useState<ArticleTemplate[]>([]);
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = async (selectedId?: string) => {
    const loaded = await listArticleTemplates();
    setTemplates(loaded);
    const selected = loaded.find((template) => template.id === selectedId);
    if (selected) setDraft(toDraft(selected));
    return loaded;
  };

  useEffect(() => {
    void reload().catch((error) => {
      console.error("加载模板失败：", error);
      toast.show("加载模板失败，请检查数据目录权限。", "error");
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return templates;
    return templates.filter((template) => {
      const text = [template.name, template.description, ...template.tags].join(" ").toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [query, templates]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.show("请填写模板名称。", "error");
      return;
    }
    setSaving(true);
    const template: ArticleTemplate = {
      id: draft.id,
      name: name.slice(0, 80),
      description: draft.description.trim().slice(0, 300),
      tags: parseTemplateTags(draft.tags),
      content: draft.content,
      updatedAt: Date.now(),
    };
    try {
      await saveArticleTemplate(template);
      await reload(template.id);
      toast.show("模板已保存");
    } catch (error) {
      console.error("保存模板失败：", error);
      toast.show("保存模板失败，请检查数据目录权限。", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!templates.some((template) => template.id === draft.id)) return;
    if (!window.confirm(`确定删除模板“${draft.name}”吗？`)) return;
    try {
      await deleteArticleTemplate(draft.id);
      const loaded = await reload();
      setDraft(loaded[0] ? toDraft(loaded[0]) : blankDraft());
      toast.show("模板已删除");
    } catch (error) {
      console.error("删除模板失败：", error);
      toast.show("删除模板失败。", "error");
    }
  };

  const insert = () => {
    editorRef.current?.insertAtCursor(draft.content);
    onClose();
  };

  const replaceDocument = () => {
    const editor = editorRef.current;
    const snapshot = editor?.getDocumentSnapshot();
    if (!editor || !snapshot) return;
    if (!window.confirm("确定用此模板替换当前文章全文吗？当前内容会进入本地版本历史。")) return;
    if (!editor.replaceRange(0, snapshot.text.length, draft.content, snapshot.text)) {
      toast.show("文章内容已变化，请重试。", "error");
      return;
    }
    onClose();
  };

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({...current, [key]: value}));
  const exists = templates.some((template) => template.id === draft.id);

  return (
    <Dialog open title="模板与常用片段" onClose={onClose} width={940} contentPadding={false} initialFocusRef={searchRef}>
      <div className="flex h-[min(680px,78vh)] min-h-[420px]">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-secondary/35">
          <label className="m-3 flex h-9 items-center gap-2 rounded-sm border border-border bg-bg px-2">
            <Search size={15} className="text-text-muted" />
            <span className="sr-only">搜索模板</span>
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、标签" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none" />
          </label>
          <div className="flex gap-1 px-3 pb-2">
            <Button className="min-w-0 flex-1" onClick={() => setDraft(blankDraft())}><Plus size={14} />新建片段</Button>
            <Button title="把当前文章带入新模板" disabled={!currentDocumentPath} onClick={() => setDraft(blankDraft(currentContent, documentName(currentDocumentPath)))}><FilePlus2 size={14} /></Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? <div className="p-3 text-sm text-text-muted">正在加载…</div> : filtered.length === 0 ? <div className="p-3 text-sm text-text-muted">暂无模板</div> : filtered.map((template) => (
              <button key={template.id} type="button" onClick={() => setDraft(toDraft(template))} className={`mb-1 w-full rounded-sm px-3 py-2 text-left ${template.id === draft.id ? "bg-accent-subtle text-text" : "text-text-secondary hover:bg-bg-tertiary"}`}>
                <div className="truncate text-sm font-medium">{template.name}</div>
                <div className="mt-1 truncate text-xs text-text-muted">{template.tags.join(" · ") || template.description || "无标签"}</div>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border p-4">
            <label className="text-xs text-text-muted">名称<input value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={80} className="mt-1 h-9 w-full rounded-sm border border-border bg-bg-secondary px-3 text-sm text-text outline-none focus:border-accent" /></label>
            <label className="text-xs text-text-muted">标签（空格或逗号分隔）<input value={draft.tags} onChange={(event) => update("tags", event.target.value)} className="mt-1 h-9 w-full rounded-sm border border-border bg-bg-secondary px-3 text-sm text-text outline-none focus:border-accent" /></label>
            <label className="col-span-2 text-xs text-text-muted">说明<input value={draft.description} onChange={(event) => update("description", event.target.value)} maxLength={300} className="mt-1 h-9 w-full rounded-sm border border-border bg-bg-secondary px-3 text-sm text-text outline-none focus:border-accent" /></label>
          </div>
          <label className="flex min-h-0 flex-1 flex-col p-4 pt-3 text-xs text-text-muted">Markdown 内容
            <textarea value={draft.content} onChange={(event) => update("content", event.target.value)} spellCheck={false} className="mt-1 min-h-0 flex-1 resize-none rounded-sm border border-border bg-bg-secondary p-3 font-mono text-sm leading-6 text-text outline-none focus:border-accent" />
          </label>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div>{exists && <Button variant="ghost" className="text-danger" onClick={() => void remove()}><Trash2 size={14} />删除</Button>}</div>
            <div className="flex gap-2">
              <Button onClick={insert}>插入光标处</Button>
              <Button onClick={replaceDocument}>替换全文</Button>
              <Button variant="primary" state={saving ? "loading" : "idle"} onClick={() => void save()}>保存模板</Button>
            </div>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
