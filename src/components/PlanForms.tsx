import { useState } from "react";
import type { NewPlan } from "../domain";
import { Modal } from "./common";
export function PlanForm({
  close,
  submit,
  busy,
}: {
  close: () => void;
  submit: (plan: NewPlan) => Promise<void>;
  busy: boolean;
}) {
  const [result, setResult] = useState("unchecked");
  return (
    <Modal title="新建计划" close={() => !busy && close()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit({
            slug: String(f.get("slug")),
            title: String(f.get("title")),
            purpose: String(f.get("purpose")),
            source: String(f.get("source")),
            codeRead: String(f.get("code")),
            modules: String(f.get("modules")),
            review: String(f.get("review")),
            reviewResult: result,
            tasks: String(f.get("tasks"))
              .split("\n")
              .map((t) => t.trim())
              .filter(Boolean),
          });
        }}
      >
        <div className="notice info">
          先读代码、比对相关模块需求，再创建计划。这里保存检查依据，不代替 AI
          的语义检查。
        </div>
        <div className="form-grid">
          <label>
            计划名称
            <input name="title" required placeholder="例如：完善项目记忆流程" />
          </label>
          <label>
            文件标识
            <input
              name="slug"
              pattern="[a-z0-9][a-z0-9-]{0,63}"
              required
              placeholder="project-memory"
            />
          </label>
        </div>
        <label>
          目的与范围
          <textarea name="purpose" rows={2} required />
        </label>
        <label>
          用户需求来源
          <input
            name="source"
            required
            placeholder="需求文档章节、用户指令或已确认的决定"
          />
        </label>
        <div className="form-grid">
          <label>
            已阅读的代码
            <input name="code" required placeholder="文件路径与现状" />
          </label>
          <label>
            涉及模块与需求 ID
            <input name="modules" required placeholder="core / CORE-001" />
          </label>
        </div>
        <label>
          冲突检查结论
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="unchecked">尚未检查</option>
            <option value="clear">已检查，无相斥诉求</option>
            <option value="conflict">发现冲突，停止任务</option>
          </select>
        </label>
        <label>
          检查依据
          <textarea
            name="review"
            rows={2}
            required
            placeholder="比较了哪些能力点与诉求？为何兼容？新需求请先在模块文件登记并标注本计划来源。"
          />
        </label>
        {result === "conflict" && (
          <div className="notice error">
            停止创建和开发。请把旧需求、新诉求及冲突理由交给用户裁决。
          </div>
        )}
        <label>
          任务（每行一项）
          <textarea
            name="tasks"
            rows={3}
            required
            placeholder="实现…并通过…验证"
          />
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || result !== "clear"}
          >
            创建计划
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ModuleForm({
  close,
  submit,
  busy,
}: {
  close: () => void;
  submit: (slug: string, title: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <Modal title="添加需求模块" close={() => !busy && close()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit(String(f.get("slug")), String(f.get("title")));
        }}
      >
        <label>
          模块名称
          <input name="title" required placeholder="例如：项目管理" />
        </label>
        <label>
          文件标识
          <input
            name="slug"
            pattern="[a-z0-9][a-z0-9-]{0,63}"
            required
            placeholder="project-management"
          />
        </label>
        <p className="muted">
          按模块归集需求。记录能力点、诉求和来源，变更时保留旧需求历史。
        </p>
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            创建模块文件
          </button>
        </div>
      </form>
    </Modal>
  );
}
