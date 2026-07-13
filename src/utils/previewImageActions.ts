import {invoke} from "@tauri-apps/api/core";
import {fromProxyImageUrl} from "./imageProxy.ts";
import {isTauriRuntime} from "./tauriEnv.ts";

export interface PreviewImageAsset {
  bytesBase64: string;
  mimeType: string;
  fileName: string;
  extension: string;
}

export type SavePreviewImageResult =
  | {status: "saved"; path: string}
  | {status: "cancelled"};

interface SaveDialogOptions {
  defaultPath?: string;
  filters?: Array<{name: string; extensions: string[]}>;
}

interface PreviewImageDialog {
  save: (options?: SaveDialogOptions) => Promise<string | null>;
}

type PreviewImageInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export interface PreviewImageActionDependencies {
  invoke: PreviewImageInvoke;
  isTauriRuntime: () => boolean;
  loadDialog: () => Promise<PreviewImageDialog>;
}

export async function copyPreviewImage(
  source: string,
  dependencyOverrides: Partial<PreviewImageActionDependencies> = {},
): Promise<void> {
  const restoredSource = fromProxyImageUrl(source);
  const dependencies = createPreviewImageActionDependencies(dependencyOverrides);
  ensureImageActionsSupported(dependencies);

  await dependencies.invoke<void>("copy_preview_image", {source: restoredSource});
}

export async function savePreviewImageAs(
  source: string,
  dependencyOverrides: Partial<PreviewImageActionDependencies> = {},
): Promise<SavePreviewImageResult> {
  const restoredSource = fromProxyImageUrl(source);
  const dependencies = createPreviewImageActionDependencies(dependencyOverrides);
  ensureImageActionsSupported(dependencies);

  const asset = await dependencies.invoke<PreviewImageAsset>("get_preview_image_asset", {
    source: restoredSource,
  });
  const {save} = await dependencies.loadDialog();
  const path = await save({
    defaultPath: asset.fileName,
    filters: [{
      name: asset.mimeType,
      extensions: [asset.extension.replace(/^\./, "")],
    }],
  });

  if (path === null) {
    return {status: "cancelled"};
  }

  await dependencies.invoke<void>("write_preview_image_asset", {
    path,
    bytesBase64: asset.bytesBase64,
  });
  return {status: "saved", path};
}

function createPreviewImageActionDependencies(
  overrides: Partial<PreviewImageActionDependencies>,
): PreviewImageActionDependencies {
  return {
    invoke,
    isTauriRuntime,
    loadDialog: () => import("@tauri-apps/plugin-dialog"),
    ...overrides,
  };
}

function ensureImageActionsSupported(dependencies: PreviewImageActionDependencies): void {
  if (!dependencies.isTauriRuntime()) {
    throw new Error("当前环境不支持图片操作");
  }
}
