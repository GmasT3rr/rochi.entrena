// Antes del primer render. Esta clave solo contiene una preferencia visual.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('tuscuentasfacil.apariencia.v1');
    if (['light', 'dark', 'system'].includes(saved)) preference = saved;
  } catch {
    /* Aplicar el tema del sistema aunque no se permita guardar preferencias. */
  }
  const dark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme =
    preference === 'system' ? (dark ? 'dark' : 'light') : preference;
})();
