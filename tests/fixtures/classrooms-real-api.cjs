const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

if (process.env.CLASSROOMS_API_E2E !== '1' || !process.env.FRONT_CLASSROOMS_FIXTURE) {
  throw new Error('Use the classrooms real-test runner with its dedicated temporary manifest.');
}
const manifest = path.resolve(process.env.FRONT_CLASSROOMS_FIXTURE);
const backendRequire = createRequire(path.join(process.env.FRONT_BACKEND_DIR || path.resolve(__dirname, '../../../online-exam-api'), 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const databaseUrl = process.env.REAL_DATABASE_URL || 'mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true';
const parsed = new URL(databaseUrl);
if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password) {
  throw new Error('Real UI fixtures require the existing local MongoDB without remote credentials.');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

function identity(record, role) {
  if (!record || !/^[a-f\d]{24}$/.test(record.id) || !new RegExp('^front-classrooms-' + role + '-[a-f\\d-]+@example\\.com$').test(record.email)) {
    throw new Error('Invalid owned test identity.');
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'create') {
    if (fs.existsSync(manifest)) throw new Error('Existing fixture manifest must be cleaned first.');
    const suffix = crypto.randomUUID();
    const password = crypto.randomBytes(18).toString('base64url');
    const fixture = {
      kind: 'online-exam-classrooms-ui-owned-fixture',
      manager: { id: crypto.randomBytes(12).toString('hex'), email: 'front-classrooms-manager-' + suffix + '@example.com', fullName: 'Giáo viên Kiểm thử Lớp' },
      student: { id: crypto.randomBytes(12).toString('hex'), email: 'front-classrooms-student-' + suffix + '@example.com', fullName: 'Học sinh Kiểm thử Lớp' },
      password,
      className: 'Lớp Chuyên Toán 12',
      classDescription: 'Lớp ôn thi đại học môn Toán',
      classPassword: 'ToanMatKhau1@',
      examTitle: 'Kiểm tra đại số chương 1',
      apiUrl: process.env.FRONT_REAL_API_URL || 'http://localhost:3000/api/v1',
    };
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify(fixture), { encoding: 'utf8', mode: 0o600 });
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      for (const [role, record] of [['EXAM_MANAGER', fixture.manager], ['STUDENT', fixture.student]]) {
        await tx.user.create({ data: { ...record, passwordHash, role } });
      }
    });
    console.log('Two owned manager/student accounts created for classrooms UI workflow.');
    return;
  }
  if (command === 'cleanup') {
    if (!fs.existsSync(manifest)) return;
    const fixture = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (fixture.kind !== 'online-exam-classrooms-ui-owned-fixture') throw new Error('Unexpected fixture manifest.');
    identity(fixture.manager, 'manager');
    identity(fixture.student, 'student');
    const userIds = [fixture.manager.id, fixture.student.id];
    for (const record of [fixture.manager, fixture.student]) {
      const account = await prisma.user.findUnique({ where: { id: record.id } });
      if (account && account.email !== record.email) throw new Error('Owned account identity changed; refusing cleanup.');
    }
    await prisma.$transaction(async (tx) => {
      const classrooms = await tx.classroom.findMany({ where: { managerId: fixture.manager.id }, select: { id: true } });
      const classroomIds = classrooms.map((c) => c.id);

      const exams = await tx.exam.findMany({
        where: { OR: [{ managerId: fixture.manager.id }, { classroomId: { in: classroomIds } }] },
        select: { id: true },
      });
      const examIds = exams.map((exam) => exam.id);

      const attempts = await tx.attempt.findMany({
        where: { OR: [{ examId: { in: examIds } }, { userId: { in: userIds } }] },
        select: { id: true, examId: true, userId: true },
      });
      const attemptIds = attempts.map((attempt) => attempt.id);

      const questions = await tx.question.findMany({ where: { examId: { in: examIds } }, select: { id: true } });
      const questionIds = questions.map((question) => question.id);

      await tx.attemptAnswer.deleteMany({
        where: { OR: [{ attemptId: { in: attemptIds } }, { questionId: { in: questionIds } }] },
      });
      await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
      await tx.option.deleteMany({ where: { questionId: { in: questionIds } } });
      await tx.question.deleteMany({ where: { id: { in: questionIds } } });
      await tx.exam.deleteMany({ where: { id: { in: examIds } } });
      await tx.classroomMember.deleteMany({
        where: { OR: [{ classroomId: { in: classroomIds } }, { userId: { in: userIds } }] },
      });
      await tx.classroom.deleteMany({ where: { id: { in: classroomIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    fs.unlinkSync(manifest);
    console.log('Owned accounts, classrooms, members, exams, questions, options, attempts and answers cleaned by exact IDs.');
    return;
  }
  throw new Error('Expected create or cleanup.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
