import { useEffect, useState } from "react";

export function useMusicData() {
  const [tracks, setTracks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/trackData.json');
        if (!response.ok) throw new Error(`Could not load track catalog (${response.status})`);
        const t = await response.json();
        if (!alive) return;
        setTracks(t.tracks || {});
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { tracks, loading, error };
}
