import { useEffect, useState } from 'react'
import { FileText, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { classroomsApi, getClassroomErrorMessage } from '../api/classrooms'
import type { Classroom } from '../api/classrooms'
import { useAuth } from '../auth/useAuth'
import { getUserDisplayInfo } from '../utils/user-display'
import './ManagerExams.css'
import './StudentClassesPage.css'

export default function StudentClassesPage() {
  const { user } = useAuth()
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    void loadClassrooms()

    const onSync = () => {
      setTick((t) => t + 1)
      void loadClassrooms(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick((t) => t + 1)
        void loadClassrooms(true)
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('online-exam.profile.') || e.key.startsWith('online-exam.avatar.') || e.key.startsWith('online-exam.avatar-removed.')) {
        setTick((t) => t + 1)
        void loadClassrooms(true)
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
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function loadClassrooms(silent = false) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await classroomsApi.getJoined()
      setClassrooms(data)
    } catch (err) {
      if (!silent) setError(getClassroomErrorMessage(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function handleJoinClass(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    const password = joinPassword.trim()

    if (!code) {
      setJoinError('Vui lòng nhập mã lớp học.')
      return
    }
    if (!password) {
      setJoinError('Vui lòng nhập mật khẩu lớp học.')
      return
    }

    setJoinBusy(true)
    setJoinError('')
    try {
      const joined = await classroomsApi.join({ code, password })
      setShowJoinModal(false)
      setJoinCode('')
      setJoinPassword('')
      setNotice(`Tham gia lớp học "${joined.name}" thành công!`)
      await loadClassrooms()
    } catch (err) {
      setJoinError(getClassroomErrorMessage(err))
    } finally {
      setJoinBusy(false)
    }
  }

  const filtered = classrooms.filter((item) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    const teacher = getUserDisplayInfo(item.manager, user)
    return (
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      teacher.fullName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="exam-page student-classes-page">
      <header className="exam-page-heading">
        <div>
          <h1>Lớp học của tôi</h1>
          <p>Danh sách các lớp học bạn đã tham gia và đang học tập.</p>
        </div>
        <button
          type="button"
          className="button button-primary button-inline"
          onClick={() => {
            setShowJoinModal(true)
            setJoinError('')
          }}
        >
          Tham gia lớp học
        </button>
      </header>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      <div className="student-classes-toolbar">
        <label className="student-classes-search">
          Tìm kiếm lớp học
          <input
            type="search"
            placeholder="Nhập tên lớp, mã lớp hoặc giáo viên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="exam-panel" role="status">
          Đang tải danh sách lớp học…
        </p>
      ) : error ? (
        <section className="exam-panel">
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="button button-primary button-inline"
            onClick={() => void loadClassrooms()}
          >
            Thử lại
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <section className="exam-panel student-classes-empty">
          <h2>
            {search ? 'Không tìm thấy lớp học phù hợp' : 'Chưa tham gia lớp học nào'}
          </h2>
          <p>
            {search
              ? 'Hãy thử thay đổi từ khóa tìm kiếm.'
              : 'Nhập mã lớp và mật khẩu do giáo viên cung cấp để tham gia vào lớp học.'}
          </p>
          {!search && (
            <button
              type="button"
              className="button button-primary button-inline"
              onClick={() => {
                setShowJoinModal(true)
                setJoinError('')
              }}
            >
              Tham gia lớp học ngay
            </button>
          )}
        </section>
      ) : (
        <>
          <p className="exam-muted">{filtered.length} lớp học</p>
          <div className="student-classes-grid">
            {filtered.map((classroom) => {
              const teacherInfo = getUserDisplayInfo(classroom.manager, user)
              return (
                <article className="student-class-card" key={classroom.id}>
                  <div className="student-class-card-header">
                    <h2>{classroom.name}</h2>
                    <span className="student-class-code-badge">{classroom.code}</span>
                  </div>

                  <p className="student-class-card-desc">
                    {classroom.description || 'Chưa có mô tả cho lớp học này.'}
                  </p>

                  <div className="student-class-teacher-box">
                    <div className="student-class-teacher-avatar" aria-hidden="true">
                      {teacherInfo.avatar ? (
                        <img src={teacherInfo.avatar} alt={teacherInfo.fullName} />
                      ) : (
                        teacherInfo.initial
                      )}
                    </div>
                    <div className="student-class-teacher-info">
                      <span className="student-class-teacher-label">Giáo viên phụ trách</span>
                      <span className="student-class-teacher-name">
                        {teacherInfo.fullName}
                      </span>
                      {teacherInfo.email && (
                        <span className="student-class-teacher-email">
                          {teacherInfo.email}
                        </span>
                      )}
                    </div>
                  </div>

                <div className="student-class-stats">
                  <span className="student-class-stat-item">
                    <Users size={15} aria-hidden="true" />
                    {classroom.memberCount ?? 0} bạn học
                  </span>
                  <span className="student-class-stat-item">
                    <FileText size={15} aria-hidden="true" />
                    {classroom.examCount ?? 0} đề thi
                  </span>
                </div>

                <div className="student-class-actions">
                  <Link
                    to={`/classes/${classroom.id}`}
                    className="button button-primary button-inline"
                  >
                    Xem lớp học
                  </Link>
                </div>
              </article>
            )
          })}
          </div>
        </>
      )}

      {/* Join Classroom Modal */}
      {showJoinModal && (
        <div className="exam-dialog-backdrop">
          <section
            className="student-class-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-class-modal-title"
          >
            <h2 id="join-class-modal-title">Tham gia lớp học</h2>
            <form onSubmit={handleJoinClass}>
              <div className="student-class-form-fields">
                <label className="student-class-field">
                  Mã lớp học
                  <input
                    type="text"
                    required
                    maxLength={12}
                    placeholder="VD: AB12CD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    autoFocus
                  />
                </label>

                <label className="student-class-field">
                  Mật khẩu lớp học
                  <input
                    type="password"
                    required
                    placeholder="Nhập mật khẩu"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                  />
                </label>

                {joinError && (
                  <p className="form-error" role="alert">
                    {joinError}
                  </p>
                )}
              </div>

              <div className="student-class-modal-actions">
                <button
                  type="button"
                  className="button button-secondary button-inline"
                  onClick={() => setShowJoinModal(false)}
                  disabled={joinBusy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary button-inline"
                  disabled={joinBusy}
                >
                  {joinBusy ? 'Đang tham gia…' : 'Tham gia'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
