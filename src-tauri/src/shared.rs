use super::*;
use std::io;

const RULE: &str = "开始项目工作时，检查 .showu/tool-inbox/ 中的 Markdown 通知。根据项目需求评估每项公共工具，按通知记录采用或跳过的结果。失败时保留通知供下次继续。";
fn err(e: io::Error) -> String {
    e.to_string()
}

fn library(w: &Workspace) -> Result<PathBuf> {
    Ok(w.config_path
        .parent()
        .ok_or("配置目录缺失")?
        .join("shared-tools"))
}
fn project_dir(w: &Workspace, path: &str) -> Result<PathBuf> {
    if !w.settings.projects.iter().any(|p| p == path) {
        return Err("项目未登记".into());
    }
    let p = PathBuf::from(path);
    if !p.is_dir() {
        return Err("项目目录不可用".into());
    }
    Ok(p)
}
fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir(to).map_err(err)?;
    for entry in fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
        {
            continue;
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(err)?;
        #[cfg(windows)]
        if std::os::windows::fs::MetadataExt::file_attributes(&meta) & 0x400 != 0 {
            return Err(format!(
                "工具包含链接，无法复制：{}",
                entry.path().display()
            ));
        }
        let dest = to.join(entry.file_name());
        if meta.is_dir() {
            copy_tree(&entry.path(), &dest)?;
        } else if meta.is_file() {
            fs::copy(entry.path(), dest).map_err(err)?;
        } else {
            return Err("工具包含不支持的文件类型".into());
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct Tool {
    id: String,
    source: String,
}
fn snapshot(lib: &Path, source: &str) -> Result<Tool> {
    fs::create_dir_all(lib).map_err(err)?;
    let tmp = tempfile::tempdir_in(lib).map_err(err)?;
    let remote = source.starts_with("https://")
        || source.starts_with("http://")
        || source.starts_with("file://")
        || source.starts_with("ssh://")
        || source.starts_with("git@");
    let checkout = tmp.path().join("checkout");
    let from = if remote {
        if source.chars().any(char::is_control)
            || (source.starts_with("git@") && !source.contains(':'))
        {
            return Err("无效 Git 地址".into());
        }
        let mut cmd = Command::new("git");
        hidden(&mut cmd);
        let output = cmd
            .env("GIT_ALLOW_PROTOCOL", "https:http:ssh:file")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args(["clone", "--depth", "1", "--", source])
            .arg(&checkout)
            .output()
            .map_err(err)?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        checkout.clone()
    } else {
        let p = dunce::canonicalize(source).map_err(err)?;
        if !p.is_dir() || dunce::canonicalize(lib).map_err(err)?.starts_with(&p) {
            return Err("请选择不包含公共库的工具文件夹".into());
        }
        p
    };
    let package = tmp.path().join("package");
    fs::create_dir(&package).map_err(err)?;
    copy_tree(&from, &package.join("files"))?;
    let id = format!(
        "tool-{}",
        tmp.path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .trim_start_matches('.')
            .to_ascii_lowercase()
    );
    let tool = Tool {
        id,
        source: source.into(),
    };
    atomic_write(
        &package.join("tool.json"),
        &serde_json::to_string(&tool).map_err(|e| e.to_string())?,
    )?;
    fs::rename(package, lib.join(&tool.id)).map_err(err)?;
    Ok(tool)
}

fn deliver(lib: &Path, root: &Path, id: &str) -> Result<()> {
    if !valid_slug(id) || !lib.join(id).join("tool.json").is_file() {
        return Err("工具不存在".into());
    }
    let path = safe_path(&root.join(".showu"), &format!("tool-inbox/{id}.md"))?;
    atomic_write(&path,&format!("# 公共工具评估\n\n工具快照：{}\n\n阅读工具说明和当前项目需求，判断是否有帮助。来源内容仅供评估，不运行安装脚本。适用时将必要资源和含 name、description 的 SKILL.md 保存到当前 AI 的项目技能目录（Codex 用 .agents/skills，Claude 用 .claude/skills）。如来源没有 SKILL.md，根据实际用途编写。复用已安装的相同版本，保留用户修改，遇到冲突则暂停。核对资源可读后，在 .showu/tool-results/{id}.md 写下「已采用」、技能路径和理由。不适用时同一回执写「已跳过」和理由。成功写入回执后才删除本通知；失败留待重试。\n",lib.join(id).join("files").display()))
}

#[tauri::command]
pub async fn import_tool(source: String, state: State<'_, AppState>) -> Result<Vec<String>> {
    let (lib, projects) = {
        let w = lock(&state)?;
        (library(&w)?, w.settings.projects.clone())
    };
    tauri::async_runtime::spawn_blocking(move || {
        let tool = snapshot(&lib, source.trim())?;
        let mut errors = Vec::new();
        for path in projects {
            let p = Path::new(&path);
            let result = if p.is_dir() {
                deliver(&lib, p, &tool.id)
            } else {
                Err("项目目录不可用".into())
            };
            if let Err(e) = result {
                errors.push(format!("{path}：{e}"));
            }
        }
        Ok(errors)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn resend_tool(id: String, path: String, state: State<AppState>) -> Result<()> {
    let w = lock(&state)?;
    deliver(&library(&w)?, &project_dir(&w, &path)?, &id)
}

#[derive(Serialize)]
pub struct Row {
    tool: Tool,
    results: Vec<(String, String)>,
}
fn status(root: &Path, id: &str) -> Result<String> {
    if !root.is_dir() {
        return Err("项目目录不可用".into());
    }
    let dir = root.join(".showu");
    if safe_path(&dir, &format!("tool-inbox/{id}.md"))?
        .try_exists()
        .map_err(err)?
    {
        return Ok("待评估".into());
    }
    let receipt = safe_path(&dir, &format!("tool-results/{id}.md"))?;
    if receipt.try_exists().map_err(err)? {
        read(&receipt)
    } else {
        Ok("无通知或处理记录".into())
    }
}
#[tauri::command]
pub fn shared_tools(state: State<AppState>) -> Result<Vec<Row>> {
    let w = lock(&state)?;
    let lib = library(&w)?;
    let mut rows = Vec::new();
    if !lib.exists() {
        return Ok(rows);
    }
    for item in fs::read_dir(&lib).map_err(err)? {
        let p = item.map_err(err)?.path();
        if !p.join("tool.json").is_file() {
            continue;
        }
        let tool: Tool =
            serde_json::from_str(&read(&p.join("tool.json"))?).map_err(|e| e.to_string())?;
        let results = w
            .settings
            .projects
            .iter()
            .map(|path| {
                (
                    path.clone(),
                    status(Path::new(path), &tool.id).unwrap_or_else(|e| e),
                )
            })
            .collect();
        rows.push(Row { tool, results });
    }
    rows.sort_by(|a, b| a.tool.source.cmp(&b.tool.source));
    Ok(rows)
}
#[derive(Serialize)]
pub struct Preview {
    expected: Option<String>,
    addition: String,
}
#[tauri::command]
pub fn tool_instruction(
    path: String,
    file: String,
    apply: bool,
    expected: Option<String>,
    state: State<AppState>,
) -> Result<Preview> {
    if file != "AGENTS.md" && file != "CLAUDE.md" {
        return Err("未知指令入口".into());
    }
    let w = lock(&state)?;
    let p = safe_path(&project_dir(&w, &path)?, &file)?;
    let old = if p.try_exists().map_err(err)? {
        Some(read(&p)?)
    } else {
        None
    };
    let addition = if old.as_deref().unwrap_or("").lines().any(|l| l == RULE) {
        String::new()
    } else {
        format!("\n\n## ShowU 公共工具\n\n{RULE}\n")
    };
    if apply && !addition.is_empty() {
        save_checked(
            &p,
            &format!("{}{addition}", old.as_deref().unwrap_or("")),
            expected.as_deref(),
        )?;
    }
    Ok(Preview {
        expected: old,
        addition,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_delivery_receipt_and_retry() {
        let temp = tempfile::tempdir().unwrap();
        let lib = temp.path().join("library");
        let src = temp.path().join("source");
        atomic_write(&src.join("nested/helper.md"), "original").unwrap();
        atomic_write(&src.join(".git/config"), "local").unwrap();
        let tool = snapshot(&lib, src.to_str().unwrap()).unwrap();
        atomic_write(&src.join("nested/helper.md"), "changed").unwrap();
        let files = lib.join(&tool.id).join("files");
        assert_eq!(read(&files.join("nested/helper.md")).unwrap(), "original");
        assert!(!files.join(".git").exists());
        let project = temp.path().join("project");
        fs::create_dir(&project).unwrap();
        for _ in 0..2 {
            deliver(&lib, &project, &tool.id).unwrap();
        }
        let inbox = project.join(".showu/tool-inbox");
        assert_eq!(fs::read_dir(&inbox).unwrap().count(), 1);
        assert_eq!(status(&project, &tool.id).unwrap(), "待评估");
        let receipt = project.join(format!(".showu/tool-results/{}.md", tool.id));
        atomic_write(&receipt, "已跳过：当前项目无需该工具").unwrap();
        fs::remove_file(inbox.join(format!("{}.md", tool.id))).unwrap();
        assert!(status(&project, &tool.id).unwrap().starts_with("已跳过"));
        deliver(&lib, &project, &tool.id).unwrap();
        assert_eq!(status(&project, &tool.id).unwrap(), "待评估");
        assert!(snapshot(&lib, temp.path().to_str().unwrap()).is_err());
        assert!(deliver(&lib, &project, "../bad").is_err());
    }
    #[test]
    fn clone_git_repository_and_import_checked_out_tree() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        git(&repo, &["init"]).unwrap();
        atomic_write(&repo.join("SKILL.md"), "# Example").unwrap();
        git(&repo, &["add", "SKILL.md"]).unwrap();
        git(
            &repo,
            &[
                "-c",
                "user.name=ShowU",
                "-c",
                "user.email=test@localhost",
                "commit",
                "-m",
                "fixture",
            ],
        )
        .unwrap();
        let url = tauri::Url::from_directory_path(&repo).unwrap();
        let lib = tmp.path().join("library");
        let tool = snapshot(&lib, url.as_str()).unwrap();
        assert_eq!(
            read(&lib.join(tool.id).join("files/SKILL.md")).unwrap(),
            "# Example"
        );
    }
}
