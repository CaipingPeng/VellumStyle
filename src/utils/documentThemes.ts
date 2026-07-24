// 每篇文章的排版主题映射。
// 映射会镜像到 documents/.vellumstyle-theme-map.json，随文档一起参与云同步。

export const DOCUMENT_THEME_MAP_FILE = ".vellumstyle-theme-map.json";

export type DocumentThemeMap = Record<string, string>;

/**
 * 将文章记录的主题解析为本机当前可用的主题。
 * 这里只返回展示用 ID，不改写文章映射；缺少的自定义主题以后重新安装后仍可恢复。
 */
export function resolveAvailableThemeId(
  themes: ReadonlyArray<{id: string}>,
  requestedThemeId: string,
  fallbackThemeId: string,
): string {
  return themes.some((theme) => theme.id === requestedThemeId) ? requestedThemeId : fallbackThemeId;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** 只接受简单的 path -> themeId 对象，忽略损坏或不安全的条目。 */
export function sanitizeDocumentThemeMap(raw: unknown): DocumentThemeMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const result: DocumentThemeMap = {};
  for (const [rawPath, rawThemeId] of Object.entries(raw)) {
    if (typeof rawThemeId !== "string" || !rawThemeId.trim()) {
      continue;
    }
    const path = normalizePath(rawPath.trim());
    if (!path || path.split("/").some((part) => part === "." || part === "..")) {
      continue;
    }
    result[path] = rawThemeId.trim();
  }
  return result;
}

export function parseDocumentThemeMap(text: string): DocumentThemeMap {
  if (!text.trim()) {
    return {};
  }
  try {
    return sanitizeDocumentThemeMap(JSON.parse(text));
  } catch {
    return {};
  }
}

/** 返回一份不可变更新后的映射；空 path 不会写入。 */
export function setDocumentTheme(
  map: DocumentThemeMap,
  path: string | null,
  themeId: string,
): DocumentThemeMap {
  if (!path) {
    return {...map};
  }
  return {...map, [normalizePath(path)]: themeId};
}

/** 将文件或文件夹路径下的主题记录迁移到新路径。 */
export function remapDocumentThemes(
  map: DocumentThemeMap,
  fromPath: string,
  toPath: string,
): DocumentThemeMap {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);
  if (!from || !to || from === to) {
    return {...map};
  }

  const result: DocumentThemeMap = {};
  for (const [path, themeId] of Object.entries(map)) {
    if (path === from || path.startsWith(`${from}/`)) {
      result[`${to}${path.slice(from.length)}`] = themeId;
    } else {
      result[path] = themeId;
    }
  }
  return result;
}

/** 删除文件或文件夹路径下的主题记录。 */
export function removeDocumentThemes(map: DocumentThemeMap, path: string): DocumentThemeMap {
  const target = normalizePath(path);
  if (!target) {
    return {...map};
  }
  return Object.fromEntries(
    Object.entries(map).filter(([entryPath]) => entryPath !== target && !entryPath.startsWith(`${target}/`)),
  );
}
