export type CommentFlag = 0 | 1;

export interface PublishSettings {
  author: string;
  needOpenComment: CommentFlag;
  onlyFansCanComment: CommentFlag;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const PUBLISH_SETTINGS_STORAGE_KEY = "vellumstyle.publishSettings";

export const DEFAULT_PUBLISH_SETTINGS: PublishSettings = {
  author: "",
  needOpenComment: 0,
  onlyFansCanComment: 0,
};

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isCommentFlag(value: unknown): value is CommentFlag {
  return value === 0 || value === 1;
}

export function loadPublishSettings(storage: StorageLike | null = getBrowserStorage()): PublishSettings {
  if (!storage) return DEFAULT_PUBLISH_SETTINGS;

  try {
    const raw = storage.getItem(PUBLISH_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_PUBLISH_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<PublishSettings>;
    if (
      typeof parsed.author !== "string" ||
      !isCommentFlag(parsed.needOpenComment) ||
      !isCommentFlag(parsed.onlyFansCanComment)
    ) {
      return DEFAULT_PUBLISH_SETTINGS;
    }

    return {
      author: parsed.author,
      needOpenComment: parsed.needOpenComment,
      onlyFansCanComment: parsed.onlyFansCanComment,
    };
  } catch {
    return DEFAULT_PUBLISH_SETTINGS;
  }
}

export function savePublishSettings(settings: PublishSettings, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(
      PUBLISH_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        author: settings.author,
        needOpenComment: settings.needOpenComment,
        onlyFansCanComment: settings.onlyFansCanComment,
      }),
    );
  } catch {
    // localStorage may be unavailable in restricted webviews. Publishing should still work.
  }
}
