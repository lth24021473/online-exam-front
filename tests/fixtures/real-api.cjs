const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
if (process.env.REAL_API_E2E !== '1' || !process.env.FRONT_REAL_FIXTURE) {
  throw new Error('Use the real-test runner with its dedicated FRONT_REAL_FIXTURE manifest.');
}
const manifest = path.resolve(process.env.FRONT_REAL_FIXTURE);
const backendRequire = createRequire(path.join(process.env.FRONT_BACKEND_DIR || path.resolve(__dirname, '../../../online-exam-api'), 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const databaseUrl = process.env.REAL_DATABASE_URL || 'mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true';
const parsed = new URL(databaseUrl);
if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password) {
  throw new Error('Real UI fixtures require the existing local MongoDB without remote credentials.');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
function ownedFixture(fixture) {
  if (fixture.kind !== 'online-exam-attempt-ui-owned-fixture' || fixture.version !== 1) throw new Error('Unexpected owned attempt fixture manifest.');
  const ids = [fixture.managerId, fixture.studentId, fixture.examId];
  if (!ids.every((id) => typeof id === 'string' && /^[a-f\d]{24}$/.test(id)) || new Set(ids).size !== ids.length
    || !/^front-manager-[a-f\d-]+@example\.com$/.test(fixture.managerEmail)
    || !/^front-e2e-[a-f\d-]+@example\.com$/.test(fixture.email)
    || typeof fixture.title !== 'string' || !fixture.title.startsWith('Kiểm tra giao diện ')) {
    throw new Error('Invalid owned attempt fixture identity.');
  }
  return fixture;
}
async function main() {
  const command = process.argv[2];
  if (command === 'create') {
    if (fs.existsSync(manifest)) throw new Error('Existing fixture manifest must be cleaned first.');
    const suffix = crypto.randomUUID();
    const fixture = {
      kind: 'online-exam-attempt-ui-owned-fixture', version: 1,
      managerId: crypto.randomBytes(12).toString('hex'), managerEmail: 'front-manager-' + suffix + '@example.com',
      studentId: crypto.randomBytes(12).toString('hex'), email: 'front-e2e-' + suffix + '@example.com',
      examId: crypto.randomBytes(12).toString('hex'), title: 'Kiểm tra giao diện ' + suffix,
      password: crypto.randomBytes(18).toString('base64url'),
    };
    // Persist exact ownership before any database write, including interrupted creation.
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify(fixture), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const passwordHash = await bcrypt.hash(fixture.password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: fixture.managerId, email: fixture.managerEmail, passwordHash, fullName: 'Frontend test manager', role: 'EXAM_MANAGER' } });
      await tx.user.create({ data: { id: fixture.studentId, email: fixture.email, passwordHash, fullName: 'Frontend test student', role: 'STUDENT' } });
      await tx.exam.create({ data: { id: fixture.examId, managerId: fixture.managerId, title: fixture.title, durationMinutes: 15, status: 'PUBLISHED', publishedAt: new Date(), instructions: 'Chọn một đáp án cho mỗi câu.', questions: { create: [
        { content: 'Ngôn ngữ nào chạy trong trình duyệt?', position: 1, options: { create: [{ content: 'JavaScript', position: 0, isCorrect: true }, { content: 'Python', position: 1, isCorrect: false }] } },
        { content: 'Mã HTTP nào cho biết thành công?', position: 2, options: { create: [{ content: '404', position: 0, isCorrect: false }, { content: '200', position: 1, isCorrect: true }] } },
      ] } } });
    });
    console.log('Owned frontend test fixtures created.');
    return;
  }
  if (!fs.existsSync(manifest)) {
    if (command === 'cleanup') return;
    throw new Error('No owned fixture manifest.');
  }
  const owned = ownedFixture(JSON.parse(fs.readFileSync(manifest, 'utf8')));
  if (command === 'expire') {
    const attempt = await prisma.attempt.findUnique({ where: { id: process.argv[3] } });
    if (!attempt || attempt.userId !== owned.studentId || attempt.examId !== owned.examId || attempt.status !== 'IN_PROGRESS') throw new Error('Attempt is outside owned fixture or no longer running');
    const offset = process.argv[4] === undefined ? -1000 : Number(process.argv[4]);
    if (!Number.isFinite(offset) || Math.abs(offset) > 10000) throw new Error('Invalid expiry offset');
    const changed = await prisma.attempt.updateMany({ where: { id: attempt.id, userId: owned.studentId, examId: owned.examId, status: 'IN_PROGRESS' }, data: { deadlineAt: new Date(Date.now() + offset) } });
    if (changed.count !== 1) throw new Error('Owned attempt changed before its deadline could be updated.');
    console.log('Owned attempt deadline updated.');
    return;
  }
  if (command === 'verify-cancel') {
    const attempt = await prisma.attempt.findUnique({ where: { id: process.argv[3] }, include: { answers: true } });
    if (!attempt || attempt.userId !== owned.studentId || attempt.examId !== owned.examId || attempt.status !== 'CANCELLED' || !attempt.answers.length) throw new Error('Cancellation did not preserve owned answers');
    console.log('Cancellation preserves answers.');
    return;
  }
  if (command === 'cleanup') {
    const userIds = [owned.managerId, owned.studentId];
    await prisma.$transaction(async (tx) => {
      for (const [id, email] of [[owned.managerId, owned.managerEmail], [owned.studentId, owned.email]]) {
        const account = await tx.user.findUnique({ where: { id } });
        if (account && account.email !== email) throw new Error('Owned account identity changed; refusing cleanup.');
      }
      const exam = await tx.exam.findUnique({ where: { id: owned.examId } });
      if (exam && (exam.managerId !== owned.managerId || exam.title !== owned.title)) throw new Error('Owned exam identity changed; refusing cleanup.');
      const otherExams = await tx.exam.count({ where: { managerId: { in: userIds }, id: { not: owned.examId } } });
      if (otherExams) throw new Error('Unrelated exams reference the fixture; refusing cleanup.');
      const attempts = await tx.attempt.findMany({ where: { OR: [{ userId: { in: userIds } }, { examId: owned.examId }] }, select: { id: true, userId: true, examId: true } });
      if (attempts.some((attempt) => attempt.userId !== owned.studentId || attempt.examId !== owned.examId)) throw new Error('Unrelated attempts reference the fixture; refusing cleanup.');
      const attemptIds = attempts.map((attempt) => attempt.id);
      const questions = await tx.question.findMany({ where: { examId: owned.examId }, select: { id: true } });
      const questionIds = questions.map((question) => question.id);
      const options = await tx.option.findMany({ where: { questionId: { in: questionIds } }, select: { id: true } });
      const optionIds = options.map((option) => option.id);
      const foreignAnswers = await tx.attemptAnswer.count({ where: { OR: [
        { attemptId: { notIn: attemptIds }, OR: [{ questionId: { in: questionIds } }, { selectedOptionId: { in: optionIds } }] },
        { attemptId: { in: attemptIds }, OR: [{ questionId: { notIn: questionIds } }, { selectedOptionId: { notIn: optionIds } }] },
      ] } });
      if (foreignAnswers) throw new Error('Unrelated answers reference the fixture; refusing cleanup.');
      await tx.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
      await tx.option.deleteMany({ where: { id: { in: optionIds } } });
      await tx.question.deleteMany({ where: { id: { in: questionIds } } });
      await tx.exam.deleteMany({ where: { id: owned.examId } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    fs.unlinkSync(manifest);
    console.log('Owned frontend test data cleaned by exact IDs.');
    return;
  }
  throw new Error('Unknown fixture command');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
