import {invoke} from "@tauri-apps/api/core";
import {isTauriRuntime} from "./tauriEnv.ts";

export interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  content: string;
  updatedAt: number;
}

const STORAGE_KEY = "vellumstyle.article-templates.v1";
let memoryTemplates: ArticleTemplate[] = [];

function readWebTemplates(): ArticleTemplate[] {
  if (typeof localStorage === "undefined") return memoryTemplates;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isTemplate) : [];
  } catch {
    return [];
  }
}

function writeWebTemplates(templates: ArticleTemplate[]): void {
  memoryTemplates = templates;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
      // 无痕模式或禁用站点存储时仍保留当前会话中的模板。
    }
  }
}

function isTemplate(value: unknown): value is ArticleTemplate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ArticleTemplate>;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.content === "string"
    && typeof item.updatedAt === "number"
    && Array.isArray(item.tags);
}

export async function listArticleTemplates(): Promise<ArticleTemplate[]> {
  const templates = isTauriRuntime()
    ? await invoke<ArticleTemplate[]>("list_article_templates")
    : readWebTemplates();
  return [...templates].sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function saveArticleTemplate(template: ArticleTemplate): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_article_template", {template});
    return;
  }
  const templates = readWebTemplates();
  const index = templates.findIndex((item) => item.id === template.id);
  if (index === -1) templates.push(template);
  else templates[index] = template;
  writeWebTemplates(templates);
}

export async function deleteArticleTemplate(id: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("delete_article_template", {id});
    return;
  }
  writeWebTemplates(readWebTemplates().filter((template) => template.id !== id));
}

export function createTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `template-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseTemplateTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(/[,，\s]+/)) {
    const tag = raw.trim().slice(0, 30);
    const key = tag.toLocaleLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, 12);
}
