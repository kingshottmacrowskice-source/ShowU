# ShowU-V2

为长期 AI 开发保存项目目的、当前任务、设计理由、完成证据和需求历史。规范是核心，桌面应用是读写这些规范文件的工具。

第一版采用 **Tauri 2 + React + TypeScript**，运行时不需要打开浏览器。Markdown 是事实源，不另建任务数据库。

## 开始使用

本次构建的 Windows 程序位于 `release/ShowU.exe`。双击启动后：

1. 点击「打开项目」，选择项目根目录。
2. 点击工具栏「补全管理文件」。它会创建缺少的根目录 `AGENTS.md`、`.showu` 骨架和 `.showu/skills/` 中的三项规范。已有项目也可以随时补全。已有 `AGENTS.md` 会保留，如需接入，请在其中引用这些规范。
3. 由你填写 `brief.md`，定义项目为什么存在与不能越过的边界。AI 只读这份文件。
4. 先读相关代码、比对模块需求并登记来源，再创建计划；尚未检查或存在冲突时不能创建执行计划。
5. 在文件树中查看 Markdown、编辑原文，或在计划下更新任务状态。外部 AI 改动会自动刷新；存在未保存草稿时会保留草稿并提示冲突。
6. 完成后记录实际验证与下一步，把 `.showu` 和代码一起提交到 Git。

「删除计划」会移除登记项，将任务文件保留在 `plans/archive/`；历史需求不会被一起删除。清理历史属于另外的用户决定。

## 让 AI 遵守规范

- 每次新会话：项目简介 → 计划索引 → 当前计划 → 相关模块需求 → 代码。
- 新计划：先读代码 → S3 比对需求 → 无冲突后 S2 创建计划 → 执行。
- 执行中：S1 更新任务、设计理由、验证证据与下一步。
- 同模块、同能力点、诉求相斥同时成立才算冲突；立即停止受影响工作，交用户裁决。

三个随项目交付的技能：

| 技能 | 入口 |
| --- | --- |
| S1 完成状态更新 | [showu-update-status](skills/showu-update-status/SKILL.md) |
| S2 计划创建 | [showu-create-plan](skills/showu-create-plan/SKILL.md) |
| S3 需求记录 | [showu-record-requirements](skills/showu-record-requirements/SKILL.md) |

本项目已在 [AGENTS.md](AGENTS.md) 引用它们。其他项目请把技能放到所用 AI 工具支持的技能目录，并在该工具的项目指令入口引用读取流程；本软件不会擅自覆盖其他工具的配置。**文件存在不等于 AI 自动遵守，软件也不会进行自动语义冲突检测。**

## 启动器和 Git

启动器通过应用内 JSON 配置名称和 `commands` 数组，每项使用独立的 `program`、`args`。`{project}` 会替换为当前项目目录；多个命令组成组合启动。Windows `.lnk` 可直接配置为 program，参数请写在快捷方式属性中。AI 终端程序应使用本机可执行文件或命令路径；IDE 参数依实际工具设置。

项目列表与启动器定义存储在应用配置目录中的 `settings.json`，Windows 通常为 `%APPDATA%/com.showu.desktop/`，不会进入项目仓库。

Git 提供链接 origin、状态、fetch 后检查领先/落后、pull（仅快进）和 push（不强推）。链接不会 clone；应用不自动提交或设置上游。认证及首次上游配置使用本机 Git / IDE；真实远程操作要具备相应权限。第一版不实现分支、diff 或提交界面。

## 开发和构建

需要 Node.js 22.12+（本次使用 24.14）、Rust stable、Git。Windows 还需要 Microsoft C++ Build Tools 与 WebView2，参见 [Tauri 官方前置条件](https://v2.tauri.app/start/prerequisites/)。本次已安装 Rust 与 C++ 工具链；新终端会读取更新后的 PATH。

```powershell
npm ci
npm run tauri dev
```

正式构建：`npm run tauri build`，输出 `src-tauri/target/release/showu.exe`。`npm run package:win` 会同时整理程序、技能与协议到 `release/`。当前生成便携可执行文件，不生成安装器。`npm run dev` 仅用于前端预览，浏览器模式明确禁用本地项目能力。

```powershell
npm run check
npm test
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

界面测试使用本机 Edge 与模拟的 Tauri IPC，不读写真实用户项目。Rust 测试使用隔离临时目录，验证实际文件读写、文件监听、计划同步与本地 Git 仓库操作。Windows 测试清单的兼容处理见 build.rs 及 [Tauri 上游问题](https://github.com/tauri-apps/tauri/issues/13419)。

## 维护入口与边界

- 唯一需求事实源：[docs/requirements.md](docs/requirements.md)。只有用户主动提出或明确确认的内容才算需求。
- 实现约定：[docs/protocol.md](docs/protocol.md)。格式、恢复顺序、冲突处理与保存语义。
- 本轮计划及完成证据：[initial-release](.showu/plans/initial-release.md)。
- `src/domain.ts`：Markdown 解析和任务状态；`src/components/`：编辑器、计划表单、工具页面；`src/api.ts`：桌面调用边界。
- `src-tauri/src/storage.rs`：路径约束、原文比对与原子替换；`src-tauri/src/lib.rs`：桌面命令、项目配置、监听、启动器与 Git。

软件保存时会核对读取时原文，但不提供跨进程数据库事务；多个写入者应串行修改同一文件，断电与跨文件极端故障仍需依靠 Git 恢复。计划完成状态仍需创建者结合实际验证判断，不能仅靠勾选保证正确。

跨 AI 聊天迁移、桌面替代以及复杂 Git 功能不在第一版范围。上一版 `../ShowU` 的设计不自动成为本版需求。数周至数月的有效性需要在实际使用中持续检验，目前不宣称已经完成长期实证。
