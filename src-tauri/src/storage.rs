use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

pub type Result<T> = std::result::Result<T, String>;

pub fn read(path: &Path) -> Result<String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("无父目录")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    { meta.file_type().is_symlink() }
}

pub fn safe_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if relative.contains(['\\', ':'])
        || rel.as_os_str().is_empty()
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("非法相对路径".into());
    }
    let mut current = root.to_path_buf();
    if fs::symlink_metadata(&current)
        .map(|m| is_link(&m))
        .unwrap_or(false)
    {
        return Err("不允许 .showu 符号链接".into());
    }
    for part in rel.components() {
        current.push(part);
        if let Ok(meta) = fs::symlink_metadata(&current) {
            if is_link(&meta) {
                return Err("不允许符号链接".into());
            }
        }
    }
    let extension = current.extension().and_then(|x| x.to_str()).unwrap_or("");
    if extension != "md" && relative != "config.json" {
        return Err("仅支持 Markdown 和 config.json".into());
    }
    Ok(current)
}

pub fn save_checked(path: &Path, content: &str, expected: Option<&str>) -> Result<()> {
    match (path.exists(), expected) {
        (true, Some(old)) if read(path)? == old => (),
        (false, None) => (),
        _ => return Err("文件已被外部修改或删除，请重新加载；草稿仍保留在编辑器。".into()),
    }
    atomic_write(path, content)
}

pub fn valid_slug(slug: &str) -> bool {
    let reserved = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    !slug.is_empty()
        && slug.len() <= 64
        && !reserved.contains(&slug)
        && slug
            .bytes()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && slug
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

pub fn list_files(root: &Path) -> Result<Vec<String>> {
    fn walk(base: &Path, dir: &Path, found: &mut Vec<String>) -> Result<()> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() || is_link(&fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?) {
                continue;
            }
            if kind.is_dir() {
                walk(base, &entry.path(), found)?;
            } else {
                let relative = entry
                    .path()
                    .strip_prefix(base)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                if relative.ends_with(".md") || relative == "config.json" {
                    found.push(relative);
                }
            }
        }
        Ok(())
    }
    if !root.exists() {
        return Ok(vec![]);
    }
    safe_path(root, "config.json")?;
    let mut files = vec![];
    walk(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_edits_are_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("plan.md");
        save_checked(&p, "first", None).unwrap();
        atomic_write(&p, "AI update").unwrap();
        assert!(save_checked(&p, "draft", Some("first")).is_err());
        assert_eq!(read(&p).unwrap(), "AI update");
        save_checked(&p, "merged", Some("AI update")).unwrap();
    }
    #[test]
    fn traversal_and_invalid_names_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        for input in [
            "../outside.md",
            "C:/outside.md",
            "plans/../../x.md",
            "plans\\x.md",
            "run.exe",
        ] {
            assert!(safe_path(dir.path(), input).is_err(), "{input}");
        }
        for input in ["", "CON", "con", "../x", "a/b", "lpt1"] {
            assert!(!valid_slug(input));
        }
        assert!(valid_slug("first-plan-2"));
    }
}

// Index metadata is small; historical task bodies are never read here.
pub fn plan_indexes(root: &Path) -> Result<Vec<(String, String)>> {
    let main = read(&safe_path(root, "plans.md")?)?;
    let mut indexes = vec![("plans.md".to_string(), main.clone())];
    for part in main.split("](plans/indexes/").skip(1) {
        let name = part.split(')').next().ok_or("无效历史索引")?;
        if name.len() != 7 || !name.ends_with(".md") || !name.as_bytes()[..4].iter().all(|b| b.is_ascii_digit()) {
            return Err("历史索引必须为 plans/indexes/YYYY.md".into());
        }
        let path = format!("plans/indexes/{name}");
        if !indexes.iter().any(|(p, _)| p == &path) {
            indexes.push((path.clone(), read(&safe_path(root, &path)?)?));
        }
    }
    Ok(indexes)
}
pub fn plan_index_owner(root: &Path, plan: &str) -> Result<(String, String)> {
    let link = format!("]({plan})");
    let matches: Vec<_> = plan_indexes(root)?.into_iter().filter(|(_, text)| text.lines().any(|line| line.contains(&link))).collect();
    if matches.len() != 1 { return Err("计划索引缺失或重复".into()); }
    Ok(matches.into_iter().next().unwrap())
}

#[cfg(test)]
mod index_tests {
    use super::*;
    #[test]
    fn historical_index_ownership_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        atomic_write(&dir.path().join("plans.md"), "[2026](plans/indexes/2026.md)").unwrap();
        assert!(plan_indexes(dir.path()).is_err());
        atomic_write(&dir.path().join("plans/indexes/2026.md"), "| Old | done | [p](plans/old.md) |\n").unwrap();
        let (owner, text) = plan_index_owner(dir.path(), "plans/old.md").unwrap();
        assert_eq!(owner, "plans/indexes/2026.md");
        assert!(text.contains("done"));
        atomic_write(&dir.path().join("plans.md"), "[2026](plans/indexes/2026.md)\n| Duplicate | done | [p](plans/old.md) |").unwrap();
        assert!(plan_index_owner(dir.path(), "plans/old.md").is_err());
    }
}
