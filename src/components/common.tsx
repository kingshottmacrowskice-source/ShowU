import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { labels } from "../domain";
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status] || status}
    </span>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function RenderMarkdown({
  content,
  navigate,
}: {
  content: string;
  navigate?: (path: string) => void;
}) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href && !/^(https?:|mailto:|\/|#)/.test(href) && navigate ? (
              <button className="text-link" onClick={() => navigate(href)}>
                {children}
              </button>
            ) : (
              <span title={href}>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="muted">[图片：{alt || "未加载"}]</span>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
