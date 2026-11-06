# ShowU 开发入口

每次开始或恢复开发，先读 `docs/requirements.md`、`.showu/brief.md`、`.showu/plans.md`，再读当前计划及相关模块需求，最后核对代码。聊天不能替代仓库记录。

- 唯一需求事实源是 `docs/requirements.md`；实现约定在 `docs/protocol.md`，约定不是新增用户需求。
- `brief.md` 属于用户，AI 不修改。当前文件只原样收录用户本次表达的宗旨。
- 一次性查找、解释或核对信息，直接答复，不登记模块需求、计划或任务，也不更新完成状态。若用户随后明确要求修改项目或长期遵守某项约定，只对新增的项目要求执行相应流程。
- 新计划使用 `skills/showu-create-plan/SKILL.md` 与 `skills/showu-record-requirements/SKILL.md`；完成工作使用 `skills/showu-update-status/SKILL.md`。
- 同模块、同能力点、诉求相斥同时成立才是冲突。发现冲突立即停止受影响任务，将证据交用户裁决，不自行覆盖历史。
- 未运行的验证不能写成通过。保持计划的当前进度、设计理由、验证证据及下一步准确。
- 不读取上一版作为本版默认需求。第一版不做跨工具聊天迁移、桌面替代或 Git 提交/分支管理。

开发：`npm install`；`npm run check`；`npm test`；`npm run build`；具备 Rust / Windows C++ 工具链后 `npm run tauri dev`。

规模维护按 `docs/protocol.md` 的“长期规模与分层”。计划年度索引也须检查 active/paused；按模块入口定位代码，历史正文按需追溯，不默认全读。
