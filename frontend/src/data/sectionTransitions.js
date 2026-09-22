function nextSectionNames(section) {
  const next = section?.nextSection;
  return Array.isArray(next) ? next : (next ? [next] : []);
}

export function getAutoLockedTargets(section) {
  return section?.type === "auto" ? nextSectionNames(section) : [];
}

export function findSelectableEndSection(sections, currentSectionName) {
  const current = sections[currentSectionName];
  const locked = getAutoLockedTargets(current);
  return nextSectionNames(current).find(name =>
    sections[name]?.type === "end" && !locked.includes(name)) ?? null;
}
