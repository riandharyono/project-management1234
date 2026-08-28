import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Avatar } from "./Avatar";

export function MentionBox({ members, onSend, placeholder, rows = 2, testId }) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [text]);

  const handleChange = e => {
    const val = e.target.value;
    setText(val);
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const at = before.lastIndexOf("@");
    if (at > -1 && !/\s/.test(before.slice(at + 1))) setQuery(before.slice(at + 1));
    else setQuery(null);
  };

  const pick = m => {
    const pos = ref.current.selectionStart;
    const before = text.slice(0, pos);
    const at = before.lastIndexOf("@");
    const newVal = text.slice(0, at) + "@" + m.name + " " + text.slice(pos);
    setText(newVal);
    setTags(t => [...t.filter(x => x.id !== m.id), { id: m.id, name: m.name }]);
    setQuery(null);
    setTimeout(() => { ref.current.focus(); const cp = at + m.name.length + 2; ref.current.setSelectionRange(cp, cp); }, 0);
  };

  const send = () => {
    if (!text.trim()) return;
    const mentions = tags.filter(t => text.includes(`@${t.name}`)).map(t => t.id);
    onSend(text.trim(), mentions);
    setText(""); setTags([]); setQuery(null);
  };

  const suggestions = query === null ? [] : members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div className="mention-box">
      {suggestions.length > 0 && (
        <div className="mention-dropdown" data-testid="mention-dropdown">
          {suggestions.map(m => (
            <button type="button" key={m.id} onClick={() => pick(m)} data-testid={`mention-option-${m.id}`}>
              <Avatar id={m.id} name={m.name} photo={m.avatar} />{m.name}
            </button>
          ))}
        </div>
      )}
      <textarea ref={ref} rows={rows} value={text} onChange={handleChange}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={placeholder} data-testid={testId} />
      <button type="button" className="primary" onClick={send} data-testid={`${testId}-send`}><Send size={14} /></button>
    </div>
  );
}
