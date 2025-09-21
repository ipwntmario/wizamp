import { useMemo } from "react";

export default function TrackSelector({
  tracks,
  value,
  onChange,
  sortMode = "alpha-asc",
  dynamicFirst = true,
  hideTests = false,
  pinned,
  names,                           // NEW
}) {
  const isDynamic = (t) => t?.simple === false;
  const isTest = (name, t) => t?.test === true;

  const titleFor = (name, t) =>
    names?.tracks?.[name]?.displayName ?? t?.defaultDisplayName ?? name;

  const orderedNames = useMemo(() => {
    if (!tracks) return [];
    const entries = Object.entries(tracks);

    // Hide tests except when pinned
    let filtered = entries.filter(([n,t]) =>
      hideTests ? (!isTest(n,t) || pinned?.has(n)) : true
    );

    // Sort comparator uses effective title
    const cmp = (a, b) => {
      const an = titleFor(a[0], a[1]);
      const bn = titleFor(b[0], b[1]);
      return an.localeCompare(bn);
    };
    if (sortMode === "alpha-asc") filtered.sort(cmp);
    else if (sortMode === "alpha-desc") filtered.sort((a,b) => -cmp(a,b));

    // Groups
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
  }, [tracks, sortMode, dynamicFirst, hideTests, pinned, names]);

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
          `${pinned?.has(name) ? "📌 " : ""}` +
          `${t?.test ? "🧪 " : ""}` +
          `${t?.simple === false ? "🔷 " : ""}` +
          `${titleFor(name, t)}`;
        return (
          <option key={name} value={name}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
