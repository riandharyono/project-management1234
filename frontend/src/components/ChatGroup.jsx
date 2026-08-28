import { useEffect, useRef, useState } from "react";
import { Users, Search, Paperclip, FileText, Download, Trash2, Eraser, ArrowDown } from "lucide-react";
import { client, chatTime, dayLabel, isSameDay, isImageFile, fileUrl, apiError } from "../lib/api";
import { Avatar } from "./Avatar";
import { MentionBox } from "./MentionBox";
import { MentionText } from "./MentionText";

const REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];
const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatGroup({ team, members, currentUser, myRole }) {
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showJump, setShowJump] = useState(false);
  const pressTimerRef = useRef(null);
  const attachRef = useRef(null);
  const bottomRef = useRef(null);
  const windowRef = useRef(null);
  const atBottomRef = useRef(true);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    closedRef.current = false;
    atBottomRef.current = true; setShowJump(false);
    client.get(`/teams/${team.id}/chat`).then(r => setMessages(m => {
      const serverIds = new Set(r.data.map(x => x.id));
      const localOnly = m.filter(x => !serverIds.has(x.id));
      return [...r.data, ...localOnly].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }));

    const connect = () => {
      if (closedRef.current || !process.env.REACT_APP_BACKEND_URL) return;
      const wsUrl = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + `/api/ws/chat/${team.id}`;
      const ws = new WebSocket(wsUrl);
      genRef.current += 1;
      ws.generation = genRef.current;
      wsRef.current = ws;
      ws.onopen = () => { retryRef.current = 0; setConnected(true); };
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "reaction") setMessages(m => m.map(msg => msg.id === data.message_id ? { ...msg, reactions: data.reactions } : msg));
        else if (data.type === "delete") setMessages(m => m.filter(msg => msg.id !== data.message_id));
        else if (data.type === "clear") setMessages([]);
        else setMessages(m => m.some(x => x.id === data.id) ? m : [...m, data]);
      };
      ws.onclose = () => {
        if (ws.generation !== genRef.current) return;
        setConnected(false);
        if (closedRef.current) return;
        const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closedRef.current = true; wsRef.current?.close(); };
  }, [team.id]);

  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      atBottomRef.current = nearBottom;
      if (nearBottom) setShowJump(false);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [team.id]);

  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    else setShowJump(true);
  }, [messages.length]);

  useEffect(() => {
    if (pickerFor === null) return;
    const close = () => setPickerFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [pickerFor]);

  const jumpToBottom = () => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setShowJump(false); };

  const toggleReactionPicker = id => setPickerFor(cur => cur === id ? null : id);
  const longPressFiredRef = useRef(false);
  const startPress = id => {
    longPressFiredRef.current = false;
    pressTimerRef.current = setTimeout(() => { longPressFiredRef.current = true; toggleReactionPicker(id); }, 450);
  };
  const cancelPress = () => { if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; } };
  const endPress = e => { if (longPressFiredRef.current) e.preventDefault(); cancelPress(); };

  const send = async (body, mentions) => { await client.post(`/teams/${team.id}/chat`, { body, mentions }); };
  const react = async (messageId, emoji) => {
    setPickerFor(null);
    const r = await client.post(`/chat/${messageId}/react`, { emoji });
    setMessages(m => m.map(msg => msg.id === messageId ? { ...msg, reactions: r.data.reactions } : msg));
  };
  const sendAttachment = async (file) => {
    if (!file) return;
    setUploading(true); setError("");
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await client.post(`/files/upload?team_id=${team.id}&kind=attachment`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      await client.post(`/teams/${team.id}/chat`, { body: "", mentions: [], attachment: { id: r.data.id, filename: r.data.filename, size: r.data.size } });
    } catch (e) { setError(apiError(e)); }
    setUploading(false);
  };
  const removeMessage = async id => {
    if (!window.confirm("Hapus pesan ini?")) return;
    setMessages(m => m.filter(msg => msg.id !== id));
    try { await client.delete(`/chat/${id}`); } catch (e) { setError(apiError(e)); }
  };
  const clearAll = async () => {
    if (!window.confirm("Hapus SEMUA pesan chat di tim ini? Tindakan ini tidak bisa dibatalkan.")) return;
    try { await client.delete(`/teams/${team.id}/chat`); setMessages([]); } catch (e) { setError(apiError(e)); }
  };
  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()));

  return (
    <div className="page chat-page">
      <div className="page-heading">
        <div><p className="eyebrow">CHAT GRUP</p><h1>{team.name}</h1><p className="muted">Diskusikan pekerjaan tim secara real-time.<span className={`ws-status ${connected ? "online" : "offline"}`} data-testid="chat-connection-status">{connected ? " • Terhubung" : " • Menyambungkan…"}</span></p></div>
        <div className="chat-heading-actions">
          {myRole === "admin" && (
            <button className="danger-link" onClick={clearAll} data-testid="clear-all-chat-button"><Eraser size={14} /> Kosongkan Chat</button>
          )}
          <button className="secondary" onClick={() => setMembersOpen(!membersOpen)} data-testid="chat-members-toggle"><Users size={14} /> Anggota ({members.length})</button>
        </div>
      </div>
      <div className="chat-layout">
        <div className="chat-main">
          <div className="chat-window-wrap">
            <div className="chat-window" ref={windowRef} data-testid="chat-window">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const grouped = prev && prev.author_id === m.author_id && isSameDay(prev.created_at, m.created_at) && (new Date(m.created_at) - new Date(prev.created_at)) < GROUP_GAP_MS;
                const showDateSep = !prev || !isSameDay(prev.created_at, m.created_at);
                const mine = m.author_id === currentUser.id;
                const author = members.find(x => x.id === m.author_id);
                return (
                  <div key={m.id} className="chat-msg-wrap">
                    {showDateSep && <div className="chat-date-sep" data-testid={`chat-date-${m.id}`}><span>{dayLabel(m.created_at)}</span></div>}
                    <div className={`chat-bubble ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`} data-testid={`chat-message-${m.id}`}>
                      <Avatar id={m.author_id} name={m.author} photo={author?.avatar} style={{ visibility: grouped ? "hidden" : "visible" }} />
                      <div className="chat-bubble-content"
                        onContextMenu={e => { e.preventDefault(); toggleReactionPicker(m.id); }}
                        onTouchStart={() => startPress(m.id)} onTouchEnd={endPress} onTouchMove={cancelPress}>
                        {!grouped && <div className="chat-bubble-head"><b>{m.author}</b></div>}
                        <div className="chat-bubble-surface">
                          {m.body && <p><MentionText body={m.body} mentionIds={m.mentions} members={members} /></p>}
                          {m.attachment && isImageFile(m.attachment.filename) ? (
                            <a className="chat-image-attachment" href={fileUrl(m.attachment.id)} target="_blank" rel="noreferrer" data-testid={`chat-attachment-${m.id}`}>
                              <img src={fileUrl(m.attachment.id)} alt={m.attachment.filename} loading="lazy" />
                            </a>
                          ) : m.attachment && (
                            <a className="chat-attachment" href={fileUrl(m.attachment.id)} target="_blank" rel="noreferrer" data-testid={`chat-attachment-${m.id}`}>
                              <FileText size={14} /><span>{m.attachment.filename}</span><Download size={13} />
                            </a>
                          )}
                          <div className="chat-bubble-meta"><small title={new Date(m.created_at).toLocaleString("id-ID")}>{chatTime(m.created_at)}</small></div>
                        </div>
                        {Object.entries(m.reactions || {}).some(([, users]) => users.length > 0) && (
                          <div className="chat-reactions" data-testid={`chat-reactions-${m.id}`}>
                            {Object.entries(m.reactions || {}).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
                              <button key={emoji} className={`reaction-pill ${users.includes(currentUser.id) ? "mine" : ""}`} onClick={() => react(m.id, emoji)} data-testid={`reaction-${m.id}-${emoji}`}>{emoji} {users.length}</button>
                            ))}
                          </div>
                        )}
                        {pickerFor === m.id && (
                          <div className="reaction-picker" data-testid={`reaction-picker-${m.id}`}>
                            {REACTIONS.map(e => <button key={e} onClick={() => react(m.id, e)} data-testid={`reaction-option-${m.id}-${e}`}>{e}</button>)}
                          </div>
                        )}
                        {(mine || myRole === "admin") && (
                          <button className="icon-button chat-delete-button" onClick={() => removeMessage(m.id)} data-testid={`delete-chat-message-${m.id}`}><Trash2 size={11} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!messages.length && <p className="muted">Belum ada percakapan. Mulai chat pertama!</p>}
              <div ref={bottomRef} />
            </div>
            {showJump && (
              <button className="chat-jump-button" onClick={jumpToBottom} data-testid="chat-jump-to-bottom"><ArrowDown size={14} /> Pesan baru</button>
            )}
          </div>
          {error && <div className="error">{error}</div>}
          <div className="chat-input-row">
            <input ref={attachRef} type="file" hidden onChange={e => sendAttachment(e.target.files[0])} data-testid="chat-attach-file-input" />
            <button type="button" className="icon-button chat-attach-button" onClick={() => attachRef.current.click()} disabled={uploading} data-testid="chat-attach-button"><Paperclip size={16} /></button>
            <MentionBox members={members} onSend={send} placeholder="Ketik pesan, gunakan @ untuk menandai anggota…" rows={1} testId="chat-input" />
          </div>
        </div>
        {membersOpen && <div className="chat-members-backdrop" onClick={() => setMembersOpen(false)} />}
        {membersOpen && (
          <aside className="chat-members-panel" data-testid="chat-members-panel">
            <div className="ts-search"><Search size={13} /><input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Cari anggota…" data-testid="chat-members-search" /></div>
            <div className="members-list">
              {filteredMembers.map(m => (
                <div className="member-row" key={m.id} data-testid={`chat-member-${m.id}`}>
                  <Avatar id={m.id} name={m.name} photo={m.avatar} />
                  <div><b>{m.name}</b><small>{m.email}</small></div>
                </div>
              ))}
              {!filteredMembers.length && <p className="muted" style={{ padding: "14px" }}>Tidak ditemukan.</p>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
