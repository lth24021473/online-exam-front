const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

if (process.env.REAL_API_E2E !== '1') throw new Error('Set REAL_API_E2E=1 to run owned ADMIN test fixtures');
if (!process.env.FRONT_ADMIN_FIXTURE) throw new Error('FRONT_ADMIN_FIXTURE must point to a dedicated temporary manifest');
const manifest = path.resolve(process.env.FRONT_ADMIN_FIXTURE);
const backendRoot = process.env.FRONT_BACKEND_DIR || path.resolve(__dirname, '../../../online-exam-api');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const prisma = new PrismaClient({ datasources: { db: {
  url: process.env.REAL_DATABASE_URL || 'mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true',
} } });

async function main() {
  if (process.argv[2] === 'create') {
    if (fs.existsSync(manifest)) throw new Error('Previous ADMIN fixture manifest exists; clean it first');
    const suffix = crypto.randomUUID();
    const password = crypto.randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);
    const adminEmail = `front-admin-${suffix}@example.com`;
    const targetEmail = `front-admin-target-${suffix}@example.com`;
    const records = await prisma.$transaction(async (transaction) => {
      const admin = await transaction.user.create({ data: {
        email: adminEmail, passwordHash, fullName: 'ADMIN UI kiểm thử', role: 'ADMIN',
      } });
      const target = await transaction.user.create({ data: {
        email: targetEmail, passwordHash, fullName: 'Người dùng ADMIN UI kiểm thử', role: 'STUDENT',
      } });
      return { admin: { id: admin.id, email: admin.email }, target: { id: target.id, email: target.email } };
    });
    const fixture = {
      kind: 'online-exam-admin-ui-owned-fixture', ...records, password, revokedTokenHashes: [],
      apiUrl: process.env.FRONT_REAL_API_URL || 'http://localhost:3000/api/v1',
    };
    try {
      fs.mkdirSync(path.dirname(manifest), { recursive: true });
      fs.writeFileSync(manifest, JSON.stringify(fixture), { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      for (const record of Object.values(records)) await prisma.user.delete({ where: { id: record.id } });
      throw error;
    }
    console.log('Two owned ADMIN UI test accounts created.');
    return;
  }
  if (process.argv[2] === 'cleanup') {
    if (!fs.existsSync(manifest)) return;
    const fixture = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (fixture.kind !== 'online-exam-admin-ui-owned-fixture') throw new Error('Invalid owned ADMIN fixture manifest');
    const hashes = fixture.revokedTokenHashes || [];
    if (!Array.isArray(hashes) || !hashes.every((value) => typeof value === 'string' && /^[a-f\d]{64}$/.test(value))) {
      throw new Error('Invalid owned revoked token hashes');
    }
    for (const tokenHash of hashes) await prisma.revokedToken.deleteMany({ where: { tokenHash } });
    const records = [fixture.admin, fixture.target];
    for (const record of records) {
      if (!record || !/^[a-f\d]{24}$/i.test(record.id) || !/^front-admin(?:-target)?-[a-f\d-]+@example\.com$/.test(record.email)) {
        throw new Error('Invalid owned test account identity');
      }
      const account = await prisma.user.findUnique({ where: { id: record.id } });
      if (!account) continue;
      if (account.email !== record.email) throw new Error('Refusing to remove an account whose identity changed');
      await prisma.user.delete({ where: { id: record.id } });
    }
    fs.unlinkSync(manifest);
    console.log('Owned ADMIN UI accounts and revoked tokens cleaned by their exact IDs/hashes.');
    return;
  }
  throw new Error('Expected create or cleanup');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
