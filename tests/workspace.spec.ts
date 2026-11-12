import { test, expect } from "@playwright/test";

const fixture = {
  "brief.md":
    "# 项目宗旨\n\n让 AI 在长期开发中知道项目为什么存在、当前任务、设计理由与完成证据。",
  "config.json": '{"schemaVersion":1}',
  "plans.md":
    "# 计划登记\n\n| 计划 | 状态 | 任务文件 |\n| --- | --- | --- |\n| 首版项目管理器 | active | [initial-release](plans/initial-release.md) |\n",
  "plans/initial-release.md":
    "# 首版项目管理器\n\nstatus: active\n\n## 任务\n\n- [ ] T1 验证文件保存\n- [x] T2 编写协议\n\n## 设计理由\n\nMarkdown 作为事实源。\n\n## 下一步\n\n验证外部修改保护。\n",
  "requirements/core.md":
    "# 核心规范\n\n## CORE-001 长期开发事实源\n\n- 能力点：上下文持续性\n- 诉求：记录目的、计划、决策与证据\n- 来源：initial-release / T1\n",
};

test.beforeEach(async ({ page }) => {
  // Only the native IPC boundary is mocked. Production has no demo or test adapter.
  await page.addInitScript(
    ({ docs }) => {
      const w = window as any;
      const callbacks = new Map<number, (e: any) => void>();
      const listeners = new Map<string, Set<number>>();
      let id = 0;
      const files: Record<string, string> = { ...docs };
      const calls: string[] = [];
      const tools: { tool: { id: string; source: string }; results: string[][] }[] = [];
      let instruction = "原项目指令";
      const settings = { projects: ["C:/Projects/ShowU"], launchers: [] };
      w.isTauri = true;
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      w.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback: (fn: (e: any) => void) => {
          callbacks.set(++id, fn);
          return id;
        },
        invoke: async (cmd: string, args: any = {}) => {
          calls.push(cmd);
          if (cmd === "plugin:event|listen") {
            if (!listeners.has(args.event))
              listeners.set(args.event, new Set());
            listeners.get(args.event)!.add(args.handler);
            return args.handler;
          }
          if (cmd === "plugin:event|unlisten") {
            listeners.get(args.event)?.delete(args.eventId);
            return;
          }
          if (cmd === "save_launchers") {
            settings.launchers = args.launchers;
            return;
          }
          if (cmd === "shared_tools") return tools;
          if (cmd === "import_tool") {
            tools.push({ tool: { id: "tool-demo", source: args.source }, results: [[settings.projects[0], "待评估"]] });
            return [];
          }
          if (cmd === "tool_instruction") {
            const addition = instruction.includes("tool-inbox") ? "" : "\n检查 .showu/tool-inbox";
            if (args.apply) {
              if (instruction !== args.expected) throw new Error("指令已修改");
              instruction += addition;
            }
            return { expected: instruction, addition };
          }
          if (cmd === "resend_tool") {
            if (args.path !== settings.projects[0] || args.id !== "tool-demo") throw new Error("投递目标错误");
            return;
          }
          if (cmd === "get_settings") return settings;
          if (cmd === "project_summary") return { brief: files["brief.md"], plans: files["plans.md"] };
          if (cmd === "launch") return ["已启动测试工具"];
          if (cmd === "select_project") return args.path;
          if (cmd === "list_files") return Object.keys(files);
          if (cmd === "read_file") {
            calls.push(`read:${args.path}`);
            if (!(args.path in files)) throw new Error("missing");
            return files[args.path];
          }
          if (cmd === "save_file") {
            if ((files[args.path] ?? null) !== args.expected)
              throw new Error("文件已被外部修改");
            files[args.path] = args.content;
            return;
          }
          if (cmd === "remove_project") {
            settings.projects = [];
            return;
          }
          if (cmd === "git_action") return "Git test output";
          throw new Error(`Unexpected command: ${cmd}`);
        },
      };
      w.__test = {
        settings,
        drop: (payload: unknown) =>
          listeners
            .get("tauri://drag-drop")
            ?.forEach((id) => callbacks.get(id)?.({ payload })),
        files,
        calls,
        externalEdit: (path: string, content: string) => {
          files[path] = content;
          listeners
            .get("showu-changed")
            ?.forEach((handler) =>
              callbacks.get(handler)?.({ payload: "C:/Projects/ShowU" }),
            );
        },
      };
    },
    { docs: fixture },
  );
  await page.goto("/");
  await page.getByLabel("当前项目").selectOption("C:/Projects/ShowU");
  await expect(
    page.getByRole("heading", { name: "ShowU", exact: true }),
  ).toBeVisible();
});

