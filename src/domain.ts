export type PlanStatus = "active" | "paused" | "done" | "cancelled";
export type TaskStatus = "todo" | "done" | "doing" | "blocked" | "cancelled";
export interface Plan {
  title: string;
  status: PlanStatus;
  path: string;
}
export interface Task {
  line: number;
  text: string;
  status: TaskStatus;
}
export interface Launcher {
  name: string;
  sequential?: boolean;
  commands: { program: string; args: string[]; delaySeconds?: number }[];
}
export interface Settings {
  projects: string[];
  launchers: Launcher[];
}
export interface NewPlan {
  slug: string;
  title: string;
  purpose: string;
  source: string;
  codeRead: string;
  modules: string;
  review: string;
  reviewResult: string;
  tasks: string[];
}
export const labels: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  done: "已完成",
  cancelled: "已取消",
  todo: "未完成",
  doing: "进行中",
  blocked: "受阻",
};

export function parsePlans(markdown: string): Plan[] {
  const plans: Plan[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*([^|]+?)\s*\|\s*(active|paused|done|cancelled)\s*\|\s*\[[^\]]+\]\((plans\/[a-z0-9][a-z0-9-]*\.md)\)\s*\|\s*$/,
    );
    if (match)
      plans.push({
        title: match[1].trim(),
        status: match[2] as PlanStatus,
        path: match[3],
      });
  }
  return plans;
}

export function parseTasks(markdown: string): Task[] {
  const lines = markdown.split(/\r?\n/);
  const tasks: Task[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
        fence = null;
      return;
    }
    if (fence) return;
    const match = line.match(/^- \[([ xX])\] (.+)$/);
    if (!match) return;
    const override = lines[i + 1]?.match(
      /^ {2}status: (doing|blocked|cancelled)\s*$/,
    );
    tasks.push({
      line: i,
      text: match[2],
      status: override
        ? (override[1] as TaskStatus)
        : match[1].toLowerCase() === "x"
          ? "done"
          : "todo",
    });
  });
  return tasks;
}

export function setTaskStatus(
  markdown: string,
  line: number,
  status: TaskStatus,
): string {
  if (!parseTasks(markdown).some((t) => t.line === line))
    throw new Error("任务已变更，请重新加载");
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  lines[line] = lines[line].replace(
    /^- \[[ xX]\]/,
    status === "done" ? "- [x]" : "- [ ]",
  );
  if (/^ {2}status: (doing|blocked|cancelled)\s*$/.test(lines[line + 1] ?? ""))
    lines.splice(line + 1, 1);
  if (!["todo", "done"].includes(status))
    lines.splice(line + 1, 0, `  status: ${status}`);
  return lines.join(newline);
}

export function section(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^##? /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

export function validateLaunchers(value: unknown): Launcher[] {
  if (!Array.isArray(value)) throw new Error("高级配置需要使用启动器列表。");
  for (const [i, launcher] of value.entries()) {
    if (typeof launcher?.name !== "string" || !launcher.name.trim())
      throw new Error(`请为第 ${i + 1} 个启动器填写名称。`);
    const label = `第 ${i + 1} 个启动器「${launcher.name}」`;
    if (!Array.isArray(launcher.commands) || !launcher.commands.length)
      throw new Error(
        `${label}还没有启动项。请选中它并拖入 .exe 或 .lnk 文件，或移除空启动器。`,
      );
    for (const [j, command] of launcher.commands.entries()) {
      if (typeof command?.program !== "string" || !command.program.trim())
        throw new Error(`${label}的第 ${j + 1} 项缺少程序路径。`);
      if (
        !Array.isArray(command.args) ||
        command.args.some((arg: unknown) => typeof arg !== "string")
      )
        throw new Error(
          `${label}的第 ${j + 1} 项参数格式有误。请在高级配置中使用字符串数组，无参数时填写 []。`,
        );
    }
  }
  return value as Launcher[];
}

export const projectName = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || path;
