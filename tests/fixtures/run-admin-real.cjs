const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const helper = path.join(__dirname, 'admin-real-api.cjs');
const ownTemporaryDirectory = process.env.FRONT_ADMIN_FIXTURE
  ? null
  : fs.mkdtempSync(path.join(os.tmpdir(), 'online-exam-admin-e2e-'));
const manifest = process.env.FRONT_ADMIN_FIXTURE || path.join(ownTemporaryDirectory, 'fixture.json');
const env = { ...process.env, REAL_API_E2E: '1', FRONT_ADMIN_FIXTURE: path.resolve(manifest) };
let attempted = false;
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with status ${result.status}`);
}
try {
  if (fs.existsSync(manifest)) throw new Error('Previous ADMIN manifest exists. Clean it before running another test.');
  attempted = true;
  run(helper, ['create']);
  run(path.join(root, 'node_modules/@playwright/test/cli.js'), ['test', 'tests/admin-real.spec.ts', '--workers=1', '--output=test-results/admin-real']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (attempted && fs.existsSync(manifest)) {
    try { run(helper, ['cleanup']); }
    catch (error) {
      console.error('Owned ADMIN fixture cleanup failed:', error.message);
      console.error('Preserved fixture manifest:', manifest);
      process.exitCode = 1;
    }
  }
  if (ownTemporaryDirectory && !fs.existsSync(manifest)) fs.rmdirSync(ownTemporaryDirectory);
}
