import { useEffect, useState } from 'react'
import { ArrowLeft, Clock3, FileText, HelpCircle, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { classroomsApi, getClassroomErrorMessage } from '../api/classrooms'
import type { Classroom, ClassroomExam, ClassroomMember } from '../api/classrooms'
import { examStatusLabels } from '../api/manager-exams'
import { useAuth } from '../auth/useAuth'
import { getUserDisplayInfo } from '../utils/user-display'
import './ManagerExams.css'
import './ManagerClassDetailPage.css'

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

export default function ManagerClassDetailPage() {
  const { user } = useAuth()
  const { classId = '' } = useParams()
  const navigate = useNavigate()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [exams, setExams] = useState<ClassroomExam[]>([])
  const [members, setMembers] = useState<ClassroomMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeTab, setActiveTab] = useState<'exams' | 'members'>('exams')
  const [notice, setNotice] = useState('')
  const [copiedInfo, setCopiedInfo] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Member removal modal state
  const [memberToDelete, setMemberToDelete] = useState<ClassroomMember | null>(null)
  const [removingMember, setRemovingMember] = useState(false)
  const [removeMemberError, setRemoveMemberError] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!classId) return
    void loadClassDetails()

    const onSync = () => {
      setTick((t) => t + 1)
      void loadClassDetails(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick((t) => t + 1)
        void loadClassDetails(true)
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('online-exam.profile.') || e.key.startsWith('online-exam.avatar.') || e.key.startsWith('online-exam.avatar-removed.')) {
        setTick((t) => t + 1)
        void loadClassDetails(true)
      }
    }

    window.addEventListener('focus', onSync)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online-exam:profile-updated', onSync)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('focus', onSync)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online-exam:profile-updated', onSync)
      window.removeEventListener('storage', onStorage)
    }
  }, [classId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function loadClassDetails(silent = false) {
    if (!silent) setLoading(true)
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
      if (!silent) setError(getClassroomErrorMessage(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function handleCopyInfo() {
    if (!classroom) return
    const text = `Lớp học: ${classroom.name}\nMã lớp: ${classroom.code}\nMật khẩu: ${classroom.password || ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedInfo(true)
      setNotice('Đã sao chép thông tin lớp học vào bộ nhớ tạm!')
      window.setTimeout(() => setCopiedInfo(false), 2000)
    } catch {
      setNotice('Không thể sao chép vào bộ nhớ tạm.')
    }
  }

  async function handleCopyCode() {
    if (!classroom) return
    try {
      await navigator.clipboard.writeText(classroom.code)
      setCopiedCode(true)
      setNotice(`Đã sao chép mã lớp: ${classroom.code}`)
      window.setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      setNotice('Không thể sao chép vào bộ nhớ tạm.')
    }
  }

  async function handleRemoveMember() {
    if (!memberToDelete || !classId) return
    setRemovingMember(true)
    setRemoveMemberError('')
    try {
      await classroomsApi.removeMember(classId, memberToDelete.userId)
      const removedName = memberToDelete.fullName
      setMemberToDelete(null)
      setNotice(`Đã xóa học sinh "${removedName}" khỏi lớp.`)
      // Refresh members and details
      const [detailData, membersData] = await Promise.all([
        classroomsApi.getDetail(classId),
        classroomsApi.getMembers(classId),
      ])
      setClassroom(detailData)
      setMembers(membersData)
    } catch (err) {
      setRemoveMemberError(getClassroomErrorMessage(err))
    } finally {
      setRemovingMember(false)
    }
  }

  if (loading) {
    return (
      <div className="exam-page manager-page manager-class-detail-page">
        <Link className="exam-back-link" to="/manage/classes">
          <ArrowLeft size={17} aria-hidden="true" />
          Quay lại danh sách lớp
        </Link>
        <p className="exam-panel" role="status">
          Đang tải thông tin lớp học…
        </p>
      </div>
    )
  }

  if (error || !classroom) {
    return (
      <div className="exam-page manager-page manager-class-detail-page">
        <Link className="exam-back-link" to="/manage/classes">
          <ArrowLeft size={17} aria-hidden="true" />
          Quay lại danh sách lớp
        </Link>
        <section className="exam-panel">
          <p className="form-error" role="alert">
            {error || 'Không tìm thấy lớp học.'}
          </p>
          <button
            type="button"
            className="button button-primary button-inline"
            onClick={() => void loadClassDetails()}
          >
            Thử lại
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="exam-page manager-page manager-class-detail-page">
      <Link className="exam-back-link" to="/manage/classes">
        <ArrowLeft size={17} aria-hidden="true" />
        Quay lại danh sách lớp
      </Link>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      {/* Header section */}
      <header className="manager-class-detail-header">
        <div className="manager-class-detail-top">
          <div className="manager-class-detail-title-group">
            <h1>{classroom.name}</h1>
            <p className="manager-class-detail-desc">
              {classroom.description || 'Chưa có mô tả cho lớp học này.'}
            </p>
          </div>

          <div className="manager-class-detail-actions">
            <button
              type="button"
              className="button button-primary button-inline"
              onClick={() => void handleCopyInfo()}
            >
              {copiedInfo ? 'Đã sao chép!' : 'Sao chép thông tin lớp'}
            </button>
            <button
              type="button"
              className="button button-secondary button-inline"
              onClick={() => void handleCopyCode()}
            >
              {copiedCode ? 'Đã sao chép!' : 'Sao chép mã lớp'}
            </button>
          </div>
        </div>

        <div className="manager-class-detail-creds">
          <div className="manager-class-detail-cred-item">
            <span className="manager-class-detail-cred-label">Mã lớp:</span>
            <span className="manager-class-code-badge">{classroom.code}</span>
          </div>

          <div className="manager-class-detail-cred-item">
            <span className="manager-class-detail-cred-label">Mật khẩu:</span>
            <span className="manager-class-password-val">
              {classroom.password || '—'}
            </span>
          </div>

          <div className="manager-class-detail-cred-item">
            <Users size={15} aria-hidden="true" />
            <span className="manager-class-detail-cred-label">Học sinh:</span>
            <strong>{members.length}</strong>
          </div>

          <div className="manager-class-detail-cred-item">
            <FileText size={15} aria-hidden="true" />
            <span className="manager-class-detail-cred-label">Đề thi:</span>
            <strong>{exams.length}</strong>
          </div>
        </div>
      </header>

      {/* Tabs Switcher */}
      <div className="manager-class-tabs-nav" role="tablist" aria-label="Các mục của lớp học">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exams'}
          className={`manager-class-tab-btn ${activeTab === 'exams' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          Đề thi của lớp ({exams.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'members'}
          className={`manager-class-tab-btn ${activeTab === 'members' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Danh sách thành viên ({members.length})
        </button>
      </div>

      {/* Tab 1: Exams */}
      {activeTab === 'exams' && (
        <section className="manager-class-tab-pane" aria-label="Đề thi của lớp">
          <div className="manager-class-tab-toolbar">
            <h2>Đề thi ({exams.length})</h2>
            <button
              type="button"
              className="button button-primary button-inline"
              onClick={() => navigate(`/manage/exams/create?classroomId=${classId}`)}
            >
              Tạo đề thi cho lớp
            </button>
          </div>

          {exams.length === 0 ? (
            <section className="exam-panel">
              <h2>Lớp học chưa có đề thi nào</h2>
              <p>Hãy bấm &ldquo;Tạo đề thi cho lớp&rdquo; để tạo và giao bài cho học sinh trong lớp này.</p>
            </section>
          ) : (
            <div className="manager-class-exams-grid">
              {exams.map((exam) => (
                <article className="manager-class-exam-card" key={exam.id}>
                  <div>
                    <span className="exam-badge">
                      {examStatusLabels[exam.status] || exam.status}
                    </span>
                  </div>

                  <h3>{exam.title}</h3>

                  <p>{exam.description || 'Chưa có mô tả.'}</p>

                  <div className="manager-class-stats">
                    <span className="manager-class-stat-item">
                      <Clock3 size={15} aria-hidden="true" />
                      {exam.durationMinutes} phút
                    </span>
                    <span className="manager-class-stat-item">
                      <HelpCircle size={15} aria-hidden="true" />
                      {exam.totalQuestions ?? exam._count?.questions ?? '—'} câu hỏi
                    </span>
                  </div>

                  {(exam.opensAt || exam.closesAt) && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {exam.opensAt && <div>Mở: {formatDateTime(exam.opensAt)}</div>}
                      {exam.closesAt && <div>Đóng: {formatDateTime(exam.closesAt)}</div>}
                    </div>
                  )}

                  <div className="exam-actions">
                    <Link
                      to={`/manage/exams/${exam.id}`}
                      className="button button-secondary button-inline"
                    >
                      Quản lý đề thi
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
        <section className="manager-class-tab-pane" aria-label="Danh sách thành viên">
          <div className="manager-class-tab-toolbar">
            <h2>Học sinh đã tham gia ({members.length})</h2>
          </div>

          {members.length === 0 ? (
            <section className="exam-panel">
              <h2>Chưa có học sinh nào tham gia lớp</h2>
              <p>
                Hãy gửi mã lớp <strong>{classroom.code}</strong> và mật khẩu lớp cho
                học sinh để họ có thể tham gia.
              </p>
            </section>
          ) : (
            <div className="manager-class-members-list">
              {members.map((member) => {
                const memberInfo = getUserDisplayInfo(member, user)
                return (
                  <div className="manager-class-member-row" key={member.id}>
                    <div className="manager-class-member-info">
                      <div className="manager-class-avatar" aria-hidden="true">
                        {memberInfo.avatar ? (
                          <img src={memberInfo.avatar} alt={memberInfo.fullName} />
                        ) : (
                          memberInfo.initial
                        )}
                      </div>
                      <div className="manager-class-member-text">
                        <span className="manager-class-member-name">{memberInfo.fullName}</span>
                        <span className="manager-class-member-email">{memberInfo.email}</span>
                      </div>
                    </div>

                    <div className="manager-class-member-meta">
                      <span>Tham gia: {formatDateTime(member.joinedAt)}</span>
                      <button
                        type="button"
                        className="button button-danger button-inline"
                        onClick={() => {
                          setMemberToDelete(member)
                          setRemoveMemberError('')
                        }}
                      >
                        Xóa khỏi lớp
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Remove Member Confirm Modal */}
      {memberToDelete && (
        <div className="exam-dialog-backdrop">
          <section
            className="manager-class-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-modal-title"
          >
            <h2 id="remove-member-modal-title">Xóa học sinh khỏi lớp</h2>
            <p>
              Bạn có chắc chắn muốn xóa học sinh{' '}
              <strong>&ldquo;{memberToDelete.fullName}&rdquo;</strong> khỏi lớp học?
            </p>

            <div className="manager-class-delete-warning">
              Học sinh sẽ không còn quyền truy cập vào lớp học này và các đề thi nội
              bộ của lớp.
            </div>

            {removeMemberError && (
              <p className="form-error" role="alert">
                {removeMemberError}
              </p>
            )}

            <div className="manager-class-modal-actions">
              <button
                type="button"
                className="button button-secondary button-inline"
                disabled={removingMember}
                onClick={() => {
                  setMemberToDelete(null)
                  setRemoveMemberError('')
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button button-danger button-inline"
                disabled={removingMember}
                onClick={() => void handleRemoveMember()}
              >
                {removingMember ? 'Đang xóa...' : 'Xóa khỏi lớp'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
