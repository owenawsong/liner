import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const patterns = [
  ['OpenRouter credential', /\bsk-or-v1-[a-f0-9]{48,}\b/gi],
  ['NVIDIA credential', /\bnvapi-[A-Za-z0-9_-]{32,}\b/g],
  ['Groq credential', /\bgsk_[A-Za-z0-9]{40,}\b/g],
  ['OpenAI credential', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/g],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['Literal provider credential', /\b(?:OPENROUTER_API_KEY|NVIDIA_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{32,}/g],
];
const readKey = /\b(?:lastfmApiKey|LASTFM_API_KEY)\s*[:=]\s*["']?[a-f0-9]{32}\b/gi;

// Reports locations and rule names only. Never print matched credentials.
export function findSecrets(value, { path = '', allowPublicReadKey = false } = {}) {
  const findings = [];
  for (const [rule, pattern] of patterns) {
    for (const match of String(value).matchAll(new RegExp(pattern))) {
      findings.push({ path, rule, line: String(value).slice(0, match.index).split('\n').length, severity: 'secret' });
    }
  }
  if (!allowPublicReadKey) for (const match of String(value).matchAll(new RegExp(readKey))) {
    findings.push({ path, rule: 'Owner-specific public Last.fm read key', line: String(value).slice(0, match.index).split('\n').length, severity: 'public-config' });
  }
  return findings;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Git audit failed (${args[0]}).`);
  return result.stdout;
}
function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink found in public output.');
    return entry.isDirectory() ? walk(path) : [relative(root, path).replaceAll('\\', '/')];
  });
}

export function checkWorkingTree() {
  const paths = new Set([...git(['ls-files', '-c', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean), ...walk(resolve(root, 'dist'))]);
  const findings = [];
  for (const path of paths) {
    if (!existsSync(resolve(root, path))) continue;
    if (/(?:^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/.test(path) && !path.endsWith('.example')) {
      findings.push({ path, rule: 'Tracked private configuration file', line: 1, severity: 'secret' });
    }
    const buffer = readFileSync(resolve(root, path));
    if (buffer.includes(0)) continue;
    findings.push(...findSecrets(buffer.toString('utf8'), { path, allowPublicReadKey: path === 'dist/config.js' }));
  }
  return { findings, files: paths.size };
}

export function checkHistory() {
  const patch = git(['log', '--all', '-p', '--no-ext-diff', '--format=RELEASE_COMMIT %H', '--', '.']);
  let commit = '', path = '', line = 0;
  const findings = [], seen = new Set();
  for (const row of patch.split('\n')) {
    if (row.startsWith('RELEASE_COMMIT ')) { commit = row.slice(15); continue; }
    if (row.startsWith('+++ b/')) { path = row.slice(6); continue; }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (row.startsWith('+') && !row.startsWith('+++') || row.startsWith('-') && !row.startsWith('---')) {
      for (const finding of findSecrets(row.slice(1), { path })) {
        const identity = `${commit}|${path}|${finding.rule}|${line}`;
        if (!seen.has(identity)) { findings.push({ ...finding, commit, line }); seen.add(identity); }
      }
    }
    if (row.startsWith('+') && !row.startsWith('+++') || row.startsWith(' ')) line++;
  }
  return findings;
}

function main() {
  const history = process.argv.includes('--history');
  if (process.argv.slice(2).some(arg => arg !== '--history')) throw new Error('Usage: node scripts/check-secrets.mjs [--history]');
  const working = checkWorkingTree(), historical = history ? checkHistory() : [];
  for (const finding of [...working.findings, ...historical]) {
    console.log(`${finding.severity === 'secret' ? 'BLOCK' : 'REVIEW'} ${finding.commit ? `${finding.commit.slice(0, 12)} ` : ''}${finding.path}:${finding.line} — ${finding.rule}`);
  }
  const blocking = working.findings.length + historical.filter(finding => finding.severity === 'secret').length;
  console.log(`Checked ${working.files} source/output files${history ? ' and all locally reachable Git patches' : ''}; ${blocking} blocking findings, ${historical.filter(finding => finding.severity === 'public-config').length} historical public-key references.`);
  if (blocking) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
