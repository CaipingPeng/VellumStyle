import {readDocument, writeDocument} from "./documents.ts";

export type DocumentTransform = (content: string) => string;
type BackgroundDocumentUpdater = (
  documentPath: string,
  transform: DocumentTransform,
) => Promise<boolean>;

export interface BackgroundDocumentTarget {
  path: string;
  cancelled: boolean;
}

let registeredUpdater: BackgroundDocumentUpdater | null = null;
let documentOperationQueue: Promise<void> = Promise.resolve();
const targets = new Set<BackgroundDocumentTarget>();

function enqueueDocumentOperation<T>(operation: () => Promise<T>): Promise<T> {
  const run = documentOperationQueue.catch(() => undefined).then(operation);
  documentOperationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function remapPath(path: string, fromPath: string, toPath: string): string | null {
  if (path === fromPath) return toPath;
  return path.startsWith(`${fromPath}/`)
    ? `${toPath}${path.slice(fromPath.length)}`
    : null;
}

function pathMatches(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function registerBackgroundDocumentUpdater(
  updater: BackgroundDocumentUpdater,
): () => void {
  registeredUpdater = updater;
  return () => {
    if (registeredUpdater === updater) registeredUpdater = null;
  };
}

export function createBackgroundDocumentTarget(path: string): BackgroundDocumentTarget {
  const target = {path, cancelled: false};
  targets.add(target);
  return target;
}

export function releaseBackgroundDocumentTarget(target: BackgroundDocumentTarget): void {
  targets.delete(target);
}

export function isBackgroundDocumentTargetCancelled(target: BackgroundDocumentTarget): boolean {
  return target.cancelled;
}

export function runBackgroundDocumentMutation<T>(
  mutation: () => Promise<T>,
  onCommitted?: (result: T) => void,
): Promise<T> {
  return enqueueDocumentOperation(async () => {
    const result = await mutation();
    onCommitted?.(result);
    return result;
  });
}

export function remapBackgroundDocumentTargets(fromPath: string, toPath: string): void {
  for (const target of targets) {
    const nextPath = remapPath(target.path, fromPath, toPath);
    if (nextPath !== null) target.path = nextPath;
  }
}

export function cancelBackgroundDocumentTargets(path: string): void {
  for (const target of targets) {
    if (pathMatches(target.path, path)) target.cancelled = true;
  }
}

// 所有文章写回和路径变更共用一条短队列，避免多个后台任务读到同一旧快照后互相覆盖。
export function updateDocumentInBackground(
  target: BackgroundDocumentTarget,
  transform: DocumentTransform,
): Promise<boolean> {
  return enqueueDocumentOperation(async () => {
    if (target.cancelled) return false;
    if (registeredUpdater) return registeredUpdater(target.path, transform);
    const content = await readDocument(target.path);
    if (target.cancelled) return false;
    const next = transform(content);
    if (next === content) return false;
    await writeDocument(target.path, next);
    return true;
  });
}

export function flushBackgroundDocumentOperations(): Promise<void> {
  return documentOperationQueue;
}
