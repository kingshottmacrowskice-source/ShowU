import { invoke, isTauri } from "@tauri-apps/api/core";
import type { NewPlan, Settings, Launcher } from "./domain";
export const desktop = isTauri();
export const api = {
  summary: (path: string) => invoke<{ brief: string | null; plans: string | null }>("project_summary", { path }),
  settings: () => invoke<Settings>("get_settings"),
  select: (path: string) => invoke<string>("select_project", { path }),
  remove: (path: string) => invoke<void>("remove_project", { path }),
  initialize: () => invoke<string[]>("initialize_project"),
  files: () => invoke<string[]>("list_files"),
  read: (path: string) => invoke<string>("read_file", { path }),
  save: (path: string, content: string, expected: string | null) =>
    invoke<void>("save_file", { path, content, expected }),
  createPlan: (plan: NewPlan, expectedIndex: string) =>
    invoke<string>("create_plan", { plan, expectedIndex }),
  changePlan: (
    path: string,
    expected: string,
    expectedIndex: string,
    status: string,
  ) => invoke<void>("change_plan", { path, expected, expectedIndex, status }),
  saveLaunchers: (launchers: Launcher[]) =>
    invoke<void>("save_launchers", { launchers }),
  launch: (index: number) => invoke<string[]>("launch", { index }),
  git: (action: string, remote: string | null = null) =>
    invoke<string>("git_action", { action, remote }),
};
