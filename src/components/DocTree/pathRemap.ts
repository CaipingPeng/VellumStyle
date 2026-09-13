// 路径重映射工具：改名/移动后同步迁移所有按路径索引的运行期状态
// （树节点、展开集合、选中项、当前文档）。纯函数，便于单测。
import type {DocNode} from "../../utils/documents.ts";

// 单条路径重映射：自身 → 新路径；子树 → 新前缀；无关路径原样返回。
export function remapPath(path: string | null, fromPath: string, toPath: string): string | null {
  if (!path) return path;
  if (path === fromPath) return toPath;
  return path.startsWith(`${fromPath}/`) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

// 展开态按路径存 key：文件夹改名后旧 key 会变成死键（子树莫名收起），
// 这里把整棵子树的 key 一起迁移，并把新路径的祖先目录一并展开。
export function remapExpandedPaths(
  expanded: ReadonlySet<string>,
  fromPath: string,
  toPath: string,
  extraPaths: Iterable<string> = [],
): Set<string> {
  const next = new Set<string>();
  for (const path of expanded) {
    const remapped = remapPath(path, fromPath, toPath);
    if (remapped) next.add(remapped);
  }
  for (const path of extraPaths) next.add(path);
  return next;
}

// 乐观替换：把 oldPath 及其整棵子树重映射为 newPath，
// 不必等后端全量重扫就能让改名结果立刻反映到树上。
export function replaceTreePaths(nodes: DocNode[], oldPath: string, newPath: string): DocNode[] {
  const rename = (path: string): string => remapPath(path, oldPath, newPath) ?? path;

  const walk = (list: DocNode[]): DocNode[] => list.map((node) => {
    const path = rename(node.path);
    return {
      ...node,
      name: path === node.path ? node.name : basenameOf(path),
      path,
      children: node.children.length > 0 ? walk(node.children) : node.children,
    };
  });

  return walk(nodes);
}

function basenameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
