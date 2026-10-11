import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build, PUBLIC_FILES } from '../scripts/build.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sleeve-build-test-'));
  const project = join(root, 'project');
  await mkdir(project);
  // Cleanup is confined to this freshly allocated temporary fixture.
  t.after(async () => { if (resolve(root).startsWith(resolve(tmpdir()))) await rm(root, { recursive: true, force: true }); });
  for (const path of ['assets', 'js', 'docs']) await mkdir(join(project, path));
  for (const name of PUBLIC_FILES) await writeFile(join(project, name), name === 'config.js' ? "window.LINER_CONFIG = {lastfmApiKey: ''};" : name);
  await writeFile(join(project, 'js', 'app.js'), '// public app');
  await writeFile(join(project, 'assets', 'mark.svg'), '<svg/>');
  await writeFile(join(project, 'docs', 'audio-pilot.json'), '{}');
  await mkdir(join(project, 'node_modules', 'jszip', 'dist'), {recursive:true});
  await writeFile(join(project, 'node_modules', 'jszip', 'dist', 'jszip.min.js'), '// pinned library fixture');
  await writeFile(join(project, 'node_modules', 'jszip', 'LICENSE.markdown'), 'MIT notice fixture');
  return { root, project };
}

test('public build excludes source, secrets and unsupported files, retaining explicit headers and routes', async t => {
  const { project } = await fixture(t);
  await writeFile(join(project, '.dev.vars'), 'private fixture');
  await writeFile(join(project, 'README.md'), 'source only');
  await writeFile(join(project, '_headers'), '/*\n  X-Content-Type-Options: nosniff');
  await writeFile(join(project, 'js', '.env'), 'private fixture');
  await writeFile(join(project, 'assets', 'notes.txt'), 'not an asset');
  const out = await build({ projectDir: project, lastfmApiKey: '' });
  const files = await readdir(out);
  assert.ok(!files.includes('.dev.vars') && !files.includes('README.md') && !files.includes('functions'));
  assert.deepEqual(await readdir(join(out, 'js')), ['app.js']);
  assert.deepEqual(await readdir(join(out, 'assets')), ['mark.svg', 'vendor']);
  assert.deepEqual(await readdir(join(out, 'assets', 'vendor')), ['jszip-LICENSE.md', 'jszip.min.js']);
  assert.match(await readFile(join(out, '_headers'), 'utf8'), /nosniff/);
  assert.deepEqual(JSON.parse(await readFile(join(out, '_routes.json'), 'utf8')), {version:1,include:['/api/*'],exclude:[]});
  await writeFile(join(out, 'stale.txt'), 'old generated output');
  await build({ projectDir: project, lastfmApiKey: '' });
  assert.ok(!(await readdir(out)).includes('stale.txt'));
});

test('explicit Last.fm public configuration is validated and injected only into generated output', async t => {
  const { project } = await fixture(t);
  const syntheticPublicKey = '0123456789abcdef0123456789abcdef';
  const out = await build({ projectDir: project, lastfmApiKey: syntheticPublicKey });
  assert.ok((await readFile(join(out, 'config.js'), 'utf8')).includes(syntheticPublicKey));
  assert.ok(!(await readFile(join(project, 'config.js'), 'utf8')).includes(syntheticPublicKey));
  await assert.rejects(build({ projectDir: project, lastfmApiKey: 'not-a-key' }), /32-character/);
});

test('build refuses source/parent targets and refuses to overwrite external files', async t => {
  const { root, project } = await fixture(t);
  await assert.rejects(build({ projectDir: project, outDir: project }), /project/);
  await assert.rejects(build({ projectDir: project, outDir: root }), /parents/);
  await assert.rejects(build({ projectDir: project, outDir: join(project, 'assets') }), /only dist/);
  const external = join(root, 'existing');
  await mkdir(external);
  await writeFile(join(external, 'keep.txt'), 'keep');
  await assert.rejects(build({ projectDir: project, outDir: external }), /must be empty/);
  assert.equal(await readFile(join(external, 'keep.txt'), 'utf8'), 'keep');
  const empty = join(root, 'fresh');
  await build({ projectDir: project, outDir: empty, lastfmApiKey: '' });
  assert.ok((await readdir(empty)).includes('index.html'));
});

test('a linked dist cannot delete or replace an external folder', async t => {
  const { root, project } = await fixture(t);
  const external = join(root, 'protected');
  await mkdir(external);
  await writeFile(join(external, 'keep.txt'), 'keep');
  await symlink(external, join(project, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(build({ projectDir: project, lastfmApiKey: '' }), /real directory/);
  assert.equal(await readFile(join(external, 'keep.txt'), 'utf8'), 'keep');
});