test("overview, directory tree and task changes reflect Markdown", async ({
  page,
}) => {
  await expect(page.getByText("2 项任务完成", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
  await page.getByTitle("plans/initial-release.md", { exact: true }).click();
  await page.getByLabel("T1 验证文件保存 状态").selectOption("blocked");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__test.files["plans/initial-release.md"],
      ),
    )
    .toContain("  status: blocked");
  await page.getByLabel("T1 验证文件保存 状态").selectOption("done");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__test.files["plans/initial-release.md"],
      ),
    )
    .toContain("- [x] T1");
  expect(
    await page.evaluate(
      () => (window as any).__test.files["plans/initial-release.md"],
    ),
  ).not.toContain("status: blocked");
});

test("external changes preserve drafts and prevent overwriting", async ({
  page,
}) => {
  await page.getByTitle("requirements/core.md", { exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("文件内容").fill("# 我的未保存草稿");
  await page.evaluate(() =>
    (window as any).__test.externalEdit(
      "requirements/core.md",
      "# AI 的新需求记录",
    ),
  );
  await expect(
    page.getByText(
      "磁盘内容已变化。你的草稿已保留，请复制需要的内容，再重新加载。",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("文件内容")).toHaveValue("# 我的未保存草稿");
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "项目总览", exact: false }).click();
  await expect(page.getByRole("dialog", { name: "确认操作" })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("文件内容")).toHaveValue("# 我的未保存草稿");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByLabel("文件内容")).toHaveValue("# AI 的新需求记录");
});

test("plan creation stops on unresolved conflict", async ({ page }) => {
  await page.getByRole("button", { name: "新建计划" }).click();
  await expect(
    page.getByRole("button", { name: "创建计划", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("冲突检查结论").selectOption("conflict");
  await expect(
    page.getByText(
      "停止创建和开发。请把旧需求、新诉求及冲突理由交给用户裁决。",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "创建计划", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__test.calls)).not.toContain(
    "create_plan",
  );
});

test("Git mutations require a deliberate action and can be cancelled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Git 同步" }).click();
  await page.getByRole("button", { name: "推送更新" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__test.calls)).not.toContain(
    "git_action",
  );
  await page.getByRole("button", { name: "检查远程更新" }).click();
  await expect(page.getByText("Git test output")).toBeVisible();
});

test("拖入组合、排序、设置间隔并保存", async ({ page }) => {
  await page.getByRole("button", { name: "快捷启动器" }).click();
  await page.getByRole("button", { name: "配置启动器" }).click();
  await page.locator(".launch-drop").evaluate((el) => {
    const { left, top } = el.getBoundingClientRect();
    (window as any).__test.drop({
      paths: ["C:/demo/a.exe", "C:/demo/b.lnk"],
      position: {
        x: (left + 5) * devicePixelRatio,
        y: (top + 5) * devicePixelRatio,
      },
    });
  });
  await expect(page.locator(".launch-step")).toHaveCount(2);
  await page
    .getByLabel("拖拽排序")
    .first()
    .dragTo(page.locator(".launch-step").last());
  await page.getByLabel("启动模式").selectOption("sequence");
  await page.getByLabel("间隔（秒）").fill("3");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__test.settings.launchers))
    .toEqual([
      {
        name: "a",
        sequential: true,
        commands: [
          { program: "C:/demo/b.lnk", args: [] },
          { program: "C:/demo/a.exe", args: [], delaySeconds: 3 },
        ],
      },
    ]);
});

test("连续新增后，从窗口拖入两个快捷方式可以直接保存", async ({ page }) => {
  await page.getByRole("button", { name: "快捷启动器" }).click();
  await page.getByRole("button", { name: "配置启动器" }).click();
  const add = page.getByRole("button", { name: "新增启动器" });
  await add.click();
  await add.click();
  const paths = ["C:/快捷方式/工具 A.lnk", "C:/快捷方式/工具 B.LNK"];
  await page.evaluate(
    (paths) =>
      (window as any).__test.drop({ paths, position: { x: 10, y: 10 } }),
    paths,
  );
  await expect(page.locator(".launch-step")).toHaveCount(2);
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__test.settings.launchers))
    .toEqual([
      {
        name: "新启动器",
        commands: paths.map((program) => ({ program, args: [] })),
      },
    ]);
});

