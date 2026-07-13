import {copyPlainText} from "../../utils/clipboard.ts";
import {getEntryAbsolutePath} from "../../utils/documents.ts";

export async function copyAbsolutePath(
  path: string,
  getPath: (path: string) => Promise<string> = getEntryAbsolutePath,
  copyText: (text: string) => Promise<boolean> = copyPlainText,
): Promise<void> {
  const absolutePath = await getPath(path);
  if (!(await copyText(absolutePath))) {
    throw new Error("复制绝对路径失败");
  }
}
