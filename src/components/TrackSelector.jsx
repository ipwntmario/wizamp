// src/components/TrackSelector.jsx
import { useMemo } from "react";

export default function TrackSelector({
  tracks,
  value,
  onChange,
  // new optional props
  sortMode = "alpha-asc",     // "alpha-asc" | "alpha-desc" | "original"
  dynamicFirst = true,
  hideTests = false,
}) {
  const isDynamic = (t) => t?.simple === false;
  const isTest = (name, t) => t?.test === true;

  const orderedNames = useMemo(() => {
    if (!tracks) return [];
    const entries = Object.entries(tracks);

    const testEntries = entries.filter(([n, t]) => isTest(n, t));
    const nonTestEntries = entries.filter(([n, t]) => !isTest(n, t));

    const testBlock = hideTests ? [] : testEntries.map(([n]) => n);

    let working = [...nonTestEntries];
    if (sortMode === "alpha-asc" || sortMode === "alpha-desc") {
      const cmp = (a, b) => {
        const an = a[1]?.defaultDisplayName || a[0];
        const bn = b[1]?.defaultDisplayName || b[0];
        return an.localeCompare(bn);
      };
      working.sort(cmp);
      if (sortMode === "alpha-desc") working.reverse();
      if (dynamicFirst) {
        const dyn = working.filter(([_, t]) => isDynamic(t)).map(([n]) => n);
        const simple = working.filter(([_, t]) => !isDynamic(t)).map(([n]) => n);
        return [...testBlock, ...dyn, ...simple];
      }
      return [...testBlock, ...working.map(([n]) => n)];
    }

    // original
    return [...testBlock, ...working.map(([n]) => n)];
  }, [tracks, sortMode, dynamicFirst, hideTests]);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ padding: "6px 10px", borderRadius: 8, background: "#222", color: "white", border: "1px solid #555" }}
    >
      <option value="" disabled>— choose a track —</option>
      {orderedNames.map((name) => {
        const t = tracks[name];
        const labelBase = t?.defaultDisplayName || name;
        const prefix = `${isTest(name, t) ? "🧪 " : ""}${isDynamic(t) ? "🔷 " : ""}`;
        return (
          <option key={name} value={name}>
            {prefix}{labelBase}
          </option>
        );
      })}
    </select>
  );
}
