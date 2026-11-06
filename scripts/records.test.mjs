import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitPlans, restore } from "./records.mjs";
test("migration preserves every row, restores partial migration, and refuses external edits", () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "showu-records-"));
 try {
  fs.mkdirSync(path.join(root,".showu"));
  const original = "# plans\n| Live | active | [p](plans/live.md) |\n" + Array.from({length:1000},(_,i)=>`| Old ${i} | done | [p](plans/old-${i}.md) |`).join("\n");
  fs.writeFileSync(path.join(root,".showu/plans.md"),original);
  assert.equal(splitPlans(root,"2026","backup").migrated,1000);
  const shard = fs.readFileSync(path.join(root,".showu/plans/indexes/2026.md"),"utf8");
  assert.equal((shard.match(/\| done \|/g)||[]).length,1000);
  fs.writeFileSync(path.join(root,".showu/plans.md"),original); // interruption before main was updated
  restore(root,"backup/manifest.json");
  assert.equal(fs.readFileSync(path.join(root,".showu/plans.md"),"utf8"),original);
  assert.equal(fs.existsSync(path.join(root,".showu/plans/indexes/2026.md")),false);
  splitPlans(root,"2026","backup2");
  fs.appendFileSync(path.join(root,".showu/plans.md"),"external edit");
  assert.throws(()=>restore(root,"backup2/manifest.json"),/外部修改/);
 } finally { assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("showu-records-")); fs.rmSync(root,{recursive:true,force:true}); }
});
