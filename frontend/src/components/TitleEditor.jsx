import { useEffect, useRef } from "react";
import { TITLE_COLORS, TITLE_SIZES, sanitizeTitleHtml, titleDisplayHtml, titleToPlain } from "../lib/titleStyle";

export function TitleEditor({ value, html, onSave, testId }) {
  const ref = useRef(null);
  const savedRange = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const next = sanitizeTitleHtml(html || value || "");
    if (ref.current.innerHTML !== next) ref.current.innerHTML = next;
  }, [html, value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  };
  const selectAllIfCollapsed = () => {
    const sel = window.getSelection();
    if (!sel || !ref.current) return;
    if (!sel.rangeCount || sel.isCollapsed) {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  const exec = (cmd, arg) => {
    ref.current?.focus();
    restoreSelection();
    selectAllIfCollapsed();
    document.execCommand(cmd, false, arg);
    saveSelection();
  };
  const save = () => {
    const raw = sanitizeTitleHtml(ref.current?.innerHTML || "");
    const plain = titleToPlain(raw) || titleToPlain(value);
    if (!plain) return;
    onSave({ title: plain, title_html: raw === plain ? "" : raw });
  };

  return (
    <div className="td-title-wrap">
      <div
        ref={ref}
        className="td-title-input td-title-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        data-testid={testId}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ref.current?.blur(); } }}
        onBlur={save}
      />
      <div className="td-title-style" data-testid="task-title-style">
        <span className="td-title-hint">Pilih kata, lalu warna atau ukuran</span>
        {TITLE_COLORS.map(c => (
          <button
            key={c.key}
            type="button"
            className="td-title-swatch"
            style={{ background: c.value || "var(--ink)" }}
            title={c.label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec("foreColor", c.value || "#1a1d26")}
            data-testid={`task-title-color-${c.key}`}
          />
        ))}
        <span className="td-title-style-sep" />
        {TITLE_SIZES.map(s => (
          <button
            key={s.key}
            type="button"
            className="td-title-size"
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec("fontSize", s.key)}
            data-testid={`task-title-size-${s.key === "2" ? "sm" : s.key === "5" ? "lg" : "md"}`}
          >{s.label}</button>
        ))}
      </div>
    </div>
  );
}

export function TitleHtml({ task, className }) {
  const html = titleDisplayHtml(task);
  if (html) {
    return <span className={`task-title-html ${className || ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className={className}>{task?.title}</span>;
}
