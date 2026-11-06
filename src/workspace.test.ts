import { expect, it } from "vitest";
import { loadWorkspace, workspacePlans, resolveDocumentLink } from "./workspace";
it("1000 historical plans and years of history do not load historical bodies", async () => {
  const files: Record<string,string> = {
    "brief.md": "purpose", "config.json": "{}",
    "plans.md": "| Current | active | [p](plans/current.md) |\n[2026](plans/indexes/2026.md)",
    "plans/current.md": "- [ ] T1", "plans/indexes/2026.md": "",
  };
  for (let i=0;i<1000;i++) {
    files["plans/indexes/2026.md"] += `| Old ${i} | done | [p](plans/old-${i}.md) |\n`;
    files[`plans/old-${i}.md`] = "history".repeat(10000);
    files[`requirements/history/core/${i}.md`] = "obsolete".repeat(10000);
  }
  const reads: string[] = [];
  const read = async (path: string) => { reads.push(path); return files[path]; };
  const docs = await loadWorkspace(Object.keys(files), read);
  expect(reads.sort()).toEqual(["brief.md","config.json","plans.md","plans/current.md","plans/indexes/2026.md"].sort());
  expect(workspacePlans(docs)).toHaveLength(1001);
  expect(workspacePlans(docs).filter((p)=>p.status === "done")).toHaveLength(1000);
  const opened = await loadWorkspace(Object.keys(files), read, "plans/old-3.md");
  expect(opened["plans/old-3.md"]).toBe(files["plans/old-3.md"]);
});
it("broken indexes, duplicates and escaping links are rejected", async () => {
  await expect(loadWorkspace(["plans.md"], async () => "[2020](plans/indexes/2020.md)")).rejects.toThrow("历史索引缺失");
  expect(() => workspacePlans({"plans.md":"| a | done | [p](plans/a.md) |\n| a | done | [p](plans/a.md) |"})).toThrow("重复");
  expect(resolveDocumentLink("requirements/core.md", "history/core/2026.md")).toBe("requirements/history/core/2026.md");
  expect(resolveDocumentLink("requirements/core.md", "../../outside.md")).toBeNull();
});
