// Exact answers from the listener's own record. The writer may add context,
// but these calculations remain available when AI is off or unavailable.
import { lowerBound, topIn } from './analysis.js';

const DAY = 864e5;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (t) => new Date(t).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
const month = (t) => new Date(t).toLocaleDateString('en', { month: 'long', year: 'numeric' });
const n = (value) => Number(value || 0).toLocaleString('en');
const norm = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const result = (kind, title, detail, stats = [], target = null, basis = '') => ({ kind, title, detail, stats, target, basis, facts: [title, detail, ...stats.map(([label, value]) => `${label}: ${value}`), basis].filter(Boolean).join('\n') });

function artistInQuestion(A, q) {
  const clean = ` ${norm(q)} `;
  let match = null;
  for (const artist of A.artists) if (clean.includes(` ${norm(artist.name)} `) && (!match || artist.name.length > match.name.length)) match = artist;
  return match;
}

function artistOrigin(A, a) {
  const byMonth = new Map();
  for (const t of a.times) {
    const d = new Date(t), key = d.getFullYear() * 12 + d.getMonth();
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }
  const firstRepeat = [...byMonth].find(([, count]) => count >= 3);
  const peak = [...byMonth].reduce((best, row) => !best || row[1] > best[1] ? row : best, null);
  const at = (key) => month(new Date(Math.floor(key / 12), key % 12, 1).getTime());
  const recent = a.times.filter((t) => t >= A.to - 90 * DAY).length;
  const detail = `Your first recorded play was ${fmt(a.first)}. ${firstRepeat ? `You played them at least three times in ${at(firstRepeat[0])}.` : 'No month in this record has three plays yet.'} Their busiest month was ${at(peak[0])} with ${n(peak[1])} plays.`;
  return result('artist-origin', `${a.name} first appeared in ${month(a.first)}`, detail,
    [['All-time plays', n(a.n)], ['Last 90 days', n(recent)]], { kind: 'artist', name: a.name }, 'Based on recorded plays; earlier listening outside this record is unknown.');
}

function period(A, from, to, label) {
  const start = lowerBound(A.rows, from), end = lowerBound(A.rows, to);
  const plays = end - start;
  if (!plays) return result('period', `No recorded plays in ${label}`, `Your record has no plays dated ${label}.`, [], null, 'A missing period can mean listening was not recorded.');
  const artists = topIn(A, 'artists', from, to, 3);
  const tracks = topIn(A, 'tracks', from, to, 1);
  const daySet = new Set();
  for (let i = start; i < end; i++) daySet.add(new Date(A.rows[i].t).toDateString());
  const days = daySet.size;
  const leader = artists[0];
  const detail = `${n(plays)} plays across ${n(days)} days. ${leader.name} led with ${n(leader.plays)} plays${tracks[0] ? `; your most-played song was ${tracks[0].name} by ${tracks[0].artist} (${n(tracks[0].plays)} plays)` : ''}.`;
  return result('period', label, detail, [['Recorded plays', n(plays)], ['Active days', n(days)], ['Leading artist', leader.name]],
    { kind: 'year', year: new Date(from).getFullYear() }, `Counted plays from ${fmt(from)} through ${fmt(to - DAY)}.`);
}

function tasteYears(A) {
  const years = A.years.filter((y) => y.n >= 10);
  if (years.length < 2) return result('years', 'Your record needs another year', 'There are not yet two years with at least ten recorded plays to compare.');
  const first = years[0], last = years.at(-1);
  const firstTop = topIn(A, 'artists', new Date(first.y, 0, 1).getTime(), new Date(first.y + 1, 0, 1).getTime(), 3);
  const lastTop = topIn(A, 'artists', new Date(last.y, 0, 1).getTime(), new Date(last.y + 1, 0, 1).getTime(), 3);
  const shared = firstTop.filter((a) => lastTop.some((b) => b.name === a.name)).length;
  return result('years', `${first.y} → ${last.y}`, `${first.topArtist} led ${first.y} with ${n(first.topArtistN)} plays; ${last.topArtist} leads ${last.y} with ${n(last.topArtistN)}. ${shared} of the top three artists appear in both years.`,
    [[`${first.y} plays`, n(first.n)], [`${last.y} plays`, n(last.n)], ['Shared top-three artists', String(shared)]],
    { kind: 'year', year: last.y }, 'Calendar years may include an incomplete first or current year.');
}

function compareYears(A, leftYear, rightYear) {
  const first = A.years.find((y) => y.y === leftYear), second = A.years.find((y) => y.y === rightYear);
  if (!first || !second) return result('years', 'One of those years is outside this record', `Sleeve needs recorded plays in both ${leftYear} and ${rightYear} to compare them.`);
  const leaders = [first, second].map((y) => topIn(A, 'artists', new Date(y.y, 0, 1).getTime(), new Date(y.y + 1, 0, 1).getTime(), 3));
  const shared = leaders[0].filter((a) => leaders[1].some((b) => b.name === a.name)).length;
  return result('years', `${first.y} → ${second.y}`, `${first.topArtist} led ${first.y} with ${n(first.topArtistN)} plays. ${second.topArtist} led ${second.y} with ${n(second.topArtistN)}. ${shared} of your top three artists appeared in both years.`,
    [[`${first.y} plays`, n(first.n)], [`${second.y} plays`, n(second.n)], ['Shared top-three artists', String(shared)]],
    { kind: 'year', year: second.y }, 'First and current years may be incomplete.');
}

