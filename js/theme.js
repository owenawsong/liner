import { store } from './ui.js';

export const THEMES = [
  ['auto', 'Auto'],
  ['paper', 'Paper', '#F3EFE6', '#16110E', '#E8542E'],
  ['graphite', 'Graphite', '#0D0D0C', '#EDEDE7', '#FF6D40'],
  ['cobalt', 'Cobalt', '#F2F3F7', '#0B0D1B', '#2E3BFF'],
  ['midnight', 'Midnight', '#0A0E1A', '#E6EAF6', '#9CB0FF'],
  ['mono', 'Mono', '#FFFFFF', '#000000', '#000000'],
  ['riso', 'Riso', '#F6F2EE', '#1C2654', '#EE3A97'],
];

export const currentTheme = () => store.get('liner.theme') || 'auto';

export function setTheme(id) {
  store.set('liner.theme', id);
  const root = document.documentElement;
  if (id === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = id;
}

export function themeButtons() {
  const cur = currentTheme();
  return THEMES.map(([id, label, bg, ink, acc]) => `
    <button type="button" class="theme" role="radio" data-t="${id}" aria-checked="${cur === id}">
      <span class="theme__swatch${id === 'auto' ? ' theme__swatch--auto' : ''}" style="${bg ? `--tb:${bg};--ti:${ink};--ta:${acc}` : '--ti:#888;--ta:#E8542E'}"><i></i></span>
      ${label}
    </button>`).join('');
}
