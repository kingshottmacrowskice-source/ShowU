import { useEffect, useState } from "react";
import { Check, Circle, Save, Trash2 } from "lucide-react";
import { labels, parseTasks, setTaskStatus, type TaskStatus } from "../domain";
import { RenderMarkdown } from "./common";
type EditorProps = {
  path: string;
  external?: string;
  onDirty: (dirty: boolean) => void;
  busy: boolean;
  ask: (message: string) => Promise<boolean>;
  navigate: (path: string) => void;
  save: (value: { text: string; expected: string | null }) => Promise<void>;
  run: (operation: () => Promise<void>) => Promise<void>;
  changePlan: (status: string) => Promise<void>;
};
export function Editor({
  path,
  external,
  onDirty,
  busy,
  ask,
  navigate,
  save,
  run,
  changePlan,
}: EditorProps) {
  const [original, setOriginal] = useState(external);
  const [text, setText] = useState(external ?? "");
  const [mode, setMode] = useState<"read" | "edit">("read");
  const dirty = text !== (original ?? "");
  const conflict = external !== original;
  const isPlan = /^plans\/[a-z0-9][a-z0-9-]*\.md$/.test(path);
  const tasks = isPlan ? parseTasks(text) : [];
  useEffect(() => {
    if (external !== original && !dirty) {
      setOriginal(external);
      setText(external ?? "");
    }
  }, [external, original, dirty]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const doSave = (next = text) =>
    run(async () => {
      await save({ text: next, expected: original ?? null });
      setOriginal(next);
      setText(next);
    });
  return (
    <div className="editor-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROJECT FILE</div>
          <h1>{path.split("/").pop()}</h1>
          <p>
            .showu / {path}
            {path === "brief.md" ? " · 由你维护，AI 只读" : ""}
          </p>
        </div>
        <div className="button-row">
          <div className="segmented">
            <button
              className={mode === "read" ? "active" : ""}
              onClick={() => setMode("read")}
            >
              阅读
            </button>
            <button
              className={mode === "edit" ? "active" : ""}
              onClick={() => setMode("edit")}
            >
              编辑
            </button>
          </div>
          <button
            className="button primary"
            disabled={busy || !dirty || conflict}
            onClick={() => doSave()}
          >
            <Save size={16} />
            保存
          </button>
        </div>
      </div>
      {external === undefined && (
        <div className="notice error">
          文件不存在或已被删除。保留的草稿可以手动复制；刷新后确认磁盘状态。
        </div>
      )}
      {conflict && (
        <div className="notice error">
          <span>
            磁盘内容已变化。你的草稿已保留，请复制需要的内容，再重新加载。
          </span>
          <button
            className="button small"
            onClick={async () => {
              if (!dirty || (await ask("重新加载会放弃当前草稿，确定继续？"))) {
                setOriginal(external);
                setText(external ?? "");
              }
            }}
          >
            重新加载
          </button>
        </div>
      )}
      {path === "brief.md" && (
        <div className="notice info">
          这是用户维护的项目目的。你可以在这里修改；AI 应只读取。
        </div>
      )}
      {isPlan && (
        <div className="plan-controls">
          <span>计划状态</span>
          <select
            aria-label="计划状态"
            disabled={busy || dirty || conflict}
            value={
              text.match(/^status: (active|paused|done|cancelled)\r?$/m)?.[1] ||
              "active"
            }
            onChange={(e) => {
              const status = e.target.value;
              run(async () => {
                if (
                  status === "done" &&
                  tasks.some((t) => !["done", "cancelled"].includes(t.status))
                )
                  throw new Error("还有未完成任务，请先核对状态及完成证据。");
                await changePlan(status);
              });
            }}
          >
            {["active", "paused", "done", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
          <button
            className="text-link danger-text"
            disabled={busy || dirty || conflict}
            onClick={async () => {
              if (
                await ask(
                  "从登记表删除此计划并将任务文件归档？需求历史会保留。",
                )
              )
                await run(() => changePlan("archive"));
            }}
          >
            <Trash2 size={14} />
            删除计划
          </button>
        </div>
      )}
      {mode === "edit" ? (
        <textarea
          aria-label="文件内容"
          spellCheck={false}
          className="source-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              if (dirty && !conflict && !busy) doSave();
            }
          }}
        />
      ) : (
        <div className="card document">
          <RenderMarkdown
            content={text || "*这个文件还没有内容，点击编辑开始填写。*"}
            navigate={navigate}
          />
        </div>
      )}
      {mode === "read" && tasks.length > 0 && (
        <section className="card task-panel">
          <div className="section-title">
            <h2>更新任务状态</h2>
            <span className="muted">直接保存至任务文件</span>
          </div>
          {tasks.map((task) => (
            <div className="task-row" key={task.line}>
              {task.status === "done" ? (
                <Check size={16} className="accent" />
              ) : (
                <Circle size={15} />
              )}
              <span>{task.text}</span>
              <select
                aria-label={`${task.text} 状态`}
                value={task.status}
                disabled={busy || dirty || conflict}
                onChange={(e) =>
                  doSave(
                    setTaskStatus(
                      text,
                      task.line,
                      e.target.value as TaskStatus,
                    ),
                  )
                }
              >
                {["todo", "doing", "blocked", "done", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
