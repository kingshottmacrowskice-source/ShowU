import { describe, expect, it } from "vitest";
import {
  parsePlans,
  parseTasks,
  section,
  setTaskStatus,
  validateLaunchers,
} from "./domain";

describe("文件协议", () => {
  it("解析索引的合法状态和链接，忽略普通表格及归档", () => {
    expect(
      parsePlans(
        "| 计划 | 状态 | 任务文件 |\n| 项目 | active | [p](plans/first.md) |\n| 旧计划 | done | [p](plans/archive/old.md) |",
      ),
    ).toEqual([{ title: "项目", status: "active", path: "plans/first.md" }]);
  });
  it("覆盖状态优先且不把代码示例算作任务", () => {
    const md =
      "- [x] T1 完成\n  status: blocked\n```md\n- [ ] 示例\n```\n- [ ] T2 待办";
    expect(parseTasks(md).map((t) => t.status)).toEqual(["blocked", "todo"]);
  });
  it("任务状态转换不丢失说明、其他任务或 CRLF", () => {
    const md =
      "# 计划\r\n- [ ] T1 功能\r\n  status: blocked\r\n  原因：等待环境\r\n- [x] T2 完成\r\n";
    const changed = setTaskStatus(md, 1, "done");
    expect(changed).toBe(
      "# 计划\r\n- [x] T1 功能\r\n  原因：等待环境\r\n- [x] T2 完成\r\n",
    );
    expect(parseTasks(setTaskStatus(changed, 1, "doing"))[0].status).toBe(
      "doing",
    );
    expect(() => setTaskStatus(md, 0, "done")).toThrow();
  });
  it("保留跨会话需要的下一步，且不吞掉其他章节", () => {
    expect(
      section("# 标题\n## 下一步\n\n检查保存\n\n## 理由\n原因", "下一步"),
    ).toBe("检查保存");
  });
  it("启动器拒绝非参数数组，接受含空格路径的独立参数", () => {
    expect(() =>
      validateLaunchers([
        { name: "IDE", commands: [{ program: "idea", args: "{project}" }] },
      ]),
    ).toThrow();
    expect(
      validateLaunchers([
        {
          name: "IDE",
          commands: [
            { program: "C:/Program Files/idea.exe", args: ["{project}"] },
          ],
        },
      ])[0].commands[0].args,
    ).toEqual(["{project}"]);
  });
});
