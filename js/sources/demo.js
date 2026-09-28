// Demo persona: a believable eight-year listening history, generated from a fixed seed
// so the same eras and insights show up every time.

const A = (artist, album, tracks) => tracks.map((name) => ({ name, artist, album }));
export const CATALOG = {
  'Frank Ocean': A('Frank Ocean', 'Blonde', ['Nights', 'Ivy', 'Pink + White', 'Self Control', 'Nikes', 'White Ferrari']),
  'Lorde': [...A('Lorde', 'Melodrama', ['Green Light', 'Liability', 'Supercut', 'The Louvre']), ...A('Lorde', 'Virgin', ['What Was That'])],
  'Kendrick Lamar': [...A('Kendrick Lamar', 'DAMN.', ['DNA.', 'LOVE.', 'HUMBLE.']), ...A('Kendrick Lamar', 'GNX', ['luther', 'squabble up', 'tv off'])],
  'SZA': [...A('SZA', 'Ctrl', ['Love Galore', 'The Weekend', 'Garden (Say It Like Dat)']), ...A('SZA', 'SOS', ['Kill Bill', 'Snooze', 'Good Days'])],
  'Tame Impala': A('Tame Impala', 'Currents', ['The Less I Know the Better', 'Let It Happen', 'Eventually']),
  'Billie Eilish': [...A('Billie Eilish', 'When We All Fall Asleep, Where Do We Go?', ['bad guy', 'bury a friend', "when the party's over"]), ...A('Billie Eilish', 'Hit Me Hard and Soft', ['Birds of a Feather', 'Lunch', 'Wildflower'])],
  'Phoebe Bridgers': [...A('Phoebe Bridgers', 'Punisher', ['Kyoto', 'Garden Song', 'I Know the End']), ...A('Phoebe Bridgers', 'Stranger in the Alps', ['Motion Sickness'])],
  'Mac DeMarco': [...A('Mac DeMarco', 'Salad Days', ['Chamber of Reflection']), ...A('Mac DeMarco', 'This Old Dog', ['My Old Man'])],
  'Tyler, The Creator': A('Tyler, The Creator', 'IGOR', ['EARFQUAKE', 'A BOY IS A GUN*', 'NEW MAGIC WAND']),
  'The Strokes': A('The Strokes', 'The New Abnormal', ['The Adults Are Talking', 'Bad Decisions']),
  'Olivia Rodrigo': A('Olivia Rodrigo', 'SOUR', ['drivers license', 'good 4 u', 'traitor']),
  'Mitski': [...A('Mitski', 'Laurel Hell', ['Working for the Knife']), ...A('Mitski', 'Be the Cowboy', ['Nobody'])],
  'Steve Lacy': A('Steve Lacy', 'Gemini Rights', ['Bad Habit']),
  'Beach House': A('Beach House', 'Once Twice Melody', ['Superstar']),
  'Clairo': A('Clairo', 'Charm', ['Juna', 'Sexy to Someone']),
  'Chappell Roan': A('Chappell Roan', 'The Rise and Fall of a Midwest Princess', ['Pink Pony Club', 'Good Luck, Babe!', 'HOT TO GO!']),
  'Charli xcx': A('Charli xcx', 'brat', ['Apple', '360', 'Von dutch']),
  'Sabrina Carpenter': A('Sabrina Carpenter', "Short n' Sweet", ['Espresso', 'Please Please Please']),
  'Laufey': A('Laufey', 'Bewitched', ['From the Start']),
  'Djo': A('Djo', 'Decide', ['End of Beginning']),
  'Radiohead': A('Radiohead', 'In Rainbows', ['Weird Fishes/Arpeggi', 'Reckoner']),
  'Fleetwood Mac': A('Fleetwood Mac', 'Rumours', ['Dreams', 'The Chain']),
};

