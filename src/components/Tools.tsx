import { useState, useEffect } from "react";
import { LauncherEditor } from "./LauncherEditor";
import { Rocket, ArrowUpRight, Settings2, Save, GitBranch } from "lucide-react";
import { api, desktop } from "../api";
import { validateLaunchers, projectName, type Settings } from "../domain";
export function Launchers({
  settings,
  project,
  busy,
  run,
  onSaved,
  onDirty,
}: {
  settings: Settings;
  project: string;
  busy: boolean;
  run: (op: () => Promise<void>) => Promise<void>;
  onSaved: () => Promise<Settings>;
  onDirty: (value: boolean) => void;
}) {
  const initial = JSON.stringify(settings.launchers, null, 2);
  const [config, setConfig] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [output, setOutput] = useState("");
  useEffect(() => {
    onDirty(config !== initial);
  }, [config, initial, onDirty]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TOOLS AT HAND</div>
          <h1>快捷启动器</h1>
          <p>直接启动工具，也可以选择项目后在项目目录中启动。</p>
        </div>
        <button className="button" onClick={() => setEditing(!editing)}>
          <Settings2 size={16} />
          配置启动器
        </button>
      </div>
      <div className="launcher-grid">
        {settings.launchers.map((l, index) => (
          <div className="card launcher-card" key={index}>
            <Rocket size={23} />
            <h2>{l.name}</h2>
            <p>
              {l.commands.length} 个程序 ·{" "}
              {project ? projectName(project) : "独立启动"}
            </p>
            <button
              className="button primary"
              disabled={busy || !desktop}
              onClick={() =>
                run(async () => setOutput((await api.launch(index)).join("\n")))
              }
            >
              启动 <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
      </div>
      {!settings.launchers.length && (
        <div className="card empty-inline">
          还没有启动器。点击配置，添加 AI 工具、IDE 或组合启动。
        </div>
      )}
      {editing && (
        <section className="card settings-card">
          <h2>启动器配置</h2>
          <LauncherEditor
            config={config}
            onChange={setConfig}
            disabled={busy}
          />
          <details>
            <summary>高级配置（JSON 与命令参数）</summary>
            <p className="muted">
              程序路径与参数分别填写；参数中的 {"{project}"}{" "}
              会替换为当前项目目录；独立启动时会略过含此占位符的参数。多个 commands 会组合启动。Windows
              快捷方式可使用 .lnk 路径，参数放在快捷方式属性中。
            </p>
            <pre className="example">
              {
                '[{ "name": "IDE", "commands": [{ "program": "C:/Tools/idea64.exe", "args": ["{project}"] }] }]'
              }
            </pre>
            <textarea
              className="source-editor config-editor"
              aria-label="启动器配置"
              value={config}
              disabled={busy}
              onChange={(e) => setConfig(e.target.value)}
            />
          </details>
          <button
            className="button primary"
            disabled={busy || !desktop}
            onClick={() =>
              run(async () => {
                const launchers = validateLaunchers(JSON.parse(config));
                await api.saveLaunchers(launchers);
                const saved = await onSaved();
                setConfig(JSON.stringify(saved.launchers, null, 2));
              })
            }
          >
            <Save size={15} />
            保存配置
          </button>
        </section>
      )}
      {output && <pre className="command-output">{output}</pre>}
    </>
  );
}
export function GitPanel({
  project,
  busy,
  run,
  ask,
}: {
  project: string;
  busy: boolean;
  run: (op: () => Promise<void>) => Promise<void>;
  ask: (message: string) => Promise<boolean>;
}) {
  const [remote, setRemote] = useState("");
  const [output, setOutput] = useState("");
  const execute = async (action: string) => {
    if (
      ["push", "pull", "link"].includes(action) &&
      !(await ask(
        {
          push: "将当前分支的已有提交推送到远程仓库？",
          pull: "以快进方式拉取当前分支的远程更新？",
          link: "将此目录链接到填写的 origin？未初始化时会创建 Git 仓库，已有 origin 将被更新。",
        }[action]!,
      ))
    )
      return;
    await run(async () => {
      setOutput("正在执行…");
      try {
        setOutput((await api.git(action, remote)) || "操作完成。");
      } catch (e) {
        setOutput(String(e));
        throw e;
      }
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KEEP IT IN SYNC</div>
          <h1>Git 同步</h1>
          <p>让代码和项目记忆一起进入版本历史。</p>
        </div>
        <GitBranch size={28} />
      </div>
      <section className="card settings-card">
        <h2>当前项目</h2>
        <p className="muted">{project || "请先选择项目文件夹"}</p>
        <div className="button-row">
          {[
            ["status", "本地状态"],
            ["check", "检查远程更新"],
            ["pull", "拉取更新"],
            ["push", "推送更新"],
          ].map(([action, label]) => (
            <button
              key={action}
              className="button"
              disabled={!project || busy}
              onClick={() => execute(action)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="help-text">
          检查更新会先
          fetch。拉取仅允许快进；推送只推送已有提交。提交和分支管理请在 IDE
          或终端中完成。
        </p>
      </section>
      <section className="card settings-card">
        <h2>链接远程仓库</h2>
        <label>
          origin 地址
          <input
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            placeholder="https://… 或 git@…"
          />
        </label>
        <button
          className="button"
          disabled={!project || busy || !remote.trim()}
          onClick={() => execute("link")}
        >
          链接仓库
        </button>
        <p className="help-text">
          此操作不会克隆或提交文件。认证使用本机 Git
          配置；没有上游分支时，请先在终端设置。
        </p>
      </section>
      {output && (
        <pre className="command-output" aria-live="polite">
          {output}
        </pre>
      )}
    </>
  );
}
