import { useEffect, useState } from 'react'
import { Clock3, FileText, HelpCircle, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { classroomsApi, getClassroomErrorMessage } from '../api/classrooms'
import type { Classroom, ClassroomExam, ClassroomMember } from '../api/classrooms'
import { examStatusLabels } from '../api/manager-exams'
import { useAuth } from '../auth/useAuth'
import { getUserDisplayInfo } from '../utils/user-display'
import './ManagerExams.css'
import './StudentClassDetailPage.css'

function formatDateTime(value?: string | null): string {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function StudentClassDetailPage() {
  const { user } = useAuth()
  const { classId = '' } = useParams()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [exams, setExams] = useState<ClassroomExam[]>([])
  const [members, setMembers] = useState<ClassroomMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeTab, setActiveTab] = useState<'exams' | 'members'>('exams')

  useEffect(() => {
    if (!classId) return
    void loadClassDetails()
  }, [classId])

  async function loadClassDetails() {
    setLoading(true)
    setError('')
    try {
      const [detailData, examsData, membersData] = await Promise.all([
        classroomsApi.getDetail(classId),
        classroomsApi.getExams(classId),
        classroomsApi.getMembers(classId),
      ])
      setClassroom(detailData)
      setExams(examsData)
      setMembers(membersData)
    } catch (err) {
      setError(getClassroomErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="exam-page student-class-detail-page">
        <p className="exam-panel" role="status">
          Đang tải thông tin lớp học…
        </p>
      </div>
    )
  }

  if (error || !classroom) {
    return (
      <div className="exam-page student-class-detail-page">
        <Link to="/classes" className="exam-back">
          Quay lại danh sách lớp
        </Link>
        <section className="exam-panel">
          <p className="form-error" role="alert">
            {error || 'Không tìm thấy lớp học.'}
          </p>
          <button
            type="button"
            className="button button-primary button-inline"
            onClick={loadClassDetails}
          >
            Thử lại
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="exam-page student-class-detail-page">
      <Link to="/classes" className="exam-back">
        Quay lại danh sách lớp
      </Link>

      {/* Header card */}
      <header className="student-class-detail-header">
        <div className="student-class-detail-top">
          <div className="student-class-detail-title-group">
            <h1>{classroom.name}</h1>
            <p className="student-class-detail-desc">
              {classroom.description || 'Chưa có mô tả cho lớp học này.'}
            </p>
          </div>
        </div>

        <div className="student-class-detail-stats">
          <div className="student-class-detail-stat-item">
            <span>Mã lớp:</span>
            <span className="student-class-code-badge">{classroom.code}</span>
          </div>

          <div className="student-class-detail-stat-item">
            <Users size={16} aria-hidden="true" />
            <span>Học sinh:</span>
            <strong>{members.length}</strong>
          </div>

          <div className="student-class-detail-stat-item">
            <FileText size={16} aria-hidden="true" />
            <span>Đề thi:</span>
            <strong>{exams.length}</strong>
          </div>
        </div>
      </header>

      {/* Tabs navigation */}
      <div className="student-class-tabs-nav" role="tablist" aria-label="Các mục của lớp học">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exams'}
          className={`student-class-tab-btn ${activeTab === 'exams' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          Đề thi của lớp ({exams.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'members'}
          className={`student-class-tab-btn ${activeTab === 'members' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Danh sách thành viên ({members.length})
        </button>
      </div>

      {/* Tab 1: Exams */}
      {activeTab === 'exams' && (
        <section className="student-class-tab-pane" aria-label="Đề thi của lớp">
          <div className="student-class-tab-toolbar">
            <h2>Đề thi của lớp ({exams.length})</h2>
          </div>

          {exams.length === 0 ? (
            <section className="exam-panel">
              <h2>Lớp học hiện chưa có đề thi nào</h2>
              <p>Khi giáo viên giao đề thi cho lớp, các đề thi sẽ hiển thị ở đây để bạn vào làm bài.</p>
            </section>
          ) : (
            <div className="student-class-exams-grid">
              {exams.map((exam) => (
                <article className="student-class-exam-card" key={exam.id}>
                  <div>
                    <span className="exam-badge">
                      {examStatusLabels[exam.status] || 'Đang mở'}
                    </span>
                  </div>

                  <h3>{exam.title}</h3>

                  <p>{exam.description || 'Chưa có mô tả cho đề thi này.'}</p>

                  <div className="student-class-exam-stats">
                    <span className="student-class-exam-stat-item">
                      <Clock3 size={15} aria-hidden="true" />
                      {exam.durationMinutes} phút
                    </span>
                    <span className="student-class-exam-stat-item">
                      <HelpCircle size={15} aria-hidden="true" />
                      {exam.totalQuestions ?? exam._count?.questions ?? '—'} câu hỏi
                    </span>
                  </div>

                  {(exam.opensAt || exam.closesAt) && (
                    <div className="student-class-exam-dates">
                      {exam.opensAt && <div>Mở: {formatDateTime(exam.opensAt)}</div>}
                      {exam.closesAt && <div>Đóng: {formatDateTime(exam.closesAt)}</div>}
                    </div>
                  )}

                  <div className="exam-actions">
                    <Link
                      to={`/exams/${exam.id}`}
                      className="button button-primary button-inline"
                    >
                      Vào làm bài
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Members */}
      {activeTab === 'members' && (
        <section className="student-class-tab-pane" aria-label="Danh sách thành viên">
          {/* Teacher section */}
          {(() => {
            const teacherInfo = getUserDisplayInfo(classroom.manager, user)
            return (
              <div className="student-class-members-section">
                <h3>Giáo viên quản lý</h3>
                <div className="student-class-members-list">
                  <div className="student-class-member-row">
                    <div className="student-class-member-info">
                      <div className="student-class-avatar avatar-teacher" aria-hidden="true">
                        {teacherInfo.avatar ? (
                          <img src={teacherInfo.avatar} alt={teacherInfo.fullName} />
                        ) : (
                          teacherInfo.initial
                        )}
                      </div>
                      <div className="student-class-member-text">
                        <span className="student-class-member-name">
                          {teacherInfo.fullName}
                        </span>
                        <span className="student-class-member-email">
                          {teacherInfo.email}
                        </span>
                      </div>
                    </div>

                    <div className="student-class-member-meta">
                      <span className="student-class-role-badge student-class-role-badge-teacher">
                        Giáo viên
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Fellow students section */}
          <div className="student-class-members-section">
            <h3>Học viên cùng lớp ({members.length})</h3>

            {members.length === 0 ? (
              <section className="exam-panel">
                <p className="exam-muted">Chưa có thành viên nào khác.</p>
              </section>
            ) : (
              <div className="student-class-members-list">
                {members.map((member) => {
                  const memberInfo = getUserDisplayInfo(member, user)
                  return (
                    <div className="student-class-member-row" key={member.id}>
                      <div className="student-class-member-info">
                        <div className="student-class-avatar avatar-student" aria-hidden="true">
                          {memberInfo.avatar ? (
                            <img src={memberInfo.avatar} alt={memberInfo.fullName} />
                          ) : (
                            memberInfo.initial
                          )}
                        </div>
                        <div className="student-class-member-text">
                          <span className="student-class-member-name">{memberInfo.fullName}</span>
                          <span className="student-class-member-email">{memberInfo.email}</span>
                        </div>
                      </div>

                      <div className="student-class-member-meta">
                        <span>Tham gia: {formatDateTime(member.joinedAt)}</span>
                        <span className="student-class-role-badge student-class-role-badge-student">
                          Học viên
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
