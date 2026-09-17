import {entryBasename, entryStem} from "../../utils/documents.ts";

// name 在桌面端已去掉 .md，浏览器端和刷新前的节点则可能带扩展名。
// 只能从真实路径取一次主名，不能对显示名再次拆扩展名。
export function renameInitialValue(node: {path: string; isDir: boolean}): string {
  const basename = entryBasename(node.path);
  return node.isDir ? basename : entryStem(basename);
}

export function isUnchangedRename(node: {path: string; isDir: boolean}, value: string): boolean {
  return value === renameInitialValue(node)
    || (!node.isDir && value === entryBasename(node.path));
}

// 重命名会话的共享类型。
// 会话由 DocTree 单点持有（整棵树同一时刻只有一个节点在改名），弹层负责呈现与提交。
export interface RenameSession {
  path: string;
  value: string;
  isDir: boolean; // 文件夹不自动补 .md，名字中的点号原样保留
  error: string | null; // 行内校验/失败原因，非空表示不可提交
  pending: boolean; // 已提交换名命令，等后端返回
}
