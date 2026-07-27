export type ManualSyncShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

export function isManualSyncShortcut(event: ManualSyncShortcutEvent): boolean {
  return event.key.toLowerCase() === "s"
    && (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey;
}
