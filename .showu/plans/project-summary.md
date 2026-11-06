# 卡片简介与计划

status: done

## 目的与来源
2026-11-06 用户要求卡片展示简介和几项未完成计划。

## 代码现状与冲突检查
已读 App.tsx、api.ts、domain.ts、style.css、原生 lib.rs/storage.rs 及 DESKTOP-001、007。现有读取接口依赖当前项目。新增只读摘要接口，与既有需求可共存，无冲突。

## 任务
- [x] T1 安全读取已登记项目摘要，卡片显示简介和未完成计划
- [x] T2 验证前端与原生代码并更新打包产物

## 设计理由
复用 brief.md、plans.md；最多展示三项 active/paused 计划，排除 done/cancelled，保留索引顺序。简介去除常见 Markdown 标记并限制显示三行。不切换工作区，读取失败和缺失文件分别提示。首页进入、窗口聚焦及每 15 秒更新摘要。延续上次交付方式更新 release/ShowU.exe。

## 验证与下一步
已完成摘要接口与卡片展示。npm run check、npm test（5 项）、npm run test:ui（8 项，含新增卡片用例）、cargo test（9 项）、npm run package:win 全部通过。release/ShowU.exe 已更新并与构建产物 SHA256 校验一致。未进行原生桌面人工验收。

## 下一步
开发与打包完成。
