import { copyFile, lstat, mkdir, readdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PUBLIC_FILES = [
  'index.html', 'styles.css', 'sleeve.css', 'profile.css', 'welcome.css',
  'journey.css', 'discover.css', 'analysis.css', 'audio.css', 'config.js',
  'manifest.webmanifest', 'sw.js',
];
const OPTIONAL_FILES = ['_headers', '_redirects'];
const ASSET_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2']);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samePath = (left, right) => relative(left, right) === '';
const isInside = (parent, target) => { const rel = relative(parent, target); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };
async function statOrNull(path) { try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function checkAncestors(target) {
  for (let current = target;; current = dirname(current)) {
    if ((await statOrNull(current))?.isSymbolicLink()) throw new Error('Build output cannot traverse a symlink.');
    if (dirname(current) === current) break;
  }
}
async function canonicalTarget(target) {
  const missing = []; let ancestor = target;
  while (!(await statOrNull(ancestor))) {
    missing.unshift(basename(ancestor));
    if (dirname(ancestor) === ancestor) throw new Error('Build output volume does not exist.');
    ancestor = dirname(ancestor);
  }
  // Windows temp paths can use an 8.3 alias. Resolve the existing ancestor
  // before boundary comparisons rather than treating an alias as a symlink.
  return join(await realpath(ancestor), ...missing);
}
async function copyPublic(source, target) {
  const entry = await lstat(source);
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`Public input must be a regular file: ${source}`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
async function copyTree(source, target, accept) {
  const entry = await lstat(source);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Public tree must be a real directory: ${source}`);
  for (const item of (await readdir(source, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (item.name.startsWith('.')) continue;
    const from = join(source, item.name), to = join(target, item.name);
    if (item.isSymbolicLink()) throw new Error(`Symlinks cannot enter the public build: ${from}`);
    if (item.isDirectory()) await copyTree(from, to, accept);
    else if (item.isFile() && accept(item.name)) await copyPublic(from, to);
  }
}

export async function build({ projectDir = projectRoot, outDir = join(projectDir, 'dist'), lastfmApiKey = process.env.LASTFM_API_KEY } = {}) {
  const source = await realpath(projectDir);
  const requestedOutput = resolve(outDir);
  const requestedEntry = await statOrNull(requestedOutput);
  if (requestedEntry?.isSymbolicLink() || (requestedEntry && !requestedEntry.isDirectory())) throw new Error('Build output must be a real directory.');
  await checkAncestors(requestedOutput);
  const output = await canonicalTarget(requestedOutput);
  const canonicalOutput = join(source, 'dist');
  if (samePath(output, source) || isInside(output, source)) throw new Error('Build output cannot be the project or one of its parents.');
  if (isInside(source, output) && !samePath(output, canonicalOutput)) throw new Error('Inside the project, only dist/ may be used as build output.');
  if (lastfmApiKey && !/^[a-f0-9]{32}$/i.test(lastfmApiKey)) throw new Error('LASTFM_API_KEY must be a 32-character hexadecimal public Last.fm read key.');
  const existing = await statOrNull(output);
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error('Build output must be a real directory.');
  await checkAncestors(output);
  // Verify the resolved target before removing the known, generated dist folder.
  if (existing) {
    if (samePath(output, canonicalOutput)) await rm(output, { recursive: true, force: true });
    else if ((await readdir(output)).length) throw new Error('External build output must be empty; create a fresh staging directory.');
  } else {
    await mkdir(output, { recursive: true });
  }
  await mkdir(output, { recursive: true });
  for (const name of PUBLIC_FILES) await copyPublic(join(source, name), join(output, name));
  for (const name of OPTIONAL_FILES) if (await statOrNull(join(source, name))) await copyPublic(join(source, name), join(output, name));
  await copyTree(join(source, 'js'), join(output, 'js'), name => extname(name) === '.js');
  await copyTree(join(source, 'assets'), join(output, 'assets'), name => ASSET_EXTENSIONS.has(extname(name).toLowerCase()));
  // Vendor only the pinned browser library and its license, never node_modules/.
  await copyPublic(join(source, 'node_modules', 'jszip', 'dist', 'jszip.min.js'), join(output, 'assets', 'vendor', 'jszip.min.js'));
  await copyPublic(join(source, 'node_modules', 'jszip', 'LICENSE.markdown'), join(output, 'assets', 'vendor', 'jszip-LICENSE.md'));
  await copyPublic(join(source, 'docs', 'audio-pilot.json'), join(output, 'audio-pilot.json'));
  if (lastfmApiKey) {
    const configPath = join(output, 'config.js');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${config}\n// This Last.fm read key is public browser configuration.\nwindow.LINER_CONFIG = { ...window.LINER_CONFIG, lastfmApiKey: ${JSON.stringify(lastfmApiKey)} };\n`);
  }
  await writeFile(join(output, '_routes.json'), `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--out-dir')) throw new Error('Usage: node scripts/build.mjs [--out-dir <empty-staging-directory>]');
    const output = await build({ ...(args.length ? { outDir: resolve(args[1]) } : {}) });
    console.log(`Public assets built in ${output}`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
