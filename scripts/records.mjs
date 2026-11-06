import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
function target(root, relative) {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw Error("路径超出项目");
  let cursor = resolved;
  while (cursor !== path.resolve(root)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error("不允许符号链接");
    cursor = path.dirname(cursor);
  }
  return resolved;
}
function walk(root, relative) {
  const dir = target(root, relative);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const rel = `${relative}/${name}`;
    const full = target(root, rel);
    return fs.statSync(full).isDirectory() ? walk(root, rel) : [rel];
  });
}
export function audit(root) {
  const files = [...walk(root, ".showu"), ...walk(root, "docs")].filter((p) => p.endsWith(".md"));
  const warnings = [], sizes = [], ids = new Map();
  for (const relative of files) {
    const text = fs.readFileSync(target(root, relative), "utf8");
    const lines = text.split(/\r?\n/).length, bytes = Buffer.byteLength(text);
    sizes.push({path: relative, lines, bytes});
    const plan = /^\.showu\/plans\/[^/]+\.md$/.test(relative);
    const history = relative.includes("/history/") || relative.includes("/archive/");
    if (!history && (lines > (plan ? 200 : 300) || bytes > (plan ? 16384 : 24576))) warnings.push(`${relative}: 超过软阈值，检查重复或分层`);
    if (relative === ".showu/plans.md" && (text.match(/\|\s*(done|cancelled)\s*\|/g) || []).length > 50) warnings.push("plans.md: 超过 50 个历史计划，可分片索引");
    if (/^\.showu\/requirements\/[^/]+\.md$/.test(relative)) {
      const section = text.match(/## 代码入口\r?\n([\s\S]*?)(?=\n## |$)/)?.[1] || "";
      const entries = [...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
      if (!entries.length || entries.length > 8) warnings.push(`${relative}: 入口数量需复核 (${entries.length})`);
      for (const entry of entries) {
        if (!fs.existsSync(target(root, entry))) warnings.push(`${relative}: 入口不存在 ${entry}`);
      }
    }
    if (relative.startsWith(".showu/requirements/")) {
      for (const m of text.matchAll(/^## ([A-Z][A-Z0-9-]*-\d+)\b/gm)) {
        if (ids.has(m[1])) warnings.push(`重复需求 ID ${m[1]}: ${relative}, ${ids.get(m[1])}`);
        ids.set(m[1], relative);
      }
    }
    for (const match of text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].split("#")[0];
      if (!link || /^(https?:|mailto:)/.test(link)) continue;
      const relativeLink = relative.startsWith(".showu/") && /^(plans|requirements)\//.test(link)
        ? `.showu/${link}` : path.join(path.dirname(relative), link);
      try { if (!fs.existsSync(target(root, relativeLink))) warnings.push(`${relative}: 链接不存在 ${link}`); }
      catch { warnings.push(`${relative}: 非法链接 ${link}`); }
    }
  }
  return {files: sizes, totalBytes: sizes.reduce((sum, f) => sum + f.bytes, 0), warnings};
}
// A write-ahead manifest stores every original before changing either file.
export function splitPlans(root, year, backupDir) {
  if (!/^\d{4}$/.test(year)) throw Error("年份须为四位数字");
  const main = ".showu/plans.md", shard = `.showu/plans/indexes/${year}.md`;
  const before = fs.readFileSync(target(root, main), "utf8");
  const rows = before.split(/\r?\n/).filter((line) => /^\|[^|]+\|\s*(done|cancelled)\s*\|\s*\[[^\]]+\]\(plans\/[a-z0-9][a-z0-9-]*\.md\)\s*\|\s*$/.test(line));
  if (rows.length <= 50) return {migrated: 0};
  if (fs.existsSync(target(root, shard))) throw Error("目标历史索引已存在，请人工合并后检查");
  const after = before.split(/\r?\n/).filter((line) => !rows.includes(line)).join("\n") + `\n[${year} 历史计划](plans/indexes/${year}.md)\n`;
  const entries = [
    {path: shard, before: null, after: `# ${year} 历史计划\n\n| 计划 | 状态 | 任务文件 |\n| --- | --- | --- |\n${rows.join("\n")}\n`},
    {path: main, before, after},
  ];
  const dir = target(root, backupDir);
  fs.mkdirSync(dir, {recursive: true});
  const manifest = path.join(dir, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({entries}, null, 2), {flag:"wx"});
  for (const entry of entries) {
    const full = target(root, entry.path);
    const current = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (current !== entry.before) throw Error(`迁移期间文件已变更，使用清单恢复：${entry.path}`);
    fs.mkdirSync(path.dirname(full), {recursive:true});
    fs.writeFileSync(full, entry.after);
  }
  return {migrated: rows.length, manifest, hashes: entries.map((e) => ({path:e.path, sha256:hash(e.after)}))};
}
export function restore(root, manifestRelative) {
  const {entries} = JSON.parse(fs.readFileSync(target(root, manifestRelative), "utf8"));
  for (const entry of entries) {
    const full = target(root, entry.path);
    const now = fs.existsSync(full) ? fs.readFileSync(full,"utf8") : null;
    if (now !== entry.after && now !== entry.before) throw Error(`恢复前发现外部修改：${entry.path}`);
  }
  for (const entry of [...entries].reverse()) {
    const full = target(root, entry.path);
    if (entry.before === null) { if (fs.existsSync(full)) fs.unlinkSync(full); }
    else fs.writeFileSync(full, entry.before);
  }
  return {restored: entries.length};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = "audit", root = ".", arg, backup] = process.argv.slice(2);
  const result = command === "audit" ? audit(root) : command === "split-plans" ? splitPlans(root, arg, backup || `.showu-backups/${Date.now()}`) : command === "restore" ? restore(root, arg) : (()=>{throw Error("未知命令");})();
  console.log(JSON.stringify(result, null, 2));
}
