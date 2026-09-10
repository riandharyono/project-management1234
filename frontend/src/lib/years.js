export function currentYear() {
  return new Date().getFullYear();
}

export function teamYear(team) {
  const y = Number(team?.year);
  if (Number.isInteger(y) && y >= 2000 && y <= 2100) return y;
  const fromCreated = parseInt(String(team?.created_at || "").slice(0, 4), 10);
  if (fromCreated >= 2000 && fromCreated <= 2100) return fromCreated;
  return currentYear();
}

export function groupTeamsByYear(teams) {
  const map = new Map();
  for (const t of teams || []) {
    const y = teamYear(t);
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(t);
  }
  const thisYear = currentYear();
  return [...map.entries()].sort((a, b) => {
    const bucket = y => (y === thisYear ? 0 : y > thisYear ? 1 : 2);
    const d = bucket(a[0]) - bucket(b[0]);
    return d !== 0 ? d : b[0] - a[0];
  });
}

export function yearChoices(...extras) {
  const y = currentYear();
  const set = new Set([y - 2, y - 1, y, y + 1]);
  for (const extra of extras.flat()) {
    if (extra == null || extra === "") continue;
    if (typeof extra === "object") {
      set.add(teamYear(extra));
      continue;
    }
    const n = Number(extra);
    if (Number.isInteger(n) && n >= 2000 && n <= 2100) set.add(n);
  }
  return [...set].sort((a, b) => b - a);
}

export function isCurrentOrUpcomingYear(year) {
  return Number(year) >= currentYear();
}