function discoveriesInYear(A, year) {
  const found = A.artists.filter((a) => new Date(a.first).getFullYear() === year).sort((a, b) => b.n - a.n);
  if (!found.length) return result('discoveries', `No first-heard artists in ${year}`, 'That year has no artists whose first recorded play falls inside it. Earlier listening outside this record is unknown.');
  const names = found.slice(0, 3).map((a) => `${a.name} (${n(a.n)} all-time plays)`);
  return result('discoveries', `${n(found.length)} ${found.length === 1 ? 'artist' : 'artists'} first heard in ${year}`, `The ones you returned to most were ${names.join(', ')}.`,
    [['First-heard artists', n(found.length)]], { kind: 'year', year }, 'First heard means first recorded play in this Sleeve history.');
}

function skips(A) {
  const entries = [...(A.artistSkip || new Map())].filter(([, counts]) => counts[1] >= 10);
  if (!entries.length) return result('skips', 'Not enough skip data yet', 'A Spotify extended-history file with at least ten known plays for an artist is needed to compare skip rates.');
  entries.sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1] || b[1][1] - a[1][1]);
  const [name, [skipped, known]] = entries[0], rate = Math.round(skipped / known * 100);
  return result('skips', `${name}: ${rate}% skipped`, `${n(skipped)} of ${n(known)} plays with known skip information were marked skipped. This is the highest rate among artists with at least ten such plays.`,
    [['Skipped', n(skipped)], ['Known plays', n(known)]], { kind: 'artist', name }, 'Skip flags come from the imported Spotify history; they are unavailable for ordinary Last.fm scrobbles.');
}

function lateNight(A) {
  const counts = new Map(); let total = 0;
  for (const row of A.rows) {
    const h = new Date(row.t).getHours();
    if (h < 22 && h >= 5) continue;
    total++; counts.set(row.artist, (counts.get(row.artist) || 0) + 1);
  }
  if (!total) return result('night', 'No late-night plays recorded', 'There are no plays between 10 pm and 5 am in this record.');
  const [name, plays] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return result('night', `${name} leads your late nights`, `${n(plays)} of your ${n(total)} plays between 10 pm and 5 am were theirs. Late-night plays make up ${Math.round(total / A.plays * 100)}% of all recorded plays.`,
    [['Late-night plays', n(total)], ['Leading artist plays', n(plays)]], { kind: 'artist', name }, 'Hours use the time zone of this device.');
}

export function answerQuestion(A, question) {
  if (!A?.rows?.length) return null;
  const q = norm(question);
  const a = artistInQuestion(A, question);
  if (a && /(?:when|first|discover|got into|start)/.test(q)) return artistOrigin(A, a);
  if (a && /(?:how many|how often|most played|plays|listened)/.test(q)) return result('artist-plays', `${a.name}: ${n(a.n)} plays`, `Your first recorded play was ${fmt(a.first)}; the latest was ${fmt(a.last)}.`, [['Recorded plays', n(a.n)]], { kind: 'artist', name: a.name }, 'Counts follow your current play-count setting.');
  const years = [...q.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const year = years[0];
  if (years.length >= 2 && /(?:chang|compar|versus| vs |different|between)/.test(` ${q} `)) return compareYears(A, years[0], years[1]);
  if (year && /\bsummer\b/.test(q)) return period(A, new Date(year, 5, 1).getTime(), new Date(year, 8, 1).getTime(), `June–August ${year}`);
  if (year) {
    const m = MONTHS.findIndex((name) => new RegExp(`\\b(?:${name.toLowerCase()}|${name.slice(0, 3).toLowerCase()})\\b`).test(q));
    if (m >= 0) return period(A, new Date(year, m, 1).getTime(), new Date(year, m + 1, 1).getTime(), `${MONTHS[m]} ${year}`);
  }
  if (year && /(?:discover|new artist|first hear|first listen)/.test(q)) return discoveriesInYear(A, year);
  if (/(?:taste|listening|music)/.test(q) && /(?:chang|evolv|year|different)/.test(q)) return tasteYears(A);
  if (/skip/.test(q)) return skips(A);
  if (/(?:night|late|bedtime)/.test(q)) return lateNight(A);
  if (year && /(?:year|in )/.test(q)) return period(A, new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime(), String(year));
  if (/(?:top|most played|favorite|favourite)/.test(q) && /artist/.test(q)) {
    const top = topIn(A, 'artists', -Infinity, Infinity, 1)[0];
    return result('top-artist', `${top.name} is your most-played artist`, `${n(top.plays)} recorded plays across your whole record.`, [['Recorded plays', n(top.plays)]], { kind: 'artist', name: top.name }, 'Ranked by plays, using your current play-count setting.');
  }
  if (/(?:top|most played|favorite|favourite)/.test(q) && /(?:song|track)/.test(q)) {
    const top = topIn(A, 'tracks', -Infinity, Infinity, 1)[0];
    return result('top-song', `${top.name} is your most-played song`, `${n(top.plays)} plays of ${top.name} by ${top.artist} across your whole record.`, [['Recorded plays', n(top.plays)]], { kind: 'song', name: top.name, artist: top.artist }, 'Ranked by plays, using your current play-count setting.');
  }
  if (/(?:what|which|when)/.test(q) && /(?:time|hour)/.test(q)) {
    const hours = new Array(24).fill(0);
    for (const row of A.rows) hours[new Date(row.t).getHours()]++;
    const busiest = hours.indexOf(Math.max(...hours));
    const label = new Date(2020, 0, 1, busiest).toLocaleTimeString('en', { hour: 'numeric', hour12: true });
    return result('hours', `${label} is your busiest hour`, `${n(hours[busiest])} plays started during that hour, using the time zone on this device.`, [['Plays in that hour', n(hours[busiest])]], null, 'The listening clock shows the full week by hour.');
  }
  return null;
}
