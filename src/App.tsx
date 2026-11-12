import { loadWorkspace, workspacePlans, resolveDocumentLink } from "./workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Layers3,
  Home,
  ListTodo,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, desktop } from "./api";
import {
  parseTasks,
  section,
  projectName,
  type Settings,
  type PlanStatus,
  labels,
} from "./domain";
import { Badge, Modal } from "./components/common";
import { Editor } from "./components/Editor";
import { PlanForm, ModuleForm } from "./components/PlanForms";
import { Launchers, GitPanel } from "./components/Tools";
import { ProjectSummary } from "./components/ProjectSummary";
import { SharedTools } from "./components/SharedTools";
import { Guide } from "./components/Guide";
type View = "shared" | "home" | "overview" | "file" | "launchers" | "git" | "guide";
type Confirm = { message: string; resolve: (answer: boolean) => void };
const emptySettings: Settings = { projects: [], launchers: [] };
function FileTree({
  files,
  selected,
  navigate,
  prefix = "",
}: {
  files: string[];
  selected: string;
  navigate: (path: string) => void;
  prefix?: string;
}) {
  const direct = files.filter(
    (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
  );
  const folders = [
    ...new Set(
      files
        .filter(
          (p) => p.startsWith(prefix) && p.slice(prefix.length).includes("/"),
        )
        .map((p) => p.slice(prefix.length).split("/")[0]),
    ),
  ];
  return (
    <>
      {direct.map((path) => (
        <button
          key={path}
          className={`tree-file ${selected === path ? "current" : ""}`}
          title={path}
          onClick={() => navigate(path)}
        >
          <FileText size={15} />
          <span>{path.slice(prefix.length)}</span>
          {path === "brief.md" && <span className="tiny">人写</span>}
        </button>
      ))}
      {folders.map((folder) => (
        <details key={folder} open className="tree-folder">
          <summary>
            <Folder size={15} />
            {folder}
          </summary>
          <div>
            <FileTree
              files={files}
              selected={selected}
              navigate={navigate}
              prefix={`${prefix}${folder}/`}
            />
          </div>
        </details>
      ))}
    </>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [project, setProject] = useState("");
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const openedFile = useRef("");
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>("home");
  const [file, setFile] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modal, setModal] = useState<"plan" | "module" | null>(null);
  const [planFilter, setPlanFilter] = useState<PlanStatus | "all">("all");
  const [filter, setFilter] = useState("");
  const [lastSync, setLastSync] = useState("");
  const generation = useRef(0);
  const currentProject = useRef("");
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const ask = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => setConfirm({ message, resolve })),
    [],
  );
  const report = useCallback(
    (e: unknown) => setNotice({ error: true, text: String(e) }),
    [],
  );
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    const paths = await api.files();
    const loaded = await loadWorkspace(paths, api.read, openedFile.current);
    if (token !== generation.current) return;
    setFilePaths(paths);
    setDocs(loaded);
    setLastSync(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
  }, []);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await operation();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (desktop) api.settings().then(setSettings).catch(report);
  }, [report]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const unlisteners: (() => void)[] = [];
    const register = async () => {
      const off = await listen<string>("showu-changed", (e) => {
        if (e.payload !== currentProject.current) return;
        clearTimeout(timer);
        timer = setTimeout(() => refresh().catch(report), 350);
      });
      if (disposed) off();
      else unlisteners.push(off);
      const offError = await listen<string>("showu-watch-error", (e) =>
        report(`文件监听失败：${e.payload}`),
      );
      if (disposed) offError();
      else unlisteners.push(offError);
      const offClose = await getCurrentWindow().onCloseRequested(async (e) => {
        if (dirtyRef.current) {
          e.preventDefault();
          if (await ask("有未保存的修改，关闭后草稿会丢失。确定关闭？"))
            await getCurrentWindow().destroy();
        }
      });
      if (disposed) offClose();
      else unlisteners.push(offClose);
    };
    register().catch(report);
    return () => {
      disposed = true;
      clearTimeout(timer);
      unlisteners.forEach((off) => off());
    };
  }, [refresh, report, ask]);
  const mayLeave = async () =>
    !dirty || (await ask("当前文件有未保存的修改。确定放弃草稿并离开？"));
  const navigate = async (next: View, path = "") => {
    if (busy || (next === view && path === file)) return;
    if (!(await mayLeave())) return;
    await run(async () => {
      if (next === "file") {
        const content = await api.read(path);
        setDocs((previous) => ({ ...previous, [path]: content }));
      }
      openedFile.current = next === "file" ? path : "";
      setDirty(false);
      setView(next);
      setFile(path);
    });
  };
  const select = async (path: string) => {
    if (!(await mayLeave())) return;
    await run(async () => {
      ++generation.current;
      const canonical = await api.select(path);
      const updated = await api.settings();
      currentProject.current = canonical;
      setProject(canonical);
      setPlanFilter("all");
      setSettings(updated);
      setDocs({});
      setFilePaths([]);
      openedFile.current = "";
      setDirty(false);
      setView("overview");
      setFile("");
      await refresh();
    });
  };
  const addProject = async () => {
    if (!desktop) return;
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择项目根目录",
      });
      if (path) await select(path);
    } catch (e) {
      report(e);
    }
  };
  const plans = workspacePlans(docs);
  const visiblePlans = plans
    .filter((plan) => planFilter === "all" || plan.status === planFilter)
    .sort((a, b) => {
      const ended = (status: PlanStatus) => status === "done" || status === "cancelled";
      return Number(ended(a.status)) - Number(ended(b.status));
    });
  const active = plans.filter((p) => p.status === "active");
  const allTasks = plans.filter((p) => p.status === "active" || p.status === "paused").flatMap((p) => parseTasks(docs[p.path] || ""));
  const completed = allTasks.filter((t) => t.status === "done").length;
  const modules = filePaths.filter((p) =>
    /^requirements\/[^/]+\.md$/.test(p),
  );
  const files = filePaths.filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );
  const completeFiles = () => run(async () => {
    const created = await api.initialize();
    await refresh();
    const result = created.length ? "已创建：" + created.join("、") : "管理文件已齐全。";
    const hint = created.includes("AGENTS.md") ? "" : " 已保留现有 AGENTS.md。如需接入，请在其中引用 .showu/skills 下的三项规范。";
    setNotice({ error: false, text: result + hint });
  });
  const initialized = "plans.md" in docs && "config.json" in docs;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={22} />
          </span>
          <strong>
            ShowU<span>PROJECT MEMORY</span>
          </strong>
          <span className="version">V2</span>
        </div>
        <div className="sidebar-label">
          工作空间{" "}
          <button
            className="icon-button"
            onClick={addProject}
            disabled={!desktop || busy}
            title="添加项目"
            aria-label="添加项目"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="project-select">
          <FolderOpen size={18} />
          <select
            aria-label="当前项目"
            value={project}
            onChange={(e) => select(e.target.value)}
            disabled={busy || !settings.projects.length}
          >
            <option value="" disabled>
              选择一个项目
            </option>
            {settings.projects.map((p) => (
              <option value={p} key={p}>
                {projectName(p)}
              </option>
            ))}
          </select>
        </div>
        <nav>
          <button className={view === "home" ? "nav-item selected" : "nav-item"} onClick={() => navigate("home")}>
            <Home size={17} />首页
          </button>
          <button
            className={view === "overview" ? "nav-item selected" : "nav-item"}
            onClick={() => navigate("overview")}
          >
            <Layers3 size={17} />
            项目总览
            <span className="nav-dot" />
          </button>
          <button
            className={view === "guide" ? "nav-item selected" : "nav-item"}
            onClick={() => navigate("guide")}
          >
            <ShieldCheck size={17} />
            协作规范<span className="tiny">S1–S3</span>
          </button>
        </nav>
        <div className="sidebar-label tree-label">
          项目文件 <span>.showu</span>
        </div>
        <input
          className="file-search"
          placeholder="筛选文件…"
          aria-label="筛选文件"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="file-tree">
          {files.length ? (
            <FileTree
              files={files}
              selected={view === "file" ? file : ""}
              navigate={(path) => {
                navigate("file", path);
              }}
            />
          ) : (
            <div className="tree-empty">
              {project ? "尚无管理文件" : "添加项目后显示文件"}
            </div>
          )}
        </div>
        {project && initialized && (
          <button
            className="add-module"
            disabled={busy}
            onClick={() => setModal("module")}
          >
            <Plus size={14} />
            添加需求模块
          </button>
        )}
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "launchers" ? "selected" : ""}`}
            onClick={() => navigate("launchers")}
          >
            <Rocket size={17} />
            快捷启动器
            <ArrowUpRight size={14} />
          </button>
          <button
            className={`nav-item ${view === "git" ? "selected" : ""}`}
            onClick={() => navigate("git")}
          >
            <GitBranch size={17} />
            Git 同步
          </button>
          <button className={view === "shared" ? "nav-item selected" : "nav-item"} onClick={() => navigate("shared")}><Folder size={17} />公共工具</button>
          <div className="local-note">
            <span />
            本地文件 · 项目长期记忆
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="toolbar">
          <div className="breadcrumb">
            <Folder size={15} />
            <span>{project && view !== "home" ? projectName(project) : "工作空间"}</span>
            <ChevronRight size={14} />
            <strong>
              {
                {
                  shared: "公共工具",
                  home: "首页",
                  overview: "项目总览",
                  file,
                  launchers: "快捷启动器",
                  git: "Git 同步",
                  guide: "协作规范",
                }[view]
              }
            </strong>
            {dirty && <span className="unsaved">未保存</span>}
          </div>
          <div className="toolbar-actions">
            <span className="sync-label">
              {busy
                ? "处理中…"
                : lastSync
                  ? `同步于 ${lastSync}`
                  : "文件即事实源"}
            </span>
            <button
              className="icon-button"
              title="刷新文件"
              aria-label="刷新文件"
              disabled={!project || busy}
              onClick={() => run(refresh)}
            >
              <RefreshCw size={16} className={busy ? "spinning" : ""} />
            </button>
            {project && <button className="button small" disabled={busy} onClick={completeFiles}>补全管理文件</button>}
            <button
              className="button small"
              disabled={!desktop || busy}
              onClick={addProject}
            >
              <FolderOpen size={15} />
              打开项目
            </button>
          </div>
        </header>
        {notice && (
          <div
            role="alert"
            className={`notice ${notice.error ? "error" : "success"}`}
          >
            <span>{notice.text}</span>
            <button
              aria-label="关闭提示"
              className="icon-button"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!desktop && (
          <div className="notice info">
            当前是界面预览。请通过 Tauri
            桌面应用打开，才能访问项目文件、启动工具和操作 Git。
          </div>
        )}
        <main>
          {view === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR WORKSPACE</div>
                  <h1>所有项目</h1>
                  <p>{settings.projects.length ? `${settings.projects.length} 个项目，从这里继续。` : "添加一个项目，开始记录目标、计划与进度。"}</p>
                </div>
                <button className="button primary" disabled={!desktop || busy} onClick={addProject}><Plus size={17} />添加项目</button>
              </div>
              {settings.projects.length ? (
                <section className="project-grid" aria-label="所有项目">
                  {settings.projects.map((path) => (
                    <button key={path} className="project-card card" disabled={busy} onClick={() => select(path)}>
                      <span className="project-card-icon"><FolderOpen size={25} /></span>
                      <h2>{projectName(path)}</h2>
                      <p title={path}>{path}</p>
                      <ProjectSummary path={path} />
                      <span className="project-card-footer"><span>{path === project ? "当前项目" : "打开项目"}</span><ArrowUpRight size={17} /></span>
                    </button>
                  ))}
                </section>
              ) : (
                <div className="welcome card">
                  <FolderOpen size={36} />
                  <h2>还没有项目</h2>
                  <p>选择本地项目文件夹，添加后将在这里显示。</p>
                  <button className="button primary" disabled={!desktop || busy} onClick={addProject}>添加第一个项目</button>
                </div>
              )}
            </>
          )}
          {view === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR PROJECT, IN CONTEXT</div>
                  <h1>
                    {project ? projectName(project) : "让每次开发，都有来处。"}
                  </h1>
                  <p>知道为什么出发，也知道下一步走向哪里。</p>
                </div>
                <button
                  className="button primary"
                  disabled={!initialized || busy}
                  onClick={() => setModal("plan")}
                >
                  <Plus size={17} />
                  新建计划
                </button>
              </div>
              {!project ? (
                <div className="welcome card">
                  <div className="welcome-icon">
                    <BookOpen size={36} />
                  </div>
                  <h2>给项目一份持久的记忆</h2>
                  <p>
                    打开项目文件夹，把目标、计划、需求与设计理由
                    <br />
                    留在代码身边，让下一次 AI 协作从这里继续。
                  </p>
                  <button
                    className="button primary"
                    disabled={!desktop || busy}
                    onClick={addProject}
                  >
                    <FolderOpen size={17} />
                    打开第一个项目
                  </button>
                  <div className="welcome-steps">
                    <span>01 明确目的</span>
                    <span>02 比对需求</span>
                    <span>03 持续记录</span>
                  </div>
                </div>
              ) : !initialized ? (
                <div className="welcome card">
                  <BookOpen size={32} />
                  <h2>为这个项目建立管理文件</h2>
                  <p>
                    创建根目录 AGENTS.md、协作规范和 .showu 管理文件。已有文件会保留。
                    <br />
                    初始化后，请由你填写项目简介，AI 只读取它。
                  </p>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={completeFiles}
                  >
                    初始化 .showu
                  </button>
                </div>
              ) : (
                <>
                  <section className="purpose card">
                    <span className="purpose-icon">
                      <BookOpen size={23} />
                    </span>
                    <div>
                      <div className="eyebrow">
                        项目为什么存在{" "}
                        <span className="human-tag">人写 · AI 只读</span>
                      </div>
                      <div className="brief-excerpt">
                        {docs["brief.md"]?.replace(/^# .*\r?\n/, "").trim() ||
                          "项目简介尚未填写。由你定义目的，AI 据此行动。"}
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="查看项目简介"
                      onClick={() => navigate("file", "brief.md")}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </section>
                  <div className="stats">
                    <div className="stat card">
                      <span>进行中的计划</span>
                      <strong>
                        {active.length}
                        <Layers3 size={20} />
                      </strong>
                      <small>{plans.length} 个计划已登记</small>
                    </div>
                    <div className="stat card">
                      <span>当前计划任务进度（进行中 / 暂停）</span>
                      <strong>
                        {completed}
                        <em>/ {allTasks.length}</em>
                        <ListTodo size={20} />
                      </strong>
                      <div className="progress">
                        <i
                          style={{
                            width: `${allTasks.length ? (completed / allTasks.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="stat card">
                      <span>需求模块</span>
                      <strong>
                        {modules.length}
                        <ShieldCheck size={20} />
                      </strong>
                      <small>按模块保存，跨计划比对</small>
                    </div>
                  </div>
                  <div className="overview-columns">
                    <section>
                      <div className="section-title">
                        <h2>
                          计划与进度 <span>{plans.length}</span>
                        </h2>
                        <button
                          className="text-link"
                          onClick={() => navigate("file", "plans.md")}
                        >
                          查看登记表 <ChevronRight size={14} />
                        </button>
                      </div>
                      <div className="plan-filters" role="group" aria-label="计划状态筛选">
                        {(["all", "active", "paused", "done", "cancelled"] as const).map((status) => (
                          <button key={status} className={`button small ${planFilter === status ? "primary" : ""}`} aria-pressed={planFilter === status} onClick={() => setPlanFilter(status)}>
                            {status === "all" ? "全部" : labels[status]} · {status === "all" ? plans.length : plans.filter((plan) => plan.status === status).length}
                          </button>
                        ))}
                      </div>
                      <div className="plan-list">
                        {visiblePlans.length ? (
                          visiblePlans.map((plan) => {
                            const tasks = parseTasks(docs[plan.path] || "");
                            const done = tasks.filter(
                              (t) => t.status === "done",
                            ).length;
                            return (
                              <button
                                className="plan-card card"
                                key={plan.path}
                                onClick={() => navigate("file", plan.path)}
                              >
                                <div className="plan-card-top">
                                  <span className="plan-icon">
                                    <ListTodo size={19} />
                                  </span>
                                  <Badge status={plan.status} />
                                </div>
                                <h3>{plan.title}</h3>
                                <p>
                                  {section(docs[plan.path] || "", "下一步") ||
                                    "打开计划，查看任务与设计理由。"}
                                </p>
                                <div className="plan-card-bottom">
                                  <span>
                                    {plan.path in docs ? `${done} / ${tasks.length} 项任务完成` : "打开计划查看任务进度"}
                                  </span>
                                  <ArrowUpRight size={16} />
                                </div>
                                <div className="progress">
                                  <i
                                    style={{
                                      width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                {!filePaths.includes(plan.path) && (
                                  <span className="danger-text">
                                    任务文件缺失
                                  </span>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="card empty-inline">
                            {plans.length ? "该状态下暂无计划。" : "还没有计划。先检查需求，再开始新的工作。"}
                          </div>
                        )}
                      </div>
                    </section>
                    <aside className="context-panel">
                      <div className="section-title">
                        <h2>接续开发</h2>
                        <Clock3 size={17} />
                      </div>
                      <div className="card context-card">
                        <span className="eyebrow">每次开始前</span>
                        <ol>
                          <li>
                            <strong>读项目简介</strong>
                            <span>知道目的与边界</span>
                          </li>
                          <li>
                            <strong>找当前计划</strong>
                            <span>核对任务、设计理由和下一步</span>
                          </li>
                          <li>
                            <strong>比对模块需求</strong>
                            <span>读代码，检查是否存在冲突</span>
                          </li>
                          <li>
                            <strong>带着证据更新</strong>
                            <span>保留验证结果与未完成事项</span>
                          </li>
                        </ol>
                        <div className="context-foot">
                          <ShieldCheck size={16} />
                          冲突先裁决，开发再继续
                        </div>
                      </div>
                      <div className="module-links">
                        <div className="section-title">
                          <h2>需求模块</h2>
                        </div>
                        {modules.map((path) => (
                          <button
                            key={path}
                            onClick={() => navigate("file", path)}
                          >
                            <FileText size={15} />
                            <span>{path.slice(13, -3)}</span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                        {!modules.length && (
                          <p className="muted">尚未登记模块需求</p>
                        )}
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {project && (
                <div className="project-footer">
                  <span title={project}>
                    {project.replace(/^\\\\\?\\/, "")}
                  </span>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await ask(
                          "从项目列表移除？磁盘上的项目文件不会被删除。",
                        )
                      )
                        await run(async () => {
                          await api.remove(project);
                          ++generation.current;
                          currentProject.current = "";
                          setFilePaths([]);
                          openedFile.current = "";
                          setProject("");
                          setView("home");
                          setDocs({});
                          setLastSync("");
                          setSettings(await api.settings());
                        });
                    }}
                  >
                    从列表移除
                  </button>
                </div>
              )}
            </>
          )}
          {view === "file" && (
            <Editor
              key={`${project}:${file}`}
              path={file}
              external={docs[file]}
              onDirty={setDirty}
              busy={busy}
              ask={ask}
              navigate={(path) => {
                const resolved = resolveDocumentLink(file, path);
                if (resolved && filePaths.includes(resolved)) navigate("file", resolved);
                else report("链接目标不存在或不在 .showu 中");
              }}
              save={async (content) => {
                await api.save(file, content.text, content.expected);
                await refresh();
              }}
              run={run}
              changePlan={async (status) => {
                await api.changePlan(
                  file,
                  docs[file],
                  docs[plans.find((p) => p.path === file)?.index || "plans.md"],
                  status,
                );
                await refresh();
                if (status === "archive") {
                  setDirty(false);
                  setView("overview");
                  setFile("");
                }
              }}
            />
          )}
          {view === "shared" && <SharedTools projects={settings.projects} />}
          {view === "guide" && <Guide />}
          {view === "launchers" && (
            <Launchers
              settings={settings}
              project={project}
              busy={busy}
              onDirty={setDirty}
              run={run}
              onSaved={async () => {
                const saved = await api.settings();
                setSettings(saved);
                return saved;
              }}
            />
          )}
          {view === "git" && (
            <GitPanel project={project} busy={busy} run={run} ask={ask} />
          )}
        </main>
        <footer className="statusbar">
          <span>
            <span className={`status-dot ${project ? "connected" : ""}`} />
            {project ? ".showu 工作区已连接" : "等待打开项目"}
          </span>
          <span>
            Markdown 为事实源 <span className="divider">/</span> ShowU 0.1.0
          </span>
        </footer>
      </div>
      {confirm && (
        <Modal
          title="确认操作"
          close={() => {
            confirm.resolve(false);
            setConfirm(null);
          }}
        >
          <p className="confirm-copy">{confirm.message}</p>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                confirm.resolve(false);
                setConfirm(null);
              }}
            >
              取消
            </button>
            <button
              className="button primary"
              onClick={() => {
                confirm.resolve(true);
                setConfirm(null);
              }}
            >
              确定
            </button>
          </div>
        </Modal>
      )}
      {modal === "plan" && (
        <PlanForm
          busy={busy}
          close={() => setModal(null)}
          submit={async (plan) => {
            if (!(await mayLeave())) return;
            await run(async () => {
              const path = await api.createPlan(plan, docs["plans.md"]);
              await refresh();
              const content = await api.read(path);
              setDocs((previous) => ({ ...previous, [path]: content }));
              setDirty(false);
              openedFile.current = path;
              setView("file");
              setFile(path);
              setModal(null);
            });
          }}
        />
      )}
      {modal === "module" && (
        <ModuleForm
          busy={busy}
          close={() => setModal(null)}
          submit={async (slug, title) => {
            if (!(await mayLeave())) return;
            await run(async () => {
              const path = `requirements/${slug}.md`;
              await api.save(
                path,
                `# ${title}\n\n<!-- 每条需求填写 ID、能力点、诉求、状态、操作及来源计划/任务。保留历史，不填未经确认的需求。 -->\n`,
                null,
              );
              await refresh();
              const content = await api.read(path);
              setDocs((previous) => ({ ...previous, [path]: content }));
              setDirty(false);
              openedFile.current = path;
              setView("file");
              setFile(path);
              setModal(null);
            });
          }}
        />
      )}
    </div>
  );
}
