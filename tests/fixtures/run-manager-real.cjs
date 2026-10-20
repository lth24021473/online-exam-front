const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const helper = path.join(__dirname, 'manager-real-api.cjs');
const temporaryDirectory = process.env.FRONT_MANAGER_FIXTURE ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'online-exam-manager-e2e-'));
const manifest = path.resolve(process.env.FRONT_MANAGER_FIXTURE || path.join(temporaryDirectory, 'fixture.json'));
const env = { ...process.env, MANAGER_API_E2E: '1', FRONT_MANAGER_FIXTURE: manifest };
let attempted = false;
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Command failed with status ' + result.status);
}
try {
  if (fs.existsSync(manifest)) throw new Error('Previous manager fixture manifest exists; clean it first.');
  attempted = true;
  run(helper, ['create']);
  run(path.join(root, 'node_modules/@playwright/test/cli.js'), ['test', 'tests/manager-real.spec.ts', '--workers=1', '--output=test-results/manager-real']);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (attempted && fs.existsSync(manifest)) {
    try { run(helper, ['cleanup']); }
    catch (error) { console.error('Owned manager fixture cleanup failed:', error.message, 'Manifest:', manifest); process.exitCode = 1; }
  }
  if (temporaryDirectory && !fs.existsSync(manifest)) fs.rmdirSync(temporaryDirectory);
}
