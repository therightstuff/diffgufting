export function applyTheme(nativeTheme, theme) {
  if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
  // Electron updates shouldUseDarkColors asynchronously after a forced theme
  // change. The selected non-system preference is already authoritative.
  return theme === 'system' ? nativeTheme.shouldUseDarkColors ? 'dark' : 'light' : theme;
}

export function subscribeToAppearance(nativeTheme, selectedTheme, publish) {
  const updated = () => {
    if (selectedTheme() === 'system') publish(nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  };
  nativeTheme.on('updated', updated);
  return () => nativeTheme.off('updated', updated);
}
