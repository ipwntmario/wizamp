export function trackTitle(name, track, names) {
  return names?.tracks?.[name]?.displayName ?? track?.defaultDisplayName ?? name;
}

export function orderTracks(tracks, { sortMode, dynamicFirst, hideTests, pinned, names }) {
  return Object.entries(tracks || {})
    .filter(([name, track]) => !hideTests || !track.test || pinned?.has(name))
    .sort(([a, ta], [b, tb]) => {
      const pinOrder = Number(!!pinned?.has(b)) - Number(!!pinned?.has(a));
      const dynamicOrder = Number(tb.simple === false) - Number(ta.simple === false);
      return pinOrder || (dynamicFirst ? dynamicOrder : -dynamicOrder)
        || trackTitle(a, ta, names).localeCompare(trackTitle(b, tb, names)) * (sortMode === 'alpha-desc' ? -1 : 1);
    }).map(([name]) => name);
}
