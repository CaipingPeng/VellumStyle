let activeAppId = "";

export function setStorageAccount(appId: string): void { activeAppId = appId; }

export function scopeAccountStorage(raw: Storage, appId: string): Storage {
  if (!appId) return raw;
  const prefix = `vellumstyle.wechat.${encodeURIComponent(appId)}.`;
  const keys = () => Array.from({length: raw.length}, (_, i) => raw.key(i)!).filter((key) => key.startsWith(prefix));
  return {
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    getItem(key) { return raw.getItem(prefix + key); },
    setItem(key, value) { raw.setItem(prefix + key, value); },
    removeItem(key) { raw.removeItem(prefix + key); },
    clear() { for (const key of keys()) raw.removeItem(key); },
  };
}

export function accountStorage(raw: Storage = window.localStorage): Storage {
  return scopeAccountStorage(raw, activeAppId);
}

export function recoverSharedPreferences(raw: Storage): void {
  if (raw.getItem("vellumstyle.sharedPreferencesRecovered") === "1") return;
  const keys = Array.from({length: raw.length}, (_, i) => raw.key(i)!);
  const marker = keys.find((key) => /^vellumstyle\.user\.[^.]+\.legacy-migrated$/.test(key));
  if (!marker) return;
  const prefix = marker.slice(0, -"legacy-migrated".length);
  for (const key of keys.filter((key) => key.startsWith(prefix) && key !== marker)) {
    const sharedKey = key.slice(prefix.length);
    if (raw.getItem(sharedKey) === null) raw.setItem(sharedKey, raw.getItem(key)!);
  }
  raw.setItem("vellumstyle.sharedPreferencesRecovered", "1");
}

// Only the original account receives legacy bindings. Other AppIDs always start
// with empty mappings; switching never copies one account's media IDs to another.
export function migrateLegacyAccountStorage(raw: Storage, firstAppId: string): void {
  if (!firstAppId || raw.getItem("vellumstyle.wechat.legacyAccount")) return;
  const scoped = scopeAccountStorage(raw, firstAppId);
  for (const key of ["vs-video-media-ids", "vs-audio-bindings", "vellumstyle.publishSettings", "vellumstyle.wechat.lastOutboundIp"]) {
    const value = raw.getItem(key);
    if (value !== null && scoped.getItem(key) === null) scoped.setItem(key, value);
  }
  raw.setItem("vellumstyle.wechat.legacyAccount", firstAppId);
}
