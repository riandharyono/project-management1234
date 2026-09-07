import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Avatar } from "./Avatar";

const ALLOWED = { ALLOWED_TAGS: ["b", "strong", "i", "em", "s", "strike", "u", "ul", "ol", "li", "br", "p", "div", "span", "font"], ALLOWED_ATTR: ["size", "style", "class", "data-user-id"] };
export const sanitizeNotesHtml = html => DOMPurify.sanitize(html || "", ALLOWED);

const TRACKED_COMMANDS = ["bold", "italic", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"];

function extractMentionIds(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return [...div.querySelectorAll("[data-user-id]")].map(el => el.getAttribute("data-user-id"));
}

export function RichTextEditor({ value, onSave, members = [], testId }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const savedRange = useRef(null);
  const [active, setActive] = useState({});
  const [query, setQuery] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

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
  const save = () => { const html = sanitizeNotesHtml(ref.current?.innerHTML || ""); onSave(html, extractMentionIds(html)); };

  const handleInput = () => {
    trackSelection();
    const sel = window.getSelection();
    const container = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (!members.length || !container || container.nodeType !== Node.TEXT_NODE || !ref.current?.contains(container)) { setQuery(null); return; }
    const offset = sel.getRangeAt(0).startOffset;
    const before = (container.textContent || "").slice(0, offset);
    const at = before.lastIndexOf("@");
    if (at === -1 || /\s/.test(before.slice(at + 1))) { setQuery(null); return; }
    setQuery(before.slice(at + 1));
    const rect = sel.getRangeAt(0).getClientRects()[0];
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (rect && wrapRect) setDropdownPos({ top: rect.bottom - wrapRect.top + 4, left: rect.left - wrapRect.left });
  };

  const insertMention = (m) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;
    const text = container.textContent || "";
    const at = text.slice(0, offset).lastIndexOf("@");
    if (at === -1) return;
    const delRange = document.createRange();
    delRange.setStart(container, at);
    delRange.setEnd(container, offset);
    sel.removeAllRanges();
    sel.addRange(delRange);
    ref.current?.focus();
    document.execCommand("delete", false, null);
    document.execCommand("insertHTML", false, `<span class="mention-tag" contenteditable="false" data-user-id="${m.id}">@${m.name}</span>&nbsp;`);
    setQuery(null);
    saveSelection();
    save();
  };

  const suggestions = query === null ? [] : members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div className="rte-wrap" ref={wrapRef}>
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
          onBlur={save} onInput={handleInput} onMouseUp={trackSelection} onKeyUp={handleInput} onFocus={updateActive} data-testid={testId} />
      </div>
      {suggestions.length > 0 && (
        <div className="mention-dropdown rte-mention-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }} data-testid={`${testId}-mention-dropdown`}>
          {suggestions.map(m => (
            <button type="button" key={m.id} onMouseDown={e => e.preventDefault()} onClick={() => insertMention(m)} data-testid={`${testId}-mention-option-${m.id}`}>
              <Avatar id={m.id} name={m.name} photo={m.avatar} />{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
