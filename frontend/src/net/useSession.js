import { useEffect, useState } from 'react';

function read(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function normalizeRole(role) {
  switch (String(role).toLowerCase()) {
    case 'passive_bts': case 'passive-bts': return 'PASSIVE_BTS';
    case 'passive': case 'player': return 'PASSIVE';
    default: return 'GM';
  }
}

export function useSession() {
  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('room') ? params.get('room') : read('ui.roomChoice', 'awc') === 'private' ? '' : 'awc';
  });
  const [role, setRole] = useState(() => normalizeRole(read('wizamp.role', read('wizamp_role', 'GM'))));
  const [displayName, setDisplayName] = useState(() => read('wizamp.displayName', read('wizamp_displayName', '')));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set('room', roomId);
    else url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    try { localStorage.setItem('ui.roomChoice', roomId ? 'awc' : 'private'); } catch { /* Storage may be disabled. */ }
  }, [roomId]);
  useEffect(() => {
    try {
      localStorage.setItem('wizamp.role', role);
      localStorage.setItem('wizamp.displayName', displayName);
    } catch { /* Storage may be disabled. */ }
  }, [role, displayName]);
  return { roomId, setRoomId, onlineEnabled: !!roomId, role, setRole, displayName, setDisplayName };
}
