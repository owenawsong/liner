import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.window = {};
const { analyze, monthStory } = await import('../js/analysis.js');
const { answerQuestion } = await import('../js/questions.js');
const { obscuritySnapshot } = await import('../js/views/mainstream.js');
const { genreEvolution } = await import('../js/patterns.js');

const play = (y, m, day, hour, artist, track, skipped = null) => ({
  t: new Date(y, m - 1, day, hour).getTime(), artist, track, album: `${artist} album`, skipped,
});
const rows = [
  play(2024, 1, 3, 23, 'SZA', 'A'),
  play(2024, 5, 4, 12, 'Radiohead', 'B'),
  ...Array.from({ length: 5 }, (_, i) => play(2025, 6, i < 3 ? 2 : 7, 23, 'SZA', `C${i}`)),
  ...Array.from({ length: 3 }, (_, i) => play(2025, 7, 9, 12, 'Lorde', `D${i}`)),
  play(2025, 8, 1, 10, 'SZA', 'E'),
  play(2025, 8, 2, 10, 'SZA', 'F'),
  play(2026, 9, 1, 10, 'SZA', 'G'),
].sort((a, b) => a.t - b.t);
const A = analyze(rows, { minMs: 0 });

test('artist origin gives the first recorded play and repeat month', () => {
  const answer = answerQuestion(A, 'When did I get into SZA?');
  assert.match(answer.title, /January 2024/);
  assert.match(answer.detail, /June 2025/);
  assert.equal(answer.target.name, 'SZA');
});

test('summer question counts exact plays in the requested months', () => {
  const answer = answerQuestion(A, 'What was my summer 2025 like?');
  assert.equal(answer.title, 'June–August 2025');
  assert.match(answer.detail, /10 plays/);
  assert.match(answer.detail, /SZA led with 7 plays/);
});

test('year comparison and discoveries come from the requested years', () => {
  const compare = answerQuestion(A, 'What changed between 2024 and 2025?');
  assert.equal(compare.title, '2024 → 2025');
  assert.match(compare.detail, /SZA led 2024/);
  const discoveries = answerQuestion(A, 'Which artists did I discover in 2025?');
  assert.match(discoveries.title, /1 artist first heard in 2025/);
  assert.match(discoveries.detail, /Lorde/);
});

test('month detail separates active days and first-heard artists', () => {
  const idx = A.months.findIndex((m) => m.y === 2025 && m.m === 5);
  const story = monthStory(A, idx);
  assert.equal(story.month.n, 5);
  assert.equal(story.activeDays, 2);
  assert.equal(story.newArtists, 0);
  assert.equal(story.previous.n, 0);
});

test('late-night answer uses recorded hours', () => {
  const answer = answerQuestion(A, 'What do I listen to late at night?');
  assert.match(answer.title, /SZA leads/);
  assert.match(answer.detail, /6 of your 6 plays/);
});

test('skip answer requires enough known plays per artist', () => {
  const skips = analyze(Array.from({ length: 12 }, (_, i) => play(2025, 1, i + 1, 12, 'Lorde', `T${i}`, i < 9)), { minMs: 0 });
  const answer = answerQuestion(skips, 'Which artist do I skip the most?');
  assert.match(answer.title, /Lorde: 75% skipped/);
  assert.match(answer.detail, /9 of 12/);
  assert.equal(answerQuestion(A, 'Which artist do I skip the most?').kind, 'skips');
});

test('obscurity stays unavailable until the fixed artist set has enough coverage', () => {
  const artists = [{ name: 'A', n: 80 }, { name: 'B', n: 5 }, { name: 'C', n: 5 }, { name: 'D', n: 5 }, { name: 'E', n: 5 }];
  const incomplete = obscuritySnapshot(artists, (name) => name === 'A' ? 1000 : null);
  assert.equal(incomplete.score, null);
  const complete = obscuritySnapshot(artists, () => 1000);
  assert.equal(complete.coverage, 100);
  assert.ok(complete.score > 0);
});

test('genre history keeps unmatched plays visible in each year', () => {
  const trend = genreEvolution(A, new Map([['SZA', 'r&b'], ['Lorde', 'pop']]));
  const year = trend.years.find((item) => item.year === 2024);
  assert.equal(year.plays, 2);
  assert.equal(year.matched, 1);
  assert.equal(year.segments.find((item) => item.name === 'r&b').plays, 1);
});
