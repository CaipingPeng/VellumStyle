import {isTauriRuntime} from "./tauriEnv.ts";

export interface LocalUser {
  id: string;
  name: string;
  ownsLegacyData: boolean;
}

let activeUser: LocalUser | null = null;
const PREFIX = "vellumstyle.user.";

export function getActiveUser(): LocalUser | null { return activeUser; }

export function scopeStorage(raw: Storage, userId: string | null): Storage {
  // Web preview keeps its existing storage. Desktop state is inaccessible before login.
  if (!userId && !isTauriRuntime()) return raw;
  const prefix = `${PREFIX}${userId ?? "locked"}.`;
  const keys = () => Array.from({length: raw.length}, (_, i) => raw.key(i)!)
    .filter((key) => key.startsWith(prefix));
  return {
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    getItem(key) { return raw.getItem(prefix + key); },
    setItem(key, value) { raw.setItem(prefix + key, value); },
    removeItem(key) { raw.removeItem(prefix + key); },
    clear() { for (const key of keys()) raw.removeItem(key); },
  };
}

export function profileStorage(raw: Storage = window.localStorage): Storage {
  return scopeStorage(raw, activeUser?.id ?? null);
}

export function activateUser(user: LocalUser): void {
  if (activeUser && activeUser.id !== user.id) throw new Error("切换用户需要重启应用");
  activeUser = user;
  if (!user.ownsLegacyData) return;
  const raw = window.localStorage;
  const scoped = profileStorage(raw);
  // Copy all legacy application keys once, then remove the unscoped originals.
  // Writing the marker last makes interrupted migrations safe to retry.
  if (scoped.getItem("legacy-migrated") === "1") return;
  const keys = Array.from({length: raw.length}, (_, i) => raw.key(i)!)
    .filter((key) => (key === "vellumstyle" || key.startsWith("vellumstyle.") || key === "vs-video-media-ids" || key === "vs-audio-bindings") && !key.startsWith(PREFIX));
  for (const key of keys) {
    if (scoped.getItem(key) === null) scoped.setItem(key, raw.getItem(key)!);
  }
  for (const key of keys) raw.removeItem(key);
  scoped.setItem("legacy-migrated", "1");
}
