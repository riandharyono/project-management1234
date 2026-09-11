import { client } from "./api";

export async function createTaskFromDataRequest({ teamId, item, itemId, dueDate, assignees }) {
  const lists = (await client.get(`/teams/${teamId}/lists`)).data || [];
  const first = lists
    .filter(l => !l.archived && !l.is_done && !l.is_cancelled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  if (!first) throw new Error("Tim belum punya kolom tugas");
  const name = (item?.name || "").trim() || "Tugas data";
  const title = item?.doc_year ? `${name} · ${item.doc_year}` : name;
  const r = await client.post(`/teams/${teamId}/tasks`, {
    title,
    list_id: first.id,
    due_date: dueDate || undefined,
    data_request_ids: [itemId || item.id],
    assignees: assignees || [],
  });
  return r.data;
}
