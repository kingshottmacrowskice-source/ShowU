import { useEffect, useState } from "react";
import { api, desktop } from "../api";
import { parsePlans } from "../domain";

export function ProjectSummary({ path }: { path: string }) {
  const [data, setData] = useState<{ brief: string | null; plans: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (!desktop || pending) return;
      pending = true;
      try {
        const next = await api.summary(path);
        if (!disposed) { setData(next); setError(""); }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [path]);
  if (error) return <span className="project-summary muted" title={error}>暂时无法读取项目摘要</span>;
  if (!data) return <span className="project-summary muted">正在读取简介与计划…</span>;
  const brief = (data.brief || "").replace(/<!--[\s\S]*?-->/g, "").replace(/^# .*$/m, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^[\s#>*-]+/gm, "").replace(/[*_`]/g, "").trim();
  const plans = parsePlans(data.plans || "").filter((plan) => plan.status === "active" || plan.status === "paused");
  return <span className="project-summary">
    <span className="project-brief">{brief || "暂无项目简介"}</span>
    <span className="project-plans-label">未完成计划{plans.length > 0 ? ` · ${plans.length}` : ""}</span>
    {plans.slice(0, 3).map((plan) => <span className="project-plan-row" key={plan.path}><span>{plan.title}</span><small>{plan.status === "paused" ? "已暂停" : "进行中"}</small></span>)}
    {!plans.length && <span className="muted">{data.plans === null ? "尚未建立计划登记表" : "暂无未完成计划"}</span>}
    {plans.length > 3 && <span className="muted">另有 {plans.length - 3} 项，打开项目查看</span>}
  </span>;
}
