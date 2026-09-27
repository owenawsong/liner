// Reads Spotify's "Download your data" export in the browser. Nothing is uploaded.

const HISTORY_FILE = /(Streaming_History_Audio|StreamingHistory_music|StreamingHistory\d*)[^/]*\.json$/i;
// ListenBrainz exports: listens as .jsonl (one per line) or a JSON array.
const LB_FILE = /(^|\/)(listens[^/]*\.json|[^/]*\.jsonl)$/i;
const wanted = (n) => HISTORY_FILE.test(n) || LB_FILE.test(n);

export async function readExport(files, onProgress = () => {}) {
  const chunks = [];
  const skipped = [];
  const all = [...files];
  for (let i = 0; i < all.length; i++) {
    const f = all[i];
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
      if (!window.JSZip) throw new Error("The ZIP reader didn't load. Check your connection and refresh the page.");
      let zip;
      try { zip = await window.JSZip.loadAsync(f); } catch { throw new Error(`"${f.name}" isn't a ZIP file Liner can open.`); }
      const names = Object.keys(zip.files).filter((n) => wanted(n) && !zip.files[n].dir);
      for (let j = 0; j < names.length; j++) {
        onProgress(`Reading ${names[j].split('/').pop()}`);
        chunks.push(parse(await zip.file(names[j]).async('string'), names[j]));
      }
      if (!names.length) skipped.push(f.name);
    } else if (/\.jsonl?$/i.test(f.name)) {
      onProgress(`Reading ${f.name}`);
      if (wanted(f.name)) chunks.push(parse(await f.text(), f.name));
      else skipped.push(f.name);
    } else {
      skipped.push(f.name);
    }
  }
  onProgress('Adding it all up');
  const rows = chunks.flat().filter((r) => !Number.isNaN(r.t));
  if (!rows.length) {
    throw new Error(skipped.length
      ? `No listening history in ${skipped.map((s) => `"${s}"`).join(', ')}. Drop the ZIP from Spotify's email, or the Streaming_History files inside it.`
      : 'No listening history in those files.');
  }
  rows.sort((a, b) => a.t - b.t);
  const music = rows.filter((r) => r.track);
  const lb = music.length && music.every((r) => r.src === 'listenbrainz');
  return {
    rows: music,
    kind: lb ? 'listenbrainz' : music.some((r) => r.skipped !== null) ? 'extended' : 'basic',
    podcasts: rows.length - music.length,
    extended: music.some((r) => r.skipped !== null),
    from: music[0]?.t,
    to: music[music.length - 1]?.t,
    added: Date.now(),
  };
}

function parse(text, name) {
  let data;
  try {
    data = /\.jsonl$/i.test(name)
      ? text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
      : JSON.parse(text);
  } catch { throw new Error(`"${name.split('/').pop()}" is damaged and couldn't be read.`); }
  if (data && !Array.isArray(data) && Array.isArray(data.listens)) data = data.listens;
  return Array.isArray(data) ? data.map(row).filter(Boolean) : [];
}

function platform(p) {
  if (!p) return null;
  const s = p.toLowerCase();
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'iOS';
  if (s.includes('android')) return 'Android';
  if (s.includes('windows')) return 'Windows';
  if (s.includes('os x') || s.includes('osx') || s.includes('macos') || s.includes('mac')) return 'Mac';
  if (s.includes('web')) return 'Web player';
  if (s.includes('linux')) return 'Linux';
  if (s.includes('cast') || s.includes('sonos') || s.includes('speaker') || s.includes('partner')) return 'Speaker';
  if (s.includes('tv') || s.includes('playstation') || s.includes('xbox')) return 'TV or console';
  return 'Other';
}

function row(r) {
  if (r && 'listened_at' in r) {
    const md = r.track_metadata || {};
    const t = typeof r.listened_at === 'number' ? r.listened_at * 1000 : Date.parse(r.listened_at);
    return { t, ms: null, track: md.track_name || null, artist: md.artist_name || null, album: md.release_name || '', skipped: null, shuffle: null, platform: null, src: 'listenbrainz' };
  }
  if ('ts' in r) {
    return {
      t: Date.parse(r.ts),
      ms: r.ms_played || 0,
      track: r.master_metadata_track_name || null,
      artist: r.master_metadata_album_artist_name || null,
      album: r.master_metadata_album_album_name || '',
      skipped: r.skipped === true || r.reason_end === 'fwdbtn',
      shuffle: typeof r.shuffle === 'boolean' ? r.shuffle : null,
      platform: platform(r.platform),
      src: 'export',
    };
  }
  if ('endTime' in r) {
    const end = Date.parse(`${r.endTime.replace(' ', 'T')}Z`);
    return { t: end - (r.msPlayed || 0), ms: r.msPlayed || 0, track: r.trackName || null, artist: r.artistName || null, album: '', skipped: null, shuffle: null, platform: null, src: 'export' };
  }
  return null;
}
