import { useMemo } from "react";

export default function TrackSelector({
  tracks,
  value,
  onChange,
  sortMode = "alpha-asc",   // "alpha-asc" | "alpha-desc"
  dynamicFirst = true,
  hideTests = false,
  pinned,                   // Set<string>
}) {
  const isDynamic = (t) => t?.simple === false;
  const isTest = (name, t) => t?.test === true;

  const orderedNames = useMemo(() => {
    if (!tracks) return [];
    const entries = Object.entries(tracks);

    let filtered = hideTests ? entries.filter(([n,t]) => !isTest(n,t)) : entries.slice();

    const cmp = (a, b) => {
      const an = a[1]?.defaultDisplayName || a[0];
      const bn = b[1]?.defaultDisplayName || b[0];
      return an.localeCompare(bn);
    };
    if (sortMode === "alpha-asc") filtered.sort(cmp);
    else if (sortMode === "alpha-desc") filtered.sort((a,b) => -cmp(a,b));

    const pinnedDyn = [], pinnedSimple = [], unpinnedDyn = [], unpinnedSimple = [];
    for (const [name, t] of filtered) {
      const p = pinned?.has(name);
      const d = isDynamic(t);
      if (p && d) pinnedDyn.push(name);
      else if (p && !d) pinnedSimple.push(name);
      else if (!p && d) unpinnedDyn.push(name);
      else unpinnedSimple.push(name);
    }

    const unpinnedOrdered = dynamicFirst ? [...unpinnedDyn, ...unpinnedSimple]
                                         : [...unpinnedSimple, ...unpinnedDyn];
    const pinnedOrdered   = dynamicFirst ? [...pinnedDyn, ...pinnedSimple]
                                         : [...pinnedSimple, ...pinnedDyn];

    return [...pinnedOrdered, ...unpinnedOrdered];
  }, [tracks, sortMode, dynamicFirst, hideTests, pinned]);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ padding: "6px 10px", borderRadius: 8, background: "#222", color: "white", border: "1px solid #555" }}
    >
      <option value="" disabled>— choose a track —</option>
      {orderedNames.map((name) => {
        const t = tracks[name];
        const label =
          `${pinned?.has(name) ? "📌 " : ""}` +   // ← use 📌 here too
          `${isTest(name, t) ? "🚩 " : ""}` +
          `${isDynamic(t) ? "🔷 " : ""}` +
          `${t?.defaultDisplayName || name}`;
        return (
          <option key={name} value={name}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
