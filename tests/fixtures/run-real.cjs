const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const helper = path.join(__dirname, 'real-api.cjs');
const manifest = path.resolve(process.env.FRONT_REAL_FIXTURE || path.join(root, '.local/real-fixture.json'));
const env = { ...process.env, REAL_API_E2E: '1', FRONT_REAL_FIXTURE: manifest, FRONT_REAL_FIXTURE_HELPER: helper };
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with status ${result.status}`);
}
let created = false;
try {
  if (fs.existsSync(manifest)) throw new Error('Previous fixture manifest exists. Clean it before running another test.');
  run(helper, ['create']);
  created = true;
  run(path.join(root, 'node_modules/@playwright/test/cli.js'), ['test', 'tests/attempts-real.spec.ts', '--workers=1']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) {
    try { run(helper, ['cleanup']); }
    catch (error) { console.error('Fixture cleanup failed:', error.message); process.exitCode = 1; }
  }
}
