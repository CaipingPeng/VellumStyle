import {readDocument, writeDocument} from "./documents.ts";

export type DocumentTransform = (content: string) => string;
type BackgroundDocumentUpdater = (
  documentPath: string,
  transform: DocumentTransform,
) => Promise<boolean>;

let registeredUpdater: BackgroundDocumentUpdater | null = null;

export function registerBackgroundDocumentUpdater(
  updater: BackgroundDocumentUpdater,
): () => void {
  registeredUpdater = updater;
  return () => {
    if (registeredUpdater === updater) registeredUpdater = null;
  };
}

// 后台任务更新文章时始终基于最新内容，避免覆盖用户在上传期间的编辑。
export async function updateDocumentInBackground(
  documentPath: string,
  transform: DocumentTransform,
): Promise<boolean> {
  if (registeredUpdater) return registeredUpdater(documentPath, transform);
  const content = await readDocument(documentPath);
  const next = transform(content);
  if (next === content) return false;
  await writeDocument(documentPath, next);
  return true;
}
