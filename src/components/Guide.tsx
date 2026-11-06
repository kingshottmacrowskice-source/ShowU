import { ShieldCheck, ChevronRight } from "lucide-react";
export function Guide() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SHARED WAY OF WORKING</div>
          <h1>把上下文留给下一次协作</h1>
          <p>先读当前目标和相关模块，从代码入口定位；历史按需追溯，保留依据。</p>
        </div>
        <ShieldCheck size={28} />
      </div>
      <div className="guide-flow">
        <span>读项目目的与代码</span>
        <ChevronRight size={18} />
        <span>比对模块需求</span>
        <ChevronRight size={18} />
        <span>创建计划</span>
        <ChevronRight size={18} />
        <span>执行与更新</span>
      </div>
      {[
        [
          "S1",
          "完成状态更新",
          "完成任务后，及时更新复选框、计划状态和实际验证证据。记录设计变化的原因，以及下次应从哪里继续。未验证不能写成通过。",
        ],
        [
          "S2",
          "计划创建",
          "先读项目简介、现有计划和相关代码，再调用 S3 检查需求。没有冲突后，建立计划任务文件并登记索引。实现建议与用户需求分开记录。",
        ],
        [
          "S3",
          "需求记录",
          "按模块比对并记录能力点、诉求及来源。只有同模块、同能力点、诉求相斥同时成立才算冲突。发现冲突立即停止受影响开发，交用户裁决；不删除旧需求。",
        ],
      ].map(([id, title, text]) => (
        <section className="card guide-card" key={id}>
          <span className="skill-id">{id}</span>
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </section>
      ))}
      <section className="card settings-card">
        <h2>让 AI 实际读到这些规范</h2>
        <p>
          项目随附
          skills/showu-update-status、showu-create-plan、showu-record-requirements。将这些技能文件加入所用
          AI 工具支持的技能目录，并在项目指令入口引用 .showu 文件的读取顺序。
        </p>
        <p className="muted">
          仅创建管理文件并不能保证每种 AI 工具自动遵守。完整格式见
          docs/protocol.md；本项目的 AGENTS.md
          提供了接续开发入口。跨工具聊天迁移属于未来范围。
        </p>
      </section>
    </>
  );
}
