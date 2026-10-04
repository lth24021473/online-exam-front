const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
if (process.env.REAL_API_E2E !== '1') throw new Error('Set REAL_API_E2E=1 to run database fixtures');
const backendRoot = process.env.FRONT_BACKEND_DIR || path.resolve(__dirname, '../../../online-exam-api');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const output = path.resolve(process.env.FRONT_REAL_FIXTURE || path.join(__dirname, '../../.local/real-fixture.json'));
const prisma = new PrismaClient({ datasources: { db: { url: process.env.REAL_DATABASE_URL || 'mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true' } } });
async function main() {
  const command = process.argv[2];
  if (command === 'create') {
    if (fs.existsSync(output)) throw new Error('Existing owned fixture must be cleaned before creating another');
    const suffix = Date.now().toString(36);
    const password = 'FrontendTest123!';
    const email = `front-e2e-${suffix}@example.com`;
    const passwordHash = await bcrypt.hash(password, 10);
    const manager = await prisma.user.create({ data: { email: `front-manager-${suffix}@example.com`, passwordHash, fullName: 'Frontend test manager', role: 'EXAM_MANAGER' } });
    const student = await prisma.user.create({ data: { email, passwordHash, fullName: 'Frontend test student', role: 'STUDENT' } });
    const title = `Kiểm tra giao diện ${suffix}`;
    const exam = await prisma.exam.create({ data: { managerId: manager.id, title, durationMinutes: 15, status: 'PUBLISHED', publishedAt: new Date(), instructions: 'Chọn một đáp án cho mỗi câu.', questions: { create: [
      { content: 'Ngôn ngữ nào chạy trong trình duyệt?', position: 1, options: { create: [{ content: 'JavaScript', position: 0, isCorrect: true }, { content: 'Python', position: 1, isCorrect: false }] } },
      { content: 'Mã HTTP nào cho biết thành công?', position: 2, options: { create: [{ content: '404', position: 0, isCorrect: false }, { content: '200', position: 1, isCorrect: true }] } },
    ] } } });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ examId: exam.id, managerId: manager.id, studentId: student.id, email, password, title }, null, 2));
    console.log('Owned frontend test fixtures created.');
    return;
  }
  if (!fs.existsSync(output)) throw new Error('No owned fixture manifest');
  const owned = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (command === 'expire') {
    const attempt = await prisma.attempt.findUnique({ where: { id: process.argv[3] } });
    if (!attempt || attempt.userId !== owned.studentId || attempt.examId !== owned.examId || attempt.status !== 'IN_PROGRESS') throw new Error('Attempt is outside owned fixture or no longer running');
    const offset = process.argv[4] === undefined ? -1000 : Number(process.argv[4]);
    if (!Number.isFinite(offset) || Math.abs(offset) > 10000) throw new Error('Invalid expiry offset');
    await prisma.attempt.update({ where: { id: attempt.id }, data: { deadlineAt: new Date(Date.now() + offset) } });
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
    const attempts = await prisma.attempt.findMany({ where: { userId: owned.studentId, examId: owned.examId }, select: { id: true } });
    const questions = await prisma.question.findMany({ where: { examId: owned.examId }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: { in: attempts.map((item) => item.id) } } });
      await tx.attempt.deleteMany({ where: { id: { in: attempts.map((item) => item.id) } } });
      await tx.option.deleteMany({ where: { questionId: { in: questions.map((item) => item.id) } } });
      await tx.question.deleteMany({ where: { id: { in: questions.map((item) => item.id) } } });
      await tx.exam.delete({ where: { id: owned.examId } });
      await tx.user.deleteMany({ where: { id: { in: [owned.studentId, owned.managerId] } } });
    });
    fs.unlinkSync(output);
    console.log('Owned frontend test data cleaned.');
    return;
  }
  throw new Error('Unknown fixture command');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
