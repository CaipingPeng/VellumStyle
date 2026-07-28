import {listen, type UnlistenFn} from "@tauri-apps/api/event";

export type ImageUploadPhase =
  | "queued"
  | "reading"
  | "resolving"
  | "processing"
  | "downloading"
  | "preparing"
  | "compressing"
  | "uploading"
  | "completed"
  | "failed";

export type ImageUploadStatus = "active" | "success" | "error";

export interface ImageUploadTask {
  id: string;
  filename: string;
  category: "正文图片" | "导入图片" | "封面图片" | "文章导入" | "素材库图片";
  documentPath?: string;
  documentTitle?: string;
  phase: ImageUploadPhase;
  status: ImageUploadStatus;
  originalSize?: number;
  outputSize?: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface ImageUploadTaskContext {
  category?: ImageUploadTask["category"];
  documentPath?: string | null;
  documentTitle?: string;
}

export interface ImageUploadProgressEvent {
  taskId: string;
  phase: Exclude<ImageUploadPhase, "completed" | "failed">;
  filename: string;
  originalSize?: number | null;
  outputSize?: number | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let tasks: ImageUploadTask[] = [];
let fallbackId = 0;
const FINISHED_RETENTION_MS = 60_000;

function emit() {
  for (const listener of listeners) listener();
}

function replaceTask(id: string, update: (task: ImageUploadTask) => ImageUploadTask) {
  let changed = false;
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    changed = true;
    return update(task);
  });
  if (changed) emit();
}

function newTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `image-upload-${Date.now()}-${fallbackId}`;
}

function trimHistory(items: ImageUploadTask[]): ImageUploadTask[] {
  const active = items.filter((task) => task.status === "active");
  const finished = items.filter((task) => task.status !== "active").slice(0, 50);
  return [...active, ...finished].sort((a, b) => b.startedAt - a.startedAt);
}

export const imageUploadTasks = {
  start(
    filename: string,
    category: ImageUploadTask["category"],
    context: Omit<ImageUploadTaskContext, "category"> = {},
  ): string {
    const id = newTaskId();
    const now = Date.now();
    tasks = trimHistory([
      {
        id,
        filename: filename || "图片",
        category,
        documentPath: context.documentPath || undefined,
        documentTitle: context.documentTitle,
        phase: "reading",
        status: "active",
        startedAt: now,
        updatedAt: now,
      },
      ...tasks,
    ]);
    emit();
    return id;
  },

  progress(event: ImageUploadProgressEvent) {
    replaceTask(event.taskId, (task) => ({
      ...task,
      filename: event.filename || task.filename,
      phase: event.phase,
      originalSize: event.originalSize ?? task.originalSize,
      outputSize: event.outputSize ?? task.outputSize,
      updatedAt: Date.now(),
    }));
  },

  complete(id: string) {
    const now = Date.now();
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id === id) {
        changed = true;
        return {
          ...task,
          phase: "completed",
          status: "success",
          updatedAt: now,
          expiresAt: now + FINISHED_RETENTION_MS,
        };
      }
      if (task.status === "success") {
        return {...task, expiresAt: now + FINISHED_RETENTION_MS};
      }
      return task;
    });
    tasks = trimHistory(tasks);
    if (changed) emit();
  },

  fail(id: string, error: unknown) {
    const message = typeof error === "string" ? error : (error as Error)?.message || "图片上传失败";
    const now = Date.now();
    let changed = false;
    tasks = tasks.map((task) => {
      if (task.id === id) {
        changed = true;
        return {
          ...task,
          phase: "failed",
          status: "error",
          error: message,
          updatedAt: now,
          expiresAt: undefined,
        };
      }
      if (task.status === "success") {
        return {...task, expiresAt: now + FINISHED_RETENTION_MS};
      }
      return task;
    });
    tasks = trimHistory(tasks);
    if (changed) emit();
  },

  clearFinished() {
    tasks = tasks.filter((task) => task.status === "active");
    emit();
  },

  remapDocumentPaths(fromPath: string, toPath: string) {
    let changed = false;
    tasks = tasks.map((task) => {
      if (!task.documentPath) return task;
      const nextPath = task.documentPath === fromPath
        ? toPath
        : task.documentPath.startsWith(`${fromPath}/`)
          ? `${toPath}${task.documentPath.slice(fromPath.length)}`
          : null;
      if (nextPath === null) return task;
      changed = true;
      return {...task, documentPath: nextPath, documentTitle: nextPath.split("/").pop()};
    });
    if (changed) emit();
  },

  pruneExpired(now = Date.now()) {
    if (tasks.some((task) => task.status === "active")) return;
    const next = tasks.filter((task) => task.expiresAt === undefined || task.expiresAt > now);
    if (next.length === tasks.length) return;
    tasks = next;
    emit();
  },

  getSnapshot(): ImageUploadTask[] {
    return tasks;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function listenForImageUploadProgress(): Promise<UnlistenFn> {
  return listen<ImageUploadProgressEvent>("image-upload-progress", (event) => {
    imageUploadTasks.progress(event.payload);
  });
}
