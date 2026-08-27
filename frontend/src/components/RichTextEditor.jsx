import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

const ALLOWED = { ALLOWED_TAGS: ["b", "strong", "i", "em", "s", "strike", "u", "ul", "ol", "li", "br", "p", "div", "span", "font"], ALLOWED_ATTR: ["size", "style"] };
export const sanitizeNotesHtml = html => DOMPurify.sanitize(html || "", ALLOWED);

const TRACKED_COMMANDS = ["bold", "italic", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"];

export function RichTextEditor({ value, onSave, testId }) {
  const ref = useRef(null);
  const savedRange = useRef(null);
  const [active, setActive] = useState({});

  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitizeNotesHtml(value); }, []); // eslint-disable-line

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current && ref.current.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  };
  const updateActive = () => {
    const next = {};
    TRACKED_COMMANDS.forEach(cmd => { try { next[cmd] = document.queryCommandState(cmd); } catch (e) { next[cmd] = false; } });
    setActive(next);
  };
  const trackSelection = () => { saveSelection(); updateActive(); };
  const exec = (cmd, arg) => { ref.current?.focus(); restoreSelection(); document.execCommand(cmd, false, arg); saveSelection(); updateActive(); };
  const save = () => onSave(sanitizeNotesHtml(ref.current?.innerHTML || ""));

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className={active.bold ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("bold")} data-testid={`${testId}-bold`}><Bold size={13} /></button>
        <button type="button" className={active.italic ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("italic")} data-testid={`${testId}-italic`}><Italic size={13} /></button>
        <button type="button" className={active.strikeThrough ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("strikeThrough")} data-testid={`${testId}-strike`}><Strikethrough size={13} /></button>
        <span className="rte-sep" />
        <button type="button" className={active.insertUnorderedList ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("insertUnorderedList")} data-testid={`${testId}-ul`}><List size={13} /></button>
        <button type="button" className={active.insertOrderedList ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("insertOrderedList")} data-testid={`${testId}-ol`}><ListOrdered size={13} /></button>
        <span className="rte-sep" />
        <button type="button" className={active.justifyLeft ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyLeft")} data-testid={`${testId}-align-left`}><AlignLeft size={13} /></button>
        <button type="button" className={active.justifyCenter ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyCenter")} data-testid={`${testId}-align-center`}><AlignCenter size={13} /></button>
        <button type="button" className={active.justifyRight ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => exec("justifyRight")} data-testid={`${testId}-align-right`}><AlignRight size={13} /></button>
        <span className="rte-sep" />
        <select onMouseDown={saveSelection} onChange={e => { exec("fontSize", e.target.value); e.target.value = ""; }} data-testid={`${testId}-fontsize`} defaultValue="">
          <option value="" disabled>Ukuran</option>
          <option value="2">Kecil</option>
          <option value="3">Normal</option>
          <option value="5">Besar</option>
        </select>
      </div>
      <div ref={ref} className="rte-editor" contentEditable suppressContentEditableWarning
        onBlur={save} onMouseUp={trackSelection} onKeyUp={trackSelection} onFocus={updateActive} data-testid={testId} />
    </div>
  );
}
