// 测试用的 esbuild 运行时代码块应该落到哪里。
//
// 背景：三个测试（Preview / DocTree / Publish）都得先用 esbuild 打一个运行时包再 import，
// 因为 `src/store` 链路里用到了 Vite 的 `import.meta.glob`，node:test 直接加载会失败。
//
// 两个约束把位置卡死了：
//
// 1. **不能在系统临时目录。** 这些包配置了 `packages: "external"`，
//    react / react-dom 等裸包名会**保留为运行时 import**，由 Node 从产物所在目录
//    沿目录树向上找 `node_modules`。放到 `os.tmpdir()` 会直接
//    `ERR_MODULE_NOT_FOUND: Cannot find package 'react'`。
//
// 2. **也不该放在源码树里。** 原来是写在 `src/components/<域>/` 下，
//    一旦 `after()` 清理失败（例如被沙箱的批量删除守卫拦下），产物就会永久留在源码里 ——
//    本项目就因此攒下过 6 个 `src/components/Preview/` 下的孤儿文件。
//
// 折中：放仓库根目录的 `.vs-test-runtime/`。它仍在 `node_modules` 的解析范围内，
// 又不在 `src/` 里，不会被 tsc / vite 扫到；文件名沿用 `*.runtime-*.mjs`，
// 已被 `.gitignore` 覆盖。
import {mkdirSync} from "node:fs";
import {join} from "node:path";

export function tempRuntimePath(name: string): string {
  const dir = join(process.cwd(), ".vs-test-runtime");
  // 顺带建目录，调用方就能在模块顶层直接拿到路径。
  mkdirSync(dir, {recursive: true});
  return join(dir, `${name}.runtime-${process.pid}.mjs`);
}
