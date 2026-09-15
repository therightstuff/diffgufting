export function applyTheme(nativeTheme, theme) {
  if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

export function subscribeToAppearance(nativeTheme, selectedTheme, publish) {
  const updated = () => {
    if (selectedTheme() === 'system') publish(nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  };
  nativeTheme.on('updated', updated);
  return () => nativeTheme.off('updated', updated);
}
