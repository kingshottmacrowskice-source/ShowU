import { parsePlans } from "./domain";
export function historyIndexes(text: string): string[] {
  return [...new Set([...text.matchAll(/\[[^\]]*\]\((plans\/indexes\/[0-9]{4}\.md)\)/g)].map((m) => m[1]))];
}
export async function loadWorkspace(paths: string[], read: (path: string) => Promise<string>, opened = "") {
  const docs: Record<string, string> = {};
  const load = async (path: string) => { if (paths.includes(path) && !(path in docs)) docs[path] = await read(path); };
  await Promise.all(["brief.md", "config.json", "plans.md"].map(load));
  for (const index of historyIndexes(docs["plans.md"] || "")) {
    if (!paths.includes(index)) throw new Error(`历史索引缺失：${index}`);
    await load(index);
  }
  const plans = workspacePlans(docs);
  await Promise.all(plans.filter((p) => p.status === "active" || p.status === "paused").map((p) => load(p.path)));
  if (opened) await load(opened);
  return docs;
}
export function workspacePlans(docs: Record<string, string>) {
  const indexes = ["plans.md", ...historyIndexes(docs["plans.md"] || "")];
  const plans = indexes.flatMap((index) => parsePlans(docs[index] || "").map((p) => ({ ...p, index })));
  const seen = new Set<string>();
  for (const plan of plans) {
    if (seen.has(plan.path)) throw new Error(`计划重复登记：${plan.path}`);
    seen.add(plan.path);
  }
  return plans;
}
export function resolveDocumentLink(file: string, link: string): string | null {
  const clean = link.split("#")[0];
  if (!clean) return file;
  if (/[:\\]/.test(clean) || clean.startsWith("/")) return null;
  const parts = /^(plans|requirements)\//.test(clean) ? [] : file.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part !== "." && part) parts.push(part);
  }
  return parts.join("/");
}
