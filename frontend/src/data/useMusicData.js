import { useEffect, useState } from "react";

export function useMusicData() {
  const [clips, setClips] = useState({});
  const [sections, setSections] = useState({});
  const [tracks, setTracks] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, s, t] = await Promise.all([
          fetch("clipData.json").then(r => r.json()).catch(() => ({ clips: {} })),
          fetch("sectionData.json").then(r => r.json()).catch(() => ({ sections: {} })),
          fetch("trackData.json").then(r => r.json()).catch(() => ({ tracks: {} })),
        ]);
        if (!alive) return;
        setClips(c.clips || {});
        setSections(s.sections || {});
        setTracks(t.tracks || {});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { clips, sections, tracks, loading };
}
