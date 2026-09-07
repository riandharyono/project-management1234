import { useRef, useState } from "react";
import { Avatar } from "./Avatar";

// Plain-textarea counterpart to MentionBox: same "@" autocomplete behavior,
// but as a controlled field usable inside a larger form instead of an
// isolated compose-and-send widget.
export function MentionTextarea({ value, onChange, members, placeholder, rows = 3, testId, autoFocus }) {
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState(null);
  const ref = useRef(null);

  const mentionIds = (text, tagList) => tagList.filter(t => text.includes(`@${t.name}`)).map(t => t.id);

  const handleChange = e => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const at = before.lastIndexOf("@");
    if (at > -1 && !/\s/.test(before.slice(at + 1))) setQuery(before.slice(at + 1));
    else setQuery(null);
    onChange(val, mentionIds(val, tags));
  };

  const pick = m => {
    const pos = ref.current.selectionStart;
    const before = value.slice(0, pos);
    const at = before.lastIndexOf("@");
    const newVal = value.slice(0, at) + "@" + m.name + " " + value.slice(pos);
    const nextTags = [...tags.filter(x => x.id !== m.id), { id: m.id, name: m.name }];
    setTags(nextTags);
    setQuery(null);
    onChange(newVal, mentionIds(newVal, nextTags));
    setTimeout(() => { ref.current.focus(); const cp = at + m.name.length + 2; ref.current.setSelectionRange(cp, cp); }, 0);
  };

  const suggestions = query === null ? [] : members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div className="mention-box mention-textarea-wrap">
      {suggestions.length > 0 && (
        <div className="mention-dropdown" data-testid={`${testId}-dropdown`}>
          {suggestions.map(m => (
            <button type="button" key={m.id} onClick={() => pick(m)} data-testid={`${testId}-mention-option-${m.id}`}>
              <Avatar id={m.id} name={m.name} photo={m.avatar} />{m.name}
            </button>
          ))}
        </div>
      )}
      <textarea ref={ref} rows={rows} value={value} onChange={handleChange} placeholder={placeholder} data-testid={testId} autoFocus={autoFocus} />
    </div>
  );
}