// Relative weight of each artist in each era. Unlisted artists are absent.
const ERAS = [
  { until: '2018-11', w: { 'Frank Ocean': 9, 'Lorde': 10, 'Kendrick Lamar': 6, 'SZA': 5, 'Tame Impala': 7, 'Radiohead': 2, 'Fleetwood Mac': 1 } },
  { until: '2020-12', w: { 'Frank Ocean': 3, 'Billie Eilish': 8, 'Phoebe Bridgers': 11, 'Mac DeMarco': 5, 'Tyler, The Creator': 7, 'The Strokes': 3, 'Radiohead': 2, 'Fleetwood Mac': 2, 'Tame Impala': 1 } },
  { until: '2022-10', w: { 'Olivia Rodrigo': 6, 'Mitski': 10, 'Steve Lacy': 4, 'Beach House': 5, 'Frank Ocean': 5, 'Phoebe Bridgers': 4, 'Radiohead': 3, 'Fleetwood Mac': 2 } },
  { until: '2024-12', w: { 'SZA': 9, 'Clairo': 6, 'Chappell Roan': 10, 'Charli xcx': 6, 'Sabrina Carpenter': 5, 'Frank Ocean': 3, 'Mitski': 2, 'Fleetwood Mac': 1 } },
  { until: '2099-12', w: { 'Kendrick Lamar': 8, 'Billie Eilish': 7, 'Clairo': 5, 'Laufey': 4, 'Djo': 5, 'Lorde': 7, 'Chappell Roan': 3, 'Frank Ocean': 3 } },
];
// Newer albums only exist from their release month.
const RELEASED = {
  'What Was That': '2025-04', 'luther': '2024-11', 'squabble up': '2024-11', 'tv off': '2024-11', 'Kill Bill': '2022-12', 'Snooze': '2022-12', 'Good Days': '2022-12',
  'Birds of a Feather': '2024-05', 'Lunch': '2024-05', 'Wildflower': '2024-05', 'Kyoto': '2020-06', 'Garden Song': '2020-06', 'I Know the End': '2020-06',
  'Working for the Knife': '2021-10', 'Juna': '2024-07', 'Sexy to Someone': '2024-07', 'Apple': '2024-06', '360': '2024-06', 'Von dutch': '2024-02',
  'Espresso': '2024-04', 'Please Please Please': '2024-06', 'The Adults Are Talking': '2020-04', 'Bad Decisions': '2020-02', 'drivers license': '2021-01',
  'good 4 u': '2021-05', 'traitor': '2021-05', 'Bad Habit': '2022-07', 'Superstar': '2022-02', 'Good Luck, Babe!': '2024-04', 'From the Start': '2023-09',
  'End of Beginning': '2024-04', 'Lorde:What Was That': '2025-04',
};
const SKIPPY = { 'Tame Impala': 0.28, 'The Strokes': 0.26, 'Charli xcx': 0.24, 'Olivia Rodrigo': 0.2 };
const PLATFORMS = [['iOS', 0.58], ['Windows', 0.24], ['Web player', 0.1], ['Speaker', 0.08]];

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

