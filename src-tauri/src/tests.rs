use super::*;

fn workspace() -> (tempfile::TempDir, tauri::App<tauri::test::MockRuntime>) {
    let dir = tempfile::tempdir().unwrap();
    let app = tauri::test::mock_app();
    atomic_write(
        &dir.path().join(".showu/plans.md"),
        "# 计划\n\n| 计划 | 状态 | 任务文件 |\n| --- | --- | --- |\n",
    )
    .unwrap();
    app.manage(AppState(Mutex::new(Workspace {
        selected: Some(dir.path().to_path_buf()),
        watcher: None,
        settings: Settings::default(),
        config_path: dir.path().join("settings.json"),
    })));
    (dir, app)
}
fn plan() -> NewPlan {
    NewPlan {
        slug: "first-plan".into(),
        title: "保存文件".into(),
        purpose: "防止覆盖外部改动".into(),
        source: "用户指令".into(),
        code_read: "storage.rs".into(),
        modules: "core / CORE-001".into(),
        review: "同能力点诉求一致".into(),
        review_result: "clear".into(),
        tasks: vec!["验证保存".into()],
    }
}
#[test]
fn plan_creation_status_and_archive_preserve_history() {
    let (dir, app) = workspace();
    let root = dir.path().join(".showu");
    let index = read(&root.join("plans.md")).unwrap();
    let path = create_plan(plan(), index, app.state()).unwrap();
    let original = read(&root.join(&path)).unwrap();
    assert!(original.contains("- [ ] T1 验证保存"));
    let index = read(&root.join("plans.md")).unwrap();
    assert!(index.contains("[first-plan](plans/first-plan.md)"));
    change_plan(path.clone(), original, index, "paused".into(), app.state()).unwrap();
    let paused = read(&root.join(&path)).unwrap();
    assert!(paused.contains("status: paused"));
    let index = read(&root.join("plans.md")).unwrap();
    assert!(index.contains("| paused |"));
    change_plan(
        path.clone(),
        paused.clone(),
        index,
        "archive".into(),
        app.state(),
    )
    .unwrap();
    assert!(!root.join(path).exists());
    assert_eq!(
        read(&root.join("plans/archive/first-plan.md")).unwrap(),
        paused
    );
    assert!(!read(&root.join("plans.md")).unwrap().contains("first-plan"));
}
#[test]
fn unresolved_conflicts_and_stale_index_never_create_a_plan() {
    let (dir, app) = workspace();
    let root = dir.path().join(".showu");
    let index = read(&root.join("plans.md")).unwrap();
    let mut conflict = plan();
    conflict.review_result = "conflict".into();
    assert!(create_plan(conflict, index.clone(), app.state()).is_err());
    assert!(create_plan(plan(), "stale".into(), app.state()).is_err());
    assert!(!root.join("plans/first-plan.md").exists());
    assert_eq!(read(&root.join("plans.md")).unwrap(), index);
}
#[test]
fn stale_task_content_cannot_update_index_or_archive() {
    let (dir, app) = workspace();
    let root = dir.path().join(".showu");
    let path = create_plan(plan(), read(&root.join("plans.md")).unwrap(), app.state()).unwrap();
    let index = read(&root.join("plans.md")).unwrap();
    assert!(change_plan(
        path.clone(),
        "stale".into(),
        index.clone(),
        "archive".into(),
        app.state()
    )
    .is_err());
    assert!(root.join(path).exists());
    assert_eq!(read(&root.join("plans.md")).unwrap(), index);
}
#[test]
fn filesystem_watch_emits_changes_from_external_writers() {
    use tauri::Listener;
    let (dir, app) = workspace();
    let (send, recv) = std::sync::mpsc::channel();
    app.listen("showu-changed", move |event| {
        let _ = send.send(event.payload().to_string());
    });
    let state: State<AppState> = app.state();
    watch(&mut lock(&state).unwrap(), app.handle().clone()).unwrap();
    atomic_write(
        &dir.path().join(".showu/external.md"),
        "AI changed this file",
    )
    .unwrap();
    let payload = recv
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();
    assert_eq!(
        serde_json::from_str::<String>(&payload).unwrap(),
        dir.path().to_string_lossy()
    );
}
#[test]
fn local_git_remote_roundtrip_does_not_need_network_or_credentials() {
    let (dir, app) = workspace();
    let remote = tempfile::tempdir().unwrap();
    git(remote.path(), &["init", "--bare"]).unwrap();
    let result = tauri::async_runtime::block_on(git_action(
        "link".into(),
        Some(remote.path().to_string_lossy().to_string()),
        app.state(),
    ));
    assert!(result.is_ok(), "{result:?}");
    git(dir.path(), &["config", "user.name", "ShowU Test"]).unwrap();
    git(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    )
    .unwrap();
    git(dir.path(), &["add", ".showu/plans.md"]).unwrap();
    git(dir.path(), &["commit", "-m", "test fixture"]).unwrap();
    git(dir.path(), &["push", "-u", "origin", "HEAD"]).unwrap();
    let result =
        tauri::async_runtime::block_on(git_action("check".into(), None, app.state())).unwrap();
    assert!(result.contains("0\t0"), "{result}");
    assert!(tauri::async_runtime::block_on(git_action("pull".into(), None, app.state())).is_ok());
    assert!(tauri::async_runtime::block_on(git_action("push".into(), None, app.state())).is_ok());
}

