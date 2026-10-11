import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readExport } from '../js/export.js';
import { analyze } from '../js/analysis.js';

globalThis.window = { JSZip };
globalThis.fetch = () => { throw new Error('Listening imports must stay local.'); };
const jsonFile = (rows, name = 'Streaming_History_Audio_test.json') => ({ name, type: 'application/json', text: async () => JSON.stringify(rows) });
const play = (ts, extra = {}) => ({ ts, ms_played: 180000, master_metadata_track_name: 'Synthetic track', master_metadata_album_artist_name: 'Release QA Alpha', master_metadata_album_album_name: 'Synthetic album', skipped: false, platform: 'windows', ...extra });
async function archive(entries) {
  const zip = new JSZip();
  for (const [name, rows] of Object.entries(entries)) zip.file(name, JSON.stringify(rows));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  buffer.name = 'sleeve-synthetic-history.zip'; buffer.type = 'application/zip';
  return buffer;
}

test('a local ZIP imports twelve months, deduplicates music and separates skips from podcasts', async () => {
  const rows = Array.from({ length: 48 }, (_, i) => play(new Date(Date.UTC(2025, 9 + Math.floor(i / 4), 1 + i % 4)).toISOString(), { master_metadata_album_artist_name: i % 2 ? 'Release QA Beta' : 'Release QA Alpha' }));
  rows.push(play('2026-09-20T10:00:00Z', { ms_played: 10000, skipped: true }), play('2026-09-21T10:00:00Z', { ms_played: 10000, skipped: true }), play('2026-09-22T10:00:00Z', { master_metadata_track_name: null }), { ...rows[0] });
  const progress = [];
  const imported = await readExport([await archive({ 'history/Streaming_History_Audio_test.json': rows, 'profile.json': [{ ignored: true }] })], value => progress.push(value));
  assert.equal(imported.rows.length, 50);
  assert.equal(imported.podcasts, 1);
  assert.equal(imported.kind, 'extended');
  const measured = analyze(imported.rows);
  assert.equal(measured.plays, 48);
  assert.equal(measured.short, 2);
  assert.equal(new Set(measured.rows.map(row => new Date(row.t).toISOString().slice(0, 7))).size, 12);
  assert.ok(progress.some(value => value.includes('Reading')) && progress.includes('Sorting your plays'));
});

test('malformed row shapes do not crash or introduce invalid measured values', async () => {
  const imported = await readExport([jsonFile([null, false, 42, 'text', [], {}, { endTime: {} }, play('invalid date'), play('2026-09-01T10:00:00Z', { platform: {}, ms_played: '180000' }), play('2026-09-02T10:00:00Z')])]);
  assert.equal(imported.rows.length, 2);
  assert.equal(imported.rows[0].platform, null);
  assert.equal(imported.rows[0].ms, 0);
  assert.equal(analyze(imported.rows).plays, 1);
});

test('damaged and unrelated ZIP files return actionable errors', async () => {
  const corrupt = Buffer.from('not a zip'); corrupt.name = 'damaged.zip'; corrupt.type = 'application/zip';
  await assert.rejects(readExport([corrupt]), /isn't a ZIP file Sleeve can open/);
  await assert.rejects(readExport([await archive({ 'profile.json': { name: 'synthetic' } })]), /No listening history/);
});

test('mixed service exports cannot silently double-count a listening history', async () => {
  const spotify = jsonFile([play('2026-09-01T10:00:00Z')]);
  const brainz = jsonFile([{ listened_at: 1756720800, track_metadata: { track_name: 'Synthetic track', artist_name: 'Release QA Alpha' } }], 'listens.json');
  await assert.rejects(readExport([spotify, brainz]), /not both at once/);
});
