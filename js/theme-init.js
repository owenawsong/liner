// Run before the first paint without requiring an inline script.
(() => {
  let theme = 'auto';
  try { theme = localStorage.getItem('liner.theme') || 'auto'; } catch {}
  if (['paper', 'graphite', 'cobalt', 'midnight', 'mono', 'riso'].includes(theme)) document.documentElement.setAttribute('data-theme', theme);
})();
