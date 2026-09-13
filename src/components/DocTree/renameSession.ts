// 重命名会话的共享类型。
// 会话由 DocTree 单点持有（整棵树同一时刻只有一个节点在改名），弹层负责呈现与提交。
export interface RenameSession {
  path: string;
  value: string;
  isDir: boolean; // 命名规则不同：文件夹不允许带扩展名
  error: string | null; // 行内校验/失败原因，非空表示不可提交
  pending: boolean; // 已提交换名命令，等后端返回
}
