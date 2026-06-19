import type {DocNode} from "../../utils/documents.ts";

export function countDescendants(node: DocNode): number {
  if (!node.isDir) return 0;
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

export function isRecursiveDelete(node: DocNode): boolean {
  return node.isDir && countDescendants(node) > 0;
}

export function getDeleteConfirmationMessage(node: DocNode): string {
  if (!isRecursiveDelete(node)) {
    return `确定删除“${node.name}”？`;
  }

  const count = countDescendants(node);
  return [
    `确定删除文件夹“${node.name}”？`,
    "",
    `将同时删除其中的 ${count} 个子项（包含子文件夹和子文件）。此操作不可撤销，请谨慎确认。`,
  ].join("\n");
}