#[test]
fn completion_preserves_existing_files_and_repairs_only_missing_ones() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let created = complete_files(root).unwrap();
    assert!(created.iter().any(|p| p == "AGENTS.md"));
    assert!(read(&root.join("AGENTS.md"))
        .unwrap()
        .contains(".showu/skills/showu-create-plan/SKILL.md"));
    fs::write(root.join("AGENTS.md"), "custom").unwrap();
    fs::write(root.join(".showu/brief.md"), "human").unwrap();
    fs::remove_file(root.join(".showu/config.json")).unwrap();
    assert_eq!(complete_files(root).unwrap(), vec![".showu/config.json"]);
    assert!(complete_files(root).unwrap().is_empty());
    assert_eq!(read(&root.join("AGENTS.md")).unwrap(), "custom");
    assert_eq!(read(&root.join(".showu/brief.md")).unwrap(), "human");
}

#[cfg(windows)]
#[test]
fn launcher_runs_without_selected_project() {
    let (dir, app) = workspace();
    let marker = dir.path().join("launched.txt");
    let state = app.state::<AppState>();
    {
        let mut workspace = lock(&state).unwrap();
        workspace.selected = None;
        workspace.settings.launchers.push(Launcher {
            name: "standalone".into(),
            sequential: false,
            commands: vec![LaunchCommand {
                program: "powershell.exe".into(),
                args: vec![
                    "-NoProfile".into(),
                    "-NonInteractive".into(),
                    "-Command".into(),
                    format!(
                        "Set-Content -LiteralPath '{}' -Value ok",
                        marker.display().to_string().replace('\'', "''")
                    ),
                    "{project}".into(),
                ],
                delay_seconds: 0,
            }],
        });
    }
    let result = tauri::async_runtime::block_on(launch(0, state)).unwrap();
    assert_eq!(result, vec!["已启动 powershell.exe"]);
    for _ in 0..100 {
        if std::fs::read_to_string(&marker).is_ok_and(|s| s.trim() == "ok") {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    panic!("独立启动的进程未写出预期结果");
}

#[test]
fn historical_plan_reopen_updates_owning_index_and_preserves_main() {
    let (dir, app) = workspace();
    let root = dir.path().join(".showu");
    let main = "# Plans\n[2026](plans/indexes/2026.md)\n";
    let history = "| Old | done | [old](plans/old.md) |\n";
    let body = "# Old\nstatus: done\n- [x] T1 Done\n";
    atomic_write(&root.join("plans.md"), main).unwrap();
    atomic_write(&root.join("plans/indexes/2026.md"), history).unwrap();
    atomic_write(&root.join("plans/old.md"), body).unwrap();
    change_plan("plans/old.md".into(), body.into(), history.into(), "active".into(), app.state()).unwrap();
    assert_eq!(read(&root.join("plans.md")).unwrap(), main);
    assert!(read(&root.join("plans/indexes/2026.md")).unwrap().contains("| active |"));
    assert!(read(&root.join("plans/old.md")).unwrap().contains("status: active"));
    assert!(change_plan("plans/old.md".into(), body.into(), history.into(), "done".into(), app.state()).is_err());
}
