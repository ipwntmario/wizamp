import { orderTracks, trackTitle } from "../data/trackOrdering";
import { useMemo } from "react";

export default function TrackSelector({
  tracks,
  value,
  onChange,
  disabled,
  sortMode = "alpha-asc",
  dynamicFirst = true,
  hideTests = false,
  pinned,
  names,                           // NEW
}) {

  const titleFor = (name, t) =>
    trackTitle(name, t, names);

  const orderedNames = useMemo(() => orderTracks(tracks, {
    sortMode, dynamicFirst, hideTests, pinned, names,
  }), [tracks, sortMode, dynamicFirst, hideTests, pinned, names]);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={!!disabled}
      style={{ padding: "6px 10px", borderRadius: 8, background: "#222", color: "white", border: "1px solid #555" }}
    >
      <option value="" disabled>— choose a track —</option>
      {orderedNames.map((name) => {
        const t = tracks[name];
        const labels = [
          pinned?.has(name) && "pinned",
          t?.test && "test",
          t?.simple === false && "dynamic",
        ].filter(Boolean);
        const label = `${labels.length ? `[${labels.join(", ")}] ` : ""}${titleFor(name, t)}`;
        return (
          <option key={name} value={name}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
