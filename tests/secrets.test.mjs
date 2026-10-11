import test from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets } from '../scripts/check-secrets.mjs';

test('secret audit reports credential location without disclosing its value', () => {
  const credential = ['sk', 'or', 'v1'].join('-') + '-' + 'a'.repeat(64);
  const findings = findSecrets(`line one\nconst key = '${credential}';`, { path: 'config.js' });
  assert.ok(findings.some(finding => finding.line === 2 && finding.severity === 'secret'));
  assert.ok(!JSON.stringify(findings).includes(credential));
});
test('public build read key is distinguished from private provider credentials', () => {
  const key = 'b'.repeat(32);
  assert.equal(findSecrets(`lastfmApiKey: '${key}'`).length, 1);
  assert.equal(findSecrets(`lastfmApiKey: '${key}'`, { allowPublicReadKey: true }).length, 0);
  assert.equal(findSecrets(`NVIDIA_API_KEY=${'n'.repeat(48)}`, { allowPublicReadKey: true })[0].severity, 'secret');
});
test('documentation placeholders and variable references do not trigger the audit', () => {
  assert.deepEqual(findSecrets('OPENROUTER_API_KEY=your-key; Authorization: `Bearer ${key}`; NVIDIA_API_KEY=optional'), []);
});
