# 桌面管理器

## 代码入口

- `src/App.tsx` — 工作区导航与总览。
- `src/workspace.ts` — 索引汇总、按需读取及文档链接。
- `src/components/` — 编辑器、首页摘要和工具界面。
- `src-tauri/src/lib.rs` — 原生工作区、计划操作及监听。
- `src-tauri/src/storage.rs` — 安全文件操作和索引定位。

- `src-tauri/src/shared.rs` — 公共工具快照、投递与项目指令。

## DESKTOP-001 桌面文件工作区
- 能力点：项目管理
- 诉求：Tauri 2 独立应用，左树右内容顶部工具栏；直接读写 .showu，监听文件变化；应用自行保存项目列表。
- 状态：active
- 操作：新增
- 来源：docs/requirements.md §2.1、2.9；initial-release / T2–T4

## DESKTOP-002 启动器
- 能力点：外部工具启动
- 诉求：可配置 AI 工具、IDE 带项目目录、多程序组合启动；定义保存在应用自身配置。
- 状态：active
- 操作：新增
- 来源：docs/requirements.md §2.6、2.9；initial-release / T5

## DESKTOP-003 Git
- 能力点：仓库同步
- 诉求：链接仓库、检查远程更新、push、pull；第一版不提供提交、分支管理。
- 状态：active
- 操作：新增
- 来源：docs/requirements.md §2.10；initial-release / T5

## DESKTOP-004 管理文件补全
- 能力点：项目初始化与修复
- 诉求：已添加项目可以补齐根目录 AGENTS.md 与管理文件。
- 状态：active
- 操作：新增
- 来源：2026-11-05 用户反馈；repair-files / T1

## DESKTOP-005 启动编排
- 能力点：组合启动配置
- 诉求：拖入 exe 或快捷方式，拖拽排序，可配置间隔或并行启动。
- 状态：active
- 操作：新增
- 来源：用户本轮反馈；launcher-order / T1、T2

## DESKTOP-006 独立启动
- 能力点：外部工具启动
- 诉求：没有选择项目时也能启动。
- 状态：active
- 操作：新增
- 来源：用户本轮反馈；standalone-launch / T1

## DESKTOP-007 项目首页
- 能力点：项目列表展示
- 诉求：增加首页，以卡片形式显示所有项目。
- 状态：active
- 操作：新增
- 来源：2026-11-06 用户要求；project-home / T1

## DESKTOP-008 卡片摘要
- 能力点：项目列表展示
- 诉求：卡片展示简介文字和几项未完成计划。
- 状态：active
- 操作：新增
- 来源：2026-11-06 用户要求；project-summary / T1

## DESKTOP-009 计划筛选
- 能力点：项目总览
- 诉求：按计划状态筛选。
- 状态：active
- 操作：新增
- 来源：2026-11-06 用户要求；plan-filter / T1

## DESKTOP-010 计划展示顺序
- 能力点：项目总览
- 诉求：计划列表优先展示未完成计划。
- 状态：active
- 操作：新增
- 来源：docs/requirements.md §2.4；2026-11-06 用户要求；unfinished-plans-first / T1

## DESKTOP-011 公共工具
- 能力点：公共工具导入与分发
- 诉求：见 docs/requirements.md §2.12。
- 状态：active
- 操作：新增
- 来源：shared-tools / T1、T2；用户 2026-11-07 确认。
