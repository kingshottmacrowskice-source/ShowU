import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { desktop } from "../api";
import { type Launcher } from "../domain";

export function LauncherEditor({
  config,
  onChange,
  disabled,
}: {
  config: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [selected, select] = useState(0);
  const [notice, setNotice] = useState("");
  let items: Launcher[] | undefined;
  try {
    items = JSON.parse(config);
    if (
      !Array.isArray(items) ||
      !items.every(
        (l) =>
          l &&
          typeof l.name === "string" &&
          Array.isArray(l.commands) &&
          l.commands.every(
            (c: Launcher["commands"][number]) =>
              c && typeof c.program === "string",
          ),
      )
    )
      items = undefined;
  } catch {
    items = undefined;
  }
  const index = Math.min(selected, (items?.length || 1) - 1);
  const current = items?.[index];
  function save(list: Launcher[]) {
    onChange(JSON.stringify(list, null, 2));
  }
  function update(value: Launcher) {
    if (items) save(items.map((l, i) => (i === index ? value : l)));
  }
  function addFiles(paths: string[]) {
    if (disabled || !items) return;
    const commands = paths
      .filter((p) => /\.(exe|lnk)$/i.test(p))
      .map((program) => ({ program, args: [] }));
    setNotice(
      commands.length === paths.length
        ? ""
        : "仅支持 .exe 和 .lnk，其他文件已跳过。",
    );
    if (!commands.length) return;
    if (current)
      update({ ...current, commands: [...current.commands, ...commands] });
    else
      save([
        {
          name: commands[0].program
            .split(/[\\/]/)
            .pop()!
            .replace(/\.[^.]+$/, ""),
          commands,
        },
      ]);
  }
  const drop = useRef(addFiles);
  drop.current = addFiles;
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    const listener = getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (!active || payload.type !== "drop") return;
        drop.current(payload.paths);
      })
      .catch((e) => {
        if (active) setNotice(String(e));
      });
    return () => {
      active = false;
      void listener.then((stop) => stop?.());
    };
  }, []);
  const dragged = useRef<number | null>(null);
  if (!items) return <p>请在高级配置中修正 JSON。</p>;
  function move(from: number, to: number) {
    if (!current || from === to || to < 0 || to >= current.commands.length)
      return;
    const commands = [...current.commands];
    commands.splice(to, 0, commands.splice(from, 1)[0]);
    update({ ...current, commands });
  }
  return (
    <fieldset disabled={disabled} className="launch-editor">
      <div>
        {items.length > 0 && (
          <select
            aria-label="选择启动器"
            value={index}
            onChange={(e) => select(+e.target.value)}
          >
            {items.map((l, i) => (
              <option value={i} key={i}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <button
          className="button"
          onClick={() => {
            const empty = items.findIndex((l) => l.commands.length === 0);
            if (empty >= 0) {
              select(empty);
              setNotice("请先为这个启动器添加文件。");
              return;
            }
            select(items.length);
            save([...items, { name: "新启动器", commands: [] }]);
          }}
        >
          新增启动器
        </button>
      </div>
      {current && (
        <div>
          {!current.commands.length && (
            <button
              className="button"
              onClick={() => {
                save(items.filter((_, i) => i !== index));
                setNotice("");
              }}
            >
              移除空启动器
            </button>
          )}
          <label>
            名称{" "}
            <input
              value={current.name}
              onChange={(e) => update({ ...current, name: e.target.value })}
            />
          </label>
          <select
            aria-label="启动模式"
            value={current.sequential ? "sequence" : "parallel"}
            onChange={(e) =>
              update({ ...current, sequential: e.target.value === "sequence" })
            }
          >
            <option value="parallel">并行启动</option>
            <option value="sequence">按顺序启动</option>
          </select>
        </div>
      )}
      <div className="launch-drop">
        将 .exe 或 .lnk 文件拖入此窗口，添加到当前启动器
      </div>
      {notice && <p role="status">{notice}</p>}
      {current?.commands.map((c, i) => (
        <div className="launch-step" key={i} data-step={i}>
          <button
            className="button grip"
            aria-label="拖拽排序"
            onPointerDown={(e) => {
              dragged.current = i;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              dragged.current = null;
            }}
            onPointerUp={(e) => {
              const row = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest("[data-step]");
              if (row && dragged.current !== null)
                move(dragged.current, Number(row.getAttribute("data-step")));
              dragged.current = null;
            }}
          >
            ⠿
          </button>
          <span title={c.program}>
            {i + 1}. {c.program}
          </span>
          {current.sequential && i > 0 && (
            <label>
              间隔（秒）
              <input
                type="number"
                min="0"
                step="1"
                value={c.delaySeconds ?? 0}
                onChange={(e) =>
                  update({
                    ...current,
                    commands: current.commands.map((v, j) =>
                      i === j
                        ? {
                            ...v,
                            delaySeconds: Math.max(
                              0,
                              Math.floor(+e.target.value),
                            ),
                          }
                        : v,
                    ),
                  })
                }
              />
            </label>
          )}
          <button
            className="button"
            onClick={() =>
              update({
                ...current,
                commands: current.commands.filter((_, j) => j !== i),
              })
            }
          >
            移除
          </button>
        </div>
      ))}
    </fieldset>
  );
}