let cached;
export function sampleArchive() {
  if (cached) return cached;
  const rand = rng(20170903);
  const pickW = (entries) => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let x = rand() * total;
    for (const [k, w] of entries) { if ((x -= w) <= 0) return k; }
    return entries[entries.length - 1][0];
  };
  // Hour-of-day shape: commute, afternoon, and a late-night tail.
  const HOURS = [5, 3, 1.5, .6, .3, .3, 1, 4, 6, 4, 3, 3, 4, 4, 4, 5, 6, 7, 6, 6, 7, 8, 9, 8].map((w, h) => [h, w]);
  const rows = [];
  const start = new Date(2017, 8, 3);
  const end = new Date();
  for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
    const key = ym(day);
    const era = ERAS.find((e) => key <= e.until);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    if (rand() < 0.06) continue;
    const years = (day - start) / 3.15e10;
    let count = Math.round((10 + years * 2.2) * (0.4 + rand() * 1.3) * (weekend ? 1.2 : 1));
    // A few binge days.
    if (rand() < 0.012) count = Math.round(count * 2.2);
    const isToday = day.toDateString() === end.toDateString();
    const hours = isToday ? HOURS.filter(([h]) => h < end.getHours()) : HOURS;
    if (isToday && !hours.length) continue;
    let artistsW = Object.entries(era.w);
    // drivers license week.
    if (key === '2021-01' || (key === '2021-02' && day.getDate() < 10)) artistsW = [...artistsW, ['Olivia Rodrigo', 11]];
    let sessionT = null;
    for (let i = 0; i < count; i++) {
      if (!sessionT || rand() < 0.18) {
        const hour = pickW(hours);
        sessionT = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rand() * 60)).getTime();
      }
      const artist = pickW(artistsW);
      const pool = CATALOG[artist].filter((t) => !RELEASED[t.name] || RELEASED[t.name] <= key);
      if (!pool.length) continue;
      // Favourites get more plays.
      const tr = pool[Math.floor(Math.pow(rand(), 1.7) * pool.length)];
      const trackMs = 150000 + Math.floor(rand() * 130000);
      const skipP = (SKIPPY[artist] || 0.12) + (tr.name === 'drivers license' ? -0.1 : 0);
      const skipped = rand() < skipP;
      const ms = skipped ? Math.floor(rand() < 0.8 ? 1500 + rand() * 26000 : 30000 + rand() * 40000) : Math.floor(trackMs * (rand() < 0.9 ? 1 : 0.5 + rand() * 0.5));
      if (sessionT > end.getTime() - 60000) break;
      rows.push({
        t: sessionT, track: tr.name, artist, album: tr.album, ms, skipped,
        shuffle: rand() < 0.42, platform: pickW(PLATFORMS), src: 'sample',
      });
      sessionT += ms + 800;
    }
  }
  rows.sort((a, b) => a.t - b.t);
  cached = rows;
  return rows;
}

/* ---------- Live demo profile ---------- */
const NOW_ROTATION = [
  ['Birds of a Feather', 'Billie Eilish'], ['What Was That', 'Lorde'], ['luther', 'Kendrick Lamar'], ['End of Beginning', 'Djo'],
  ['Juna', 'Clairo'], ['From the Start', 'Laufey'], ['Nights', 'Frank Ocean'], ['tv off', 'Kendrick Lamar'], ['Wildflower', 'Billie Eilish'],
  ['Sexy to Someone', 'Clairo'], ['HOT TO GO!', 'Chappell Roan'], ['Supercut', 'Lorde'],
];
const album = (name, artist) => CATALOG[artist].find((t) => t.name === name)?.album || '';

export function demoRecent(count = 20) {
  const t = Date.now();
  const offset = Math.floor(t / 180000) % NOW_ROTATION.length;
  return Array.from({ length: count }, (_, i) => {
    const [name, artist] = NOW_ROTATION[(offset + NOW_ROTATION.length - (i % NOW_ROTATION.length)) % NOW_ROTATION.length];
    return { name, artist, album: album(name, artist), image: '', nowPlaying: i === 0, t: i === 0 ? t : t - i * 203000 - 60000 };
  });
}

export const DEMO_USER = { name: 'mira_spins', display: 'Mira', image: '', playcount: 0, since: new Date(2017, 8, 3).getTime(), url: '' };
export const DEMO_NOTES = 'Your journey began with a heavy Lorde obsession that lasted through your first two years, before you shifted into a long era defined by Phoebe Bridgers and Mitski. What stands out most is your loyalty to Frank Ocean, who has appeared in your rotation every single year since you started.';
export const DEMO_ROAST = 'You played Nobody by Mitski 19 times in one day, and your busiest hour is 10 pm, which tells me you only schedule your emotional crises for after everyone else goes to sleep.';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