test("未选择项目也能从快捷启动器启动", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "快捷启动器" }).click();
  await page.getByRole("button", { name: "配置启动器" }).click();
  await page.locator(".launch-drop").waitFor();
  await page.evaluate(() =>
    (window as any).__test.drop({
      paths: ["C:/tools/demo.lnk"],
      position: { x: 20, y: 20 },
    }),
  );
  await expect(page.locator(".launch-step")).toHaveCount(1);
  await page.getByRole("button", { name: "保存配置" }).click();
  await page.getByRole("button", { name: "启动", exact: true }).click();
  await expect(page.getByText("已启动测试工具")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__test.calls)).not.toContain(
    "select_project",
  );
});


test("首页卡片显示简介和最多三项未完成计划", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.__test.files["plans.md"] = [
      "| 第一项 | active | [one](plans/one.md) |",
      "| 暂停项 | paused | [two](plans/two.md) |",
      "| 第三项 | active | [three](plans/three.md) |",
      "| 第四项 | active | [four](plans/four.md) |",
      "| 完成项 | done | [done](plans/done.md) |",
      "| 取消项 | cancelled | [cancel](plans/cancel.md) |",
    ].join("\n");
  });
  await page.getByRole("button", { name: "首页", exact: true }).click();
  const cards = page.getByRole("region", { name: "所有项目" });
  await expect(cards).toContainText("让 AI 在长期开发中");
  await expect(cards).toContainText("未完成计划 · 4");
  await expect(cards).toContainText("暂停项");
  await expect(cards).toContainText("另有 1 项");
  await expect(cards).not.toContainText("完成项");
  await expect(cards).not.toContainText("取消项");
  await expect(cards).not.toContainText("第四项");
  await cards.getByRole("button").click();
  await expect(page.getByRole("heading", { name: "ShowU", exact: true })).toBeVisible();
});


test("计划状态筛选可切换并显示空结果", async ({ page }) => {
  const filters = page.getByRole("group", { name: "计划状态筛选" });
  await filters.getByRole("button", { name: "已完成" }).click();
  await expect(page.getByText("该状态下暂无计划。", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "进行中" }).click();
  await expect(page.locator(".plan-list")).toContainText("首版项目管理器");
  await expect(filters.getByRole("button", { name: "进行中" })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "全部" }).click();
  await expect(page.locator(".plan-list .plan-card")).toHaveCount(1);
});


test("历史索引展示但正文按需读取，历史需求不计为模块", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.__test.files["plans/indexes/2026.md"] = "| 历史计划 | done | [old](plans/old.md) |";
    w.__test.files["plans/old.md"] = "# 历史正文\nstatus: done\n- [x] T1 Old";
    w.__test.files["requirements/history/core/2025.md"] = "# 旧需求";
    w.__test.externalEdit("plans.md", w.__test.files["plans.md"] + "\n[2026](plans/indexes/2026.md)");
  });
  await expect(page.locator(".plan-list")).toContainText("历史计划");
  expect(await page.evaluate(() => (window as any).__test.calls.includes("read:plans/old.md"))).toBe(false);
  expect(await page.evaluate(() => (window as any).__test.calls.includes("read:requirements/history/core/2025.md"))).toBe(false);
  await page.locator(".plan-list").getByRole("button", {name: /历史计划/}).click();
  await expect(page.locator(".document")).toContainText("历史正文");
  expect(await page.evaluate(() => (window as any).__test.calls.includes("read:plans/old.md"))).toBe(true);
});


test("公共工具导入、项目指令预览和单项目重发", async ({page}) => {
  await page.getByRole("button",{name:"公共工具",exact:true}).click();
  await page.getByLabel("工具来源").fill("C:/tools/demo");
  await page.getByRole("button",{name:"导入并分发"}).click();
  await expect(page.getByText("待评估",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"预览接入"}).click();
  await expect(page.getByRole("dialog")).toContainText(".showu/tool-inbox");
  await page.getByRole("button",{name:"追加到项目指令"}).click();
  await page.getByRole("button",{name:"预览接入"}).click();
  await expect(page.getByRole("status")).toContainText("项目指令已接入");
  await page.getByRole("button",{name:"重新发放"}).click();
  await expect(page.getByRole("status")).toContainText("已向该项目重新发放");
});
