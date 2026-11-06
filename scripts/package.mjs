import { copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "release");
await mkdir(output, { recursive: true });
await copyFile(
  path.join(root, "src-tauri/target/release/showu.exe"),
  path.join(output, "ShowU.exe"),
);
await cp(path.join(root, "skills"), path.join(output, "skills"), {
  recursive: true,
});
await mkdir(path.join(output, "scripts"), { recursive: true });
await copyFile(path.join(root, "scripts/records.mjs"), path.join(output, "scripts/records.mjs"));
await mkdir(path.join(output, "docs"), { recursive: true });
await copyFile(
  path.join(root, "docs/protocol.md"),
  path.join(output, "docs/protocol.md"),
);
await writeFile(
  path.join(output, "使用说明.md"),
  `# ShowU 0.1.0\n\n双击 ShowU.exe，打开项目根目录。没有 .showu 时点击初始化，由你填写 brief.md。\n\n新计划先读代码、比对模块需求，再创建计划。完成后记录证据与下一步。\n\n本目录附带 skills/ 中的三项 AI 技能、docs/protocol.md 文件协议及 scripts/records.mjs 维护工具（运行工具需要 Node.js，应用本身不需要）。请在所用 AI 工具的项目指令入口引用读取流程；应用不会自动安装技能或修改工具配置。\n\n需要 Windows 和 WebView2 运行时；Git 功能需要本机 Git，启动器需要配置实际程序路径。此版本不提供自动语义冲突检测或聊天迁移。\n`,
  "utf8",
);
console.log("已生成 release/ShowU.exe、技能和文件协议。");
