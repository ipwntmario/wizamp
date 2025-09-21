// src/net/netController.js
const ONLINE_ENV = (import.meta.env?.VITE_ONLINE_MODE === 'true');
let onlineEnabled = false; // runtime toggle from Settings

export function setOnlineEnabledRuntime(on) {
  onlineEnabled = !!on;
}

export const net = {
  playSection: (sectionName) => { if (!(ONLINE_ENV && onlineEnabled)) return; /* send later */ },
  queueSection: (sectionNameOrNull) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
  clearQueuedSection: () => { if (!(ONLINE_ENV && onlineEnabled)) return; },

  queueMode: (modeNameOrNull) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
  clearQueuedMode: () => { if (!(ONLINE_ENV && onlineEnabled)) return; },

  stop: (withFade = true) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
  pause: (simpleTrack = true) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
  resume: (simpleTrack = true) => { if (!(ONLINE_ENV && onlineEnabled)) return; },

  setTrack: (trackName) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
  setTrackVolume: (trackName, volume) => { if (!(ONLINE_ENV && onlineEnabled)) return; },
};

export const ONLINE = ONLINE_ENV;
