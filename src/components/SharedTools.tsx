import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { desktop } from "../api";
import { Modal } from "./common";

type Row = {
  tool: { id: string; source: string };
  results: [string, string][];
};
type Preview = { expected: string | null; addition: string };
export function SharedTools({ projects }: { projects: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState("");
  const [project, setProject] = useState(projects[0] ?? "");
  const [file, setFile] = useState("AGENTS.md");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => setRows(await invoke<Row[]>("shared_tools"));
  useEffect(() => {
    if (desktop) refresh().catch((e) => setMessage(String(e)));
  }, [projects]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !desktop;
  return (
    <section className="shared-tools">
      <h1>公共工具</h1>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const failures = await invoke<string[]>("import_tool", { source });
            setSource("");
            setMessage(
              failures.length
                ? "已导入，部分投递失败：" + failures.join("\n")
                : "已导入并向已登记项目发放通知。",
            );
          });
        }}
      >
        <label>
          工具来源
          <input
            value={source}
            disabled={disabled}
            placeholder="本地文件夹、HTTPS 或 SSH Git 地址"
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() =>
            run(async () => {
              const path = await open({ directory: true });
              if (path) setSource(path);
            })
          }
        >
          选择文件夹
        </button>
        <button
          className="button primary"
          disabled={disabled || !source.trim()}
        >
          {busy ? "处理中…" : "导入并分发"}
        </button>
      </form>
      <section className="card">
        <h2>项目指令</h2>
        <label>
          项目
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          指令文件
          <select value={file} onChange={(e) => setFile(e.target.value)}>
            <option>AGENTS.md</option>
            <option>CLAUDE.md</option>
          </select>
        </label>
        <button
          className="button"
          disabled={disabled || !project}
          onClick={() =>
            run(async () => {
              const result = await invoke<Preview>("tool_instruction", {
                path: project,
                file,
                apply: false,
                expected: null,
              });
              if (result.addition) setPreview(result);
              else setMessage("项目指令已接入。");
            })
          }
        >
          预览接入
        </button>
      </section>
      {message && <p role="status">{message}</p>}
      <div>
        <h2>工具与投递结果</h2>
        <button
          className="button"
          disabled={disabled}
          onClick={() => run(async () => {})}
        >
          刷新结果
        </button>
      </div>
      {!rows.length && <p>公共库中还没有工具。</p>}
      {rows.map(({ tool, results }) => (
        <article className="card" key={tool.id}>
          <h3>{tool.source}</h3>
          <small>{tool.id}</small>
          {results.map(([path, status]) => (
            <div className="tool-result" key={path}>
              <strong>{path}</strong>
              <p>{status}</p>
              <button
                className="button small"
                disabled={disabled}
                onClick={() =>
                  run(async () => {
                    await invoke("resend_tool", { path, id: tool.id });
                    setMessage("已向该项目重新发放。");
                  })
                }
              >
                重新发放
              </button>
            </div>
          ))}
        </article>
      ))}
      {preview && (
        <Modal title="预览项目指令" close={() => setPreview(null)}>
          <p>
            {project} / {file}
          </p>
          <pre>{preview.addition.trim()}</pre>
          <button
            className="button primary"
            disabled={disabled}
            onClick={() =>
              run(async () => {
                setPreview(null);
                await invoke("tool_instruction", {
                  path: project,
                  file,
                  apply: true,
                  expected: preview.expected,
                });
                setMessage("项目指令已接入。");
              })
            }
          >
            追加到项目指令
          </button>
        </Modal>
      )}
    </section>
  );
}
