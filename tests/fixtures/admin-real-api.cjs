const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

if (process.env.REAL_API_E2E !== '1') throw new Error('Set REAL_API_E2E=1 to run owned ADMIN test fixtures');
if (!process.env.FRONT_ADMIN_FIXTURE) throw new Error('FRONT_ADMIN_FIXTURE must point to a dedicated temporary manifest');
const manifest = path.resolve(process.env.FRONT_ADMIN_FIXTURE);
const backendRequire = createRequire(path.join(process.env.FRONT_BACKEND_DIR || path.resolve(__dirname, '../../../online-exam-api'), 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const databaseUrl = process.env.REAL_DATABASE_URL || 'mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true';
const parsed = new URL(databaseUrl);
if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password) {
  throw new Error('Real UI fixtures require the existing local MongoDB without remote credentials.');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
function identity(record, target = false) {
  const email = target ? /^front-admin-target-[a-f\d-]+@example\.com$/ : /^front-admin-[a-f\d-]+@example\.com$/;
  if (!record || !/^[a-f\d]{24}$/i.test(record.id) || !email.test(record.email)) throw new Error('Invalid owned test account identity');
}
async function main() {
  if (process.argv[2] === 'create') {
    if (fs.existsSync(manifest)) throw new Error('Previous ADMIN fixture manifest exists; clean it first');
    const suffix = crypto.randomUUID();
    const fixture = {
      kind: 'online-exam-admin-ui-owned-fixture', version: 1,
      admin: { id: crypto.randomBytes(12).toString('hex'), email: 'front-admin-' + suffix + '@example.com' },
      target: { id: crypto.randomBytes(12).toString('hex'), email: 'front-admin-target-' + suffix + '@example.com' },
      password: crypto.randomBytes(18).toString('base64url'), revokedTokenHashes: [],
      apiUrl: process.env.FRONT_REAL_API_URL || 'http://localhost:3000/api/v1',
    };
    // Record ownership before mutations so an interrupted run can still be cleaned.
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify(fixture), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const passwordHash = await bcrypt.hash(fixture.password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { ...fixture.admin, passwordHash, fullName: 'ADMIN UI kiểm thử', role: 'ADMIN' } });
      await tx.user.create({ data: { ...fixture.target, passwordHash, fullName: 'Người dùng ADMIN UI kiểm thử', role: 'STUDENT' } });
    });
    console.log('Two owned ADMIN UI test accounts created.');
    return;
  }
  if (process.argv[2] === 'cleanup') {
    if (!fs.existsSync(manifest)) return;
    const fixture = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (fixture.kind !== 'online-exam-admin-ui-owned-fixture' || (fixture.version !== undefined && fixture.version !== 1)) throw new Error('Invalid owned ADMIN fixture manifest');
    identity(fixture.admin); identity(fixture.target, true);
    const records = [fixture.admin, fixture.target];
    const userIds = records.map((record) => record.id);
    if (new Set(userIds).size !== userIds.length) throw new Error('Owned accounts must have distinct IDs.');
    const hashes = fixture.revokedTokenHashes || [];
    if (!Array.isArray(hashes) || !hashes.every((value) => typeof value === 'string' && /^[a-f\d]{64}$/.test(value))) throw new Error('Invalid owned revoked token hashes');
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const account = await tx.user.findUnique({ where: { id: record.id } });
        if (account && account.email !== record.email) throw new Error('Refusing to remove an account whose identity changed');
      }
      const exams = await tx.exam.count({ where: { managerId: { in: userIds } } });
      const attempts = await tx.attempt.count({ where: { userId: { in: userIds } } });
      if (exams || attempts) throw new Error('Unrelated exams or attempts reference ADMIN fixtures; refusing cleanup.');
      await tx.revokedToken.deleteMany({ where: { tokenHash: { in: hashes } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    fs.unlinkSync(manifest);
    console.log('Owned ADMIN UI accounts and revoked tokens cleaned by their exact IDs/hashes.');
    return;
  }
  throw new Error('Expected create or cleanup');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
