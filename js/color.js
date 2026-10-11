// Pull a usable sleeve colour out of a piece of album art.
// Draws the image tiny, buckets the pixels, and picks the most present vivid colour.
const cache = new Map();

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = (x) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255];
}

export function palette(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 28;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 28, 28);
        const d = g.getImageData(0, 0, 28, 28).data;
        const buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const rgb = [d[i], d[i + 1], d[i + 2]];
          const [, s, l] = rgbToHsl(rgb);
          const key = (rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4);
          const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, score: 0 };
          b.n++; b.r += rgb[0]; b.g += rgb[1]; b.b += rgb[2];
          // Favour colourful, mid-light pixels; near-black and near-white count for little.
          b.score += 0.15 + s * (1 - Math.abs(l - 0.5) * 1.6);
          buckets.set(key, b);
        }
        const best = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
        let rgb = [best.r / best.n, best.g / best.n, best.b / best.n];
        let [h, s, l] = rgbToHsl(rgb);
        // Keep it rich enough to be a sleeve: not muddy, not blown out.
        if (s < 0.14) {
          // Black-and-white art: a clean paper grey instead of a muddy tint.
          s = 0.06; l = l > 0.45 ? 0.8 : 0.2;
        } else {
          s = Math.min(0.9, Math.max(s, 0.3));
          l = Math.min(0.62, Math.max(l, 0.3));
        }
        rgb = hslToRgb([h, s, l]);
        const dark = lum(rgb) > 0.3;
        resolve({
          bg: hex(rgb),
          ink: dark ? '#15110D' : '#F7F3EA',
          soft: hex(hslToRgb([h, Math.min(1, s + 0.05), dark ? l - 0.14 : l + 0.16])),
          dark,
        });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

// Apply a palette to an element as CSS variables.
export function paint(el, pal) {
  if (!el || !pal) return;
  el.style.setProperty('--sl-bg', pal.bg);
  el.style.setProperty('--sl-ink', pal.ink);
  el.style.setProperty('--sl-soft', pal.soft);
  el.classList.add('is-painted');
}
