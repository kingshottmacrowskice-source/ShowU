mod storage;
mod shared;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
};
use storage::{atomic_write, read, safe_path, save_checked, valid_slug, Result};
use tauri::{Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Settings {
    projects: Vec<String>,
    launchers: Vec<Launcher>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Launcher {
    name: String,
    #[serde(default)]
    sequential: bool,
    commands: Vec<LaunchCommand>,
}
#[derive(Clone, Serialize, Deserialize)]
struct LaunchCommand {
    #[serde(default, rename = "delaySeconds")]
    delay_seconds: u32,
    program: String,
    args: Vec<String>,
}
struct Workspace {
    selected: Option<PathBuf>,
    watcher: Option<RecommendedWatcher>,
    settings: Settings,
    config_path: PathBuf,
}
struct AppState(Mutex<Workspace>);
fn lock<'a>(state: &'a State<'_, AppState>) -> Result<std::sync::MutexGuard<'a, Workspace>> {
    state.0.lock().map_err(|_| "工作区状态不可用".into())
}
fn project(w: &Workspace) -> Result<PathBuf> {
    w.selected.clone().ok_or("请先选择项目".into())
}
fn root(w: &Workspace) -> Result<PathBuf> {
    Ok(project(w)?.join(".showu"))
}
fn persist(w: &Workspace) -> Result<()> {
    atomic_write(
        &w.config_path,
        &serde_json::to_string_pretty(&w.settings).map_err(|e| e.to_string())?,
    )
}

fn watch<R: tauri::Runtime>(w: &mut Workspace, app: tauri::AppHandle<R>) -> Result<()> {
    w.watcher = None;
    let dir = root(w)?;
    if !dir.exists() {
        return Ok(());
    }
    safe_path(&dir, "config.json")?;
    let project_id = project(w)?.to_string_lossy().to_string();
    let mut watcher =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
            Ok(e) if !matches!(e.kind, notify::EventKind::Access(_)) => {
                let _ = app.emit("showu-changed", &project_id);
            }
            Err(e) => {
                let _ = app.emit("showu-watch-error", e.to_string());
            }
            _ => (),
        })
        .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    w.watcher = Some(watcher);
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Settings> {
    Ok(lock(&state)?.settings.clone())
}
#[derive(Serialize)]
struct ProjectSummary {
    brief: Option<String>,
    plans: Option<String>,
}
#[tauri::command]
fn project_summary(path: String, state: State<AppState>) -> Result<ProjectSummary> {
    if !lock(&state)?.settings.projects.contains(&path) {
        return Err("项目未登记".into());
    }
    let project = dunce::canonicalize(path).map_err(|e| e.to_string())?;
    let root = project.join(".showu");
    let optional = |name: &str| -> Result<Option<String>> {
        let target = safe_path(&root, name)?;
        match fs::read_to_string(target) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    };
    let plans = optional("plans.md")?;
    let plans = if plans.is_some() { Some(storage::plan_indexes(&root)?.into_iter().map(|(_, text)| text).collect::<Vec<_>>().join("\n")) } else { None };
    Ok(ProjectSummary { brief: optional("brief.md")?, plans })
}
#[tauri::command]
fn select_project(path: String, state: State<AppState>, app: tauri::AppHandle) -> Result<String> {
    let dir = dunce::canonicalize(path).map_err(|e| e.to_string())?;
    if !dir.is_dir() {
        return Err("请选择项目文件夹".into());
    }
    let mut w = lock(&state)?;
    storage::list_files(&dir.join(".showu"))?;
    w.selected = Some(dir.clone());
    watch(&mut w, app)?;
    let key = dir.to_string_lossy().to_string();
    if !w.settings.projects.contains(&key) {
        w.settings.projects.push(key.clone());
        persist(&w)?;
    }
    Ok(key)
}
#[tauri::command]
fn remove_project(path: String, state: State<AppState>) -> Result<()> {
    let mut w = lock(&state)?;
    w.settings.projects.retain(|p| p != &path);
    if w.selected
        .as_ref()
        .is_some_and(|p| p.to_string_lossy() == path)
    {
        w.selected = None;
        w.watcher = None;
    }
    persist(&w)
}
#[tauri::command]
fn initialize_project(state: State<AppState>, app: tauri::AppHandle) -> Result<Vec<String>> {
    let mut w = lock(&state)?;
    let created = complete_files(&project(&w)?)?;
    watch(&mut w, app)?;
    Ok(created)
}

fn complete_files(project: &Path) -> Result<Vec<String>> {
    use std::io::Write;
    let dir = project.join(".showu");
    let mut created = Vec::new();
    for folder in ["plans", "requirements"] {
        safe_path(&dir, &format!("{folder}/check.md"))?;
        fs::create_dir_all(dir.join(folder)).map_err(|e| e.to_string())?;
    }
    for (name, content) in [
        ("skills/showu-create-plan/SKILL.md", include_str!("../../skills/showu-create-plan/SKILL.md")),
        ("skills/showu-record-requirements/SKILL.md", include_str!("../../skills/showu-record-requirements/SKILL.md")),
        ("skills/showu-update-status/SKILL.md", include_str!("../../skills/showu-update-status/SKILL.md")),
        ("protocol.md", include_str!("../../docs/protocol.md")),
        ("brief.md", ""),
        (
            "plans.md",
            "# 计划登记\n\n| 计划 | 状态 | 任务文件 |\n| --- | --- | --- |\n",
        ),
        ("config.json", "{\n  \"schemaVersion\": 1\n}\n"),
        ("AGENTS.md", "# 项目协作规范\n\n一次性查找、解释或核对信息，直接答复，不登记模块需求、计划或任务，也不更新完成状态。若用户随后明确要求修改项目或长期遵守某项约定，只对新增的项目要求执行相应流程。\n\n开始或恢复工作时先读 .showu/brief.md（由用户维护）、.showu/plans.md、当前计划和相关模块需求，再核对代码。创建计划先执行 .showu/skills/showu-record-requirements/SKILL.md 的冲突检查，再按 .showu/skills/showu-create-plan/SKILL.md 登记计划。完成工作按 .showu/skills/showu-update-status/SKILL.md 更新状态、设计理由、验证证据与下一步。规模维护见 .showu/protocol.md；检查年度计划索引中的 active/paused，按模块代码入口定位，历史正文按需读取。\n"),
    ] {
        let (path, label) = if name == "AGENTS.md" {
            (safe_path(project, name)?, name.to_string())
        } else {
            (safe_path(&dir, name)?, format!(".showu/{name}"))
        };
        if path.is_file() { continue; }
        if path.exists() { return Err(format!("{label} 已被目录占用")); }
        let parent = path.parent().ok_or("无父目录")?;
        fs::create_dir_all(parent).map_err(|e| format!("{label}: {e}"))?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        match temp.persist_noclobber(&path) {
            Ok(_) => created.push(label),
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists && path.is_file() => (),
            Err(e) => return Err(format!("{label}: {e}")),
        }
    }
    Ok(created)
}
#[tauri::command]
fn list_files(state: State<AppState>) -> Result<Vec<String>> {
    let w = lock(&state)?;
    storage::list_files(&root(&w)?)
}
#[tauri::command]
fn read_file(path: String, state: State<AppState>) -> Result<String> {
    let w = lock(&state)?;
    read(&safe_path(&root(&w)?, &path)?)
}
#[tauri::command]
fn save_file(
    path: String,
    content: String,
    expected: Option<String>,
    state: State<AppState>,
) -> Result<()> {
    let w = lock(&state)?;
    let target = safe_path(&root(&w)?, &path)?;
    if path == "config.json" {
        let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        if value.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
            return Err("config.schemaVersion 必须为 1".into());
        }
    }
    save_checked(&target, &content, expected.as_deref())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewPlan {
    slug: String,
    title: String,
    purpose: String,
    source: String,
    code_read: String,
    modules: String,
    review: String,
    review_result: String,
    tasks: Vec<String>,
}
fn single_line(s: &str) -> bool {
    !s.trim().is_empty() && !s.contains(['\n', '\r', '|', '[', ']'])
}
#[tauri::command]
fn create_plan(plan: NewPlan, expected_index: String, state: State<AppState>) -> Result<String> {
    if !valid_slug(&plan.slug) || !single_line(&plan.title) {
        return Err("计划标识或标题无效".into());
    }
    if plan.review_result != "clear" {
        return Err("需求检查未通过，停止创建计划".into());
    }
    if [
        &plan.purpose,
        &plan.source,
        &plan.code_read,
        &plan.modules,
        &plan.review,
    ]
    .iter()
    .any(|s| s.trim().is_empty())
        || plan.tasks.is_empty()
        || plan.tasks.iter().any(|s| !single_line(s))
    {
        return Err("请完整填写目的、来源、代码、模块、检查依据与任务".into());
    }
    let w = lock(&state)?;
    let dir = root(&w)?;
    let relative = format!("plans/{}.md", plan.slug);
    let path = safe_path(&dir, &relative)?;
    let index = safe_path(&dir, "plans.md")?;
    if read(&index)? != expected_index {
        return Err("计划索引已变更，请刷新后重试".into());
    }
    if path.exists() {
        return Err("计划标识已存在".into());
    }
    let tasks = plan
        .tasks
        .iter()
        .enumerate()
        .map(|(i, t)| format!("- [ ] T{} {}", i + 1, t.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    let content = format!("# {}\n\nstatus: active\n\n## 目的与来源\n\n{}\n\n来源：{}\n\n## 代码现状与冲突检查\n\n已读代码：{}\n\n涉及模块：{}\n\n结论：无冲突（创建者核对）\n\n依据：{}\n\n## 任务\n\n{}\n\n## 设计理由\n\n待记录实现决策与原因。\n\n## 验证与完成证据\n\n尚未执行。\n\n## 下一步\n\n从第一个未完成任务开始。\n", plan.title, plan.purpose, plan.source, plan.code_read, plan.modules, plan.review, tasks);
    save_checked(&path, &content, None)?;
    let updated = format!(
        "{}\n| {} | active | [{}]({}) |\n",
        expected_index.trim_end(),
        plan.title,
        plan.slug,
        relative
    );
    if let Err(e) = save_checked(&index, &updated, Some(&expected_index)) {
        let _ = fs::remove_file(path);
        return Err(e);
    }
    Ok(relative)
}

#[tauri::command]
fn change_plan(
    path: String,
    expected: String,
    expected_index: String,
    status: String,
    state: State<AppState>,
) -> Result<()> {
    if !["active", "paused", "done", "cancelled", "archive"].contains(&status.as_str()) {
        return Err("无效状态".into());
    }
    let slug = path
        .strip_prefix("plans/")
        .and_then(|s| s.strip_suffix(".md"))
        .ok_or("不是计划文件")?;
    if !valid_slug(slug) {
        return Err("不是有效计划".into());
    }
    let w = lock(&state)?;
    let dir = root(&w)?;
    let target = safe_path(&dir, &path)?;
    let (owner, _) = storage::plan_index_owner(&dir, &path)?;
    let index = safe_path(&dir, &owner)?;
    if read(&target)? != expected || read(&index)? != expected_index {
        return Err("文件已变更，请刷新后重试".into());
    }
    let link = format!("]({path})");
    let mut found = 0;
    let updated_index = expected_index
        .lines()
        .filter_map(|line| {
            if !line.contains(&link) {
                return Some(line.to_string());
            }
            found += 1;
            if status == "archive" {
                return None;
            }
            let mut cells: Vec<_> = line.split('|').map(str::to_string).collect();
            if cells.len() == 5 {
                cells[2] = format!(" {status} ");
            }
            Some(cells.join("|"))
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    if found != 1 {
        return Err("索引链接缺失或重复，请先修复 plans.md".into());
    }
    if status == "archive" {
        let archive = safe_path(&dir, &format!("plans/archive/{slug}.md"))?;
        if archive.exists() {
            return Err("同名归档已存在，请先处理".into());
        }
        save_checked(&archive, &expected, None)?;
        if let Err(e) = save_checked(&index, &updated_index, Some(&expected_index)) {
            let _ = fs::remove_file(&archive);
            return Err(e);
        }
        if let Err(e) = fs::remove_file(&target) {
            let rollback = atomic_write(&index, &expected_index);
            let _ = fs::remove_file(&archive);
            return Err(format!("归档失败：{e}；索引回滚：{rollback:?}"));
        }
    } else {
        let mut replaced = false;
        let updated = expected
            .lines()
            .map(|line| {
                if !replaced && line.starts_with("status: ") {
                    replaced = true;
                    format!("status: {status}")
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        if !replaced {
            return Err("计划缺少 status 行".into());
        }
        save_checked(&target, &updated, Some(&expected))?;
        if let Err(e) = save_checked(&index, &updated_index, Some(&expected_index)) {
            let _ = atomic_write(&target, &expected);
            return Err(e);
        }
    }
    Ok(())
}

#[tauri::command]
fn save_launchers(launchers: Vec<Launcher>, state: State<AppState>) -> Result<()> {
    if launchers.iter().any(|l| {
        l.name.trim().is_empty()
            || l.commands.is_empty()
            || l.commands
                .iter()
                .any(|c| c.program.trim().is_empty() || c.program.contains('\0'))
    }) {
        return Err("每个启动器须有名称和有效命令".into());
    }
    let mut w = lock(&state)?;
    let previous = std::mem::replace(&mut w.settings.launchers, launchers);
    if let Err(error) = persist(&w) {
        w.settings.launchers = previous;
        return Err(error);
    }
    Ok(())
}
fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}
fn launch_one(c: &LaunchCommand, cwd: Option<&Path>) -> Result<()> {
    let args = c
        .args
        .iter()
        .filter_map(|arg| {
            if arg.contains("{project}") {
                cwd.map(|path| arg.replace("{project}", &path.to_string_lossy()))
            } else {
                Some(arg.clone())
            }
        })
        .collect::<Vec<_>>();
    #[cfg(windows)]
    if c.program.to_lowercase().ends_with(".lnk") {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        if !args.is_empty() {
            return Err("快捷方式参数请在快捷方式属性中配置".into());
        }
        let file = std::ffi::OsStr::new(&c.program)
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        let directory = cwd.map(|path| {
            path.as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect::<Vec<_>>()
        });
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                std::ptr::null(),
                file.as_ptr(),
                std::ptr::null(),
                directory
                    .as_ref()
                    .map_or(std::ptr::null(), |dir| dir.as_ptr()),
                SW_SHOWNORMAL,
            )
        } as isize;
        return if result > 32 {
            Ok(())
        } else {
            Err(format!("启动快捷方式失败：{result}"))
        };
    }
    let mut command = Command::new(&c.program);
    command.args(args);
    if let Some(path) = cwd {
        command.current_dir(path);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x00000010);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
#[tauri::command]
async fn launch(index: usize, state: State<'_, AppState>) -> Result<Vec<String>> {
    let (cwd, launcher) = {
        let w = lock(&state)?;
        (
            w.selected.clone(),
            w.settings
                .launchers
                .get(index)
                .ok_or("启动器不存在")?
                .clone(),
        )
    };
    tauri::async_runtime::spawn_blocking(move || {
        launcher
            .commands
            .iter()
            .enumerate()
            .map(|(i, command)| {
                if launcher.sequential && i > 0 {
                    std::thread::sleep(std::time::Duration::from_secs(
                        command.delay_seconds.into(),
                    ));
                }
                match launch_one(command, cwd.as_deref()) {
                    Ok(_) => format!("已启动 {}", command.program),
                    Err(e) => format!("{}：{e}", command.program),
                }
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())
}

fn git(cwd: &Path, args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    hidden(&mut cmd);
    let out = cmd
        .current_dir(cwd)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("无法运行 Git：{e}"))?;
    let output = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if out.status.success() {
        Ok(output)
    } else {
        Err(output)
    }
}
#[tauri::command]
async fn git_action(
    action: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    let cwd = {
        let w = lock(&state)?;
        project(&w)?
    };
    tauri::async_runtime::spawn_blocking(move || match action.as_str() {
        "link" => {
            let url = remote.ok_or("请输入远程仓库地址")?;
            if url.trim().is_empty() || url.starts_with('-') || url.contains(['\n', '\r']) {
                return Err("无效仓库地址".into());
            }
            if !cwd.join(".git").exists() {
                git(&cwd, &["init"])?;
            }
            if git(&cwd, &["remote", "get-url", "origin"]).is_ok() {
                git(&cwd, &["remote", "set-url", "origin", &url])?;
            } else {
                git(&cwd, &["remote", "add", "origin", &url])?;
            }
            Ok("已链接 origin；未克隆、提交或推送。".into())
        }
        "check" => {
            git(&cwd, &["fetch", "--prune", "origin"])?;
            let branch = git(&cwd, &["status", "--short", "--branch"])?;
            let counts = git(
                &cwd,
                &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
            )
            .unwrap_or_else(|_| "当前分支未设置上游，无法判断远程更新。".into());
            Ok(format!("{branch}\n本地领先 / 远程领先：{counts}"))
        }
        "pull" => git(&cwd, &["pull", "--ff-only"]),
        "push" => git(&cwd, &["push"]),
        "status" => git(&cwd, &["status", "--short", "--branch"]),
        _ => Err("未知 Git 操作".into()),
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("settings.json");
            let settings = if config_path.exists() {
                serde_json::from_str(&fs::read_to_string(&config_path)?)?
            } else {
                Settings::default()
            };
            app.manage(AppState(Mutex::new(Workspace {
                selected: None,
                watcher: None,
                settings,
                config_path,
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shared::shared_tools,
            shared::import_tool,
            shared::resend_tool,
            shared::tool_instruction,
            get_settings,
            project_summary,
            select_project,
            remove_project,
            initialize_project,
            list_files,
            read_file,
            save_file,
            create_plan,
            change_plan,
            save_launchers,
            launch,
            git_action
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 ShowU");
}

#[cfg(test)]
mod tests;
