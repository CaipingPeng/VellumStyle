interface TauriRuntimeLike {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
}

export function isTauriRuntime(target: unknown = globalThis): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const maybe = target as TauriRuntimeLike;
  return typeof maybe.__TAURI_INTERNALS__?.invoke === "function";
}
