const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const helper = path.join(__dirname, 'real-api.cjs');
const temporaryDirectory = process.env.FRONT_REAL_FIXTURE ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'online-exam-attempt-e2e-'));
const manifest = path.resolve(process.env.FRONT_REAL_FIXTURE || path.join(temporaryDirectory, 'fixture.json'));
const env = { ...process.env, REAL_API_E2E: '1', FRONT_REAL_FIXTURE: manifest, FRONT_REAL_FIXTURE_HELPER: helper };
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with status ${result.status}`);
}
let attempted = false;
try {
  if (fs.existsSync(manifest)) throw new Error('Previous fixture manifest exists. Clean it before running another test.');
  attempted = true;
  run(helper, ['create']);
  run(path.join(root, 'node_modules/@playwright/test/cli.js'), ['test', 'tests/attempts-real.spec.ts', '--workers=1', '--output=test-results/attempt-real']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (attempted && fs.existsSync(manifest)) {
    try { run(helper, ['cleanup']); }
    catch (error) { console.error('Fixture cleanup failed:', error.message, 'Manifest:', manifest); process.exitCode = 1; }
  }
  if (temporaryDirectory && !fs.existsSync(manifest)) fs.rmdirSync(temporaryDirectory);
}
