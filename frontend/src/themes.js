export const THEMES = [
  { id: "dark", name: "Dark", group: "Standard" },
  { id: "light", name: "Light", group: "Standard" },
  { id: "signet", name: "Signet", group: "Fantasy" },
  { id: "castle-torchlit", name: "Castle (Torchlit)", group: "Fantasy" },
];

export const SESSION_THEME_DEFAULTS = {
  private: "dark",
  awc: "signet",
};

export function themeSessionKey(roomId) {
  return roomId || "private";
}

export function availableThemes() {
  return THEMES;
}

export function resolveTheme(roomId, requestedThemeId) {
  const choices = availableThemes();
  const normalizedThemeId = {
    book1: "signet",
    hogwarts: "castle-torchlit",
    "four-houses": "castle-torchlit",
  }[requestedThemeId] || requestedThemeId;
  return choices.find((theme) => theme.id === normalizedThemeId)
    || choices.find((theme) => theme.id === SESSION_THEME_DEFAULTS[themeSessionKey(roomId)])
    || choices[0];
}

export function themeStorageKey(roomId) {
  return `wizamp.theme.${themeSessionKey(roomId)}`;
}
