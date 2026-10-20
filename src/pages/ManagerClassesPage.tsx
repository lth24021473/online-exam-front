import { useEffect, useState } from 'react'
import { FileText, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { classroomsApi, getClassroomErrorMessage } from '../api/classrooms'
import type { Classroom } from '../api/classrooms'
import { useAuth } from '../auth/useAuth'
import './ManagerExams.css'
import './ManagerClassesPage.css'

export default function ManagerClassesPage() {
  const { user } = useAuth()
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')

  // Delete modal state
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
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
      const data = await classroomsApi.getManaged()
      setClassrooms(data)
    } catch (err) {
      if (!silent) setError(getClassroomErrorMessage(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function handleCopyInfo(classroom: Classroom) {
    const text = `Lớp học: ${classroom.name}\nMã lớp: ${classroom.code}\nMật khẩu: ${classroom.password || ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedClassId(classroom.id)
      setNotice(`Đã sao chép thông tin lớp "${classroom.name}"`)
      window.setTimeout(() => {
        setCopiedClassId((curr) => (curr === classroom.id ? null : curr))
      }, 2000)
    } catch {
      setNotice('Không thể sao chép vào bộ nhớ tạm.')
    }
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) {
      setCreateError('Vui lòng nhập tên lớp học.')
      return
    }
    if (!createPassword.trim()) {
      setCreateError('Vui lòng nhập mật khẩu lớp học.')
      return
    }

    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await classroomsApi.create({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        password: createPassword.trim(),
      })
      setShowCreateModal(false)
      setCreateName('')
      setCreateDescription('')
      setCreatePassword('')
      setNotice(`Đã tạo lớp học "${created.name}" thành công!`)
      await loadClassrooms()
    } catch (err) {
      setCreateError(getClassroomErrorMessage(err))
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleDeleteClass() {
    if (!classToDelete) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await classroomsApi.deleteClassroom(classToDelete.id)
      const name = classToDelete.name
      setClassToDelete(null)
      setNotice(`Đã xóa lớp học "${name}".`)
      await loadClassrooms()
    } catch (err) {
      setDeleteError(getClassroomErrorMessage(err))
    } finally {
      setDeleteBusy(false)
    }
  }

  const filtered = classrooms.filter((item) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return (
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    )
  })

  return (
    <div className="exam-page manager-page manager-classes-page">
      <header className="exam-page-heading">
        <div>
          <h1>Quản lý lớp học</h1>
          <p>
            {user?.role === 'ADMIN'
              ? 'Quản lý toàn bộ lớp học trên hệ thống.'
              : 'Tạo lớp học, phân phối đề thi và quản lý học sinh.'}
          </p>
        </div>
        <button
          type="button"
          className="button button-primary button-inline"
          onClick={() => {
            setShowCreateModal(true)
            setCreateError('')
          }}
        >
          Tạo lớp học mới
        </button>
      </header>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      <div className="manager-classes-toolbar">
        <label className="manager-classes-search">
          Tìm kiếm lớp học
          <input
            type="search"
            placeholder="Nhập tên lớp hoặc mã lớp..."
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
        <section className="exam-panel">
          <h2>
            {search ? 'Không tìm thấy lớp học phù hợp' : 'Chưa có lớp học nào'}
          </h2>
          <p>
            {search
              ? 'Hãy thử thay đổi từ khóa tìm kiếm.'
              : 'Hãy bắt đầu tạo lớp học đầu tiên để quản lý học sinh và đề thi.'}
          </p>
        </section>
      ) : (
        <>
          <p className="exam-muted">{filtered.length} lớp học</p>
          <div className="manager-classes-grid">
            {filtered.map((classroom) => (
              <article className="manager-class-card" key={classroom.id}>
                <div className="manager-class-card-header">
                  <h2>{classroom.name}</h2>
                </div>

                <p className="manager-class-card-desc">
                  {classroom.description || 'Chưa có mô tả cho lớp học này.'}
                </p>

                <div className="manager-class-creds-box">
                  <div className="manager-class-cred-row">
                    <span className="manager-class-cred-label">Mã lớp</span>
                    <span className="manager-class-code-badge">{classroom.code}</span>
                  </div>
                  <div className="manager-class-cred-row">
                    <span className="manager-class-cred-label">Mật khẩu</span>
                    <span className="manager-class-password-val">
                      {classroom.password || '—'}
                    </span>
                  </div>
                </div>

                <div className="manager-class-stats">
                  <span className="manager-class-stat-item">
                    <Users size={15} aria-hidden="true" />
                    {classroom.memberCount ?? 0} học sinh
                  </span>
                  <span className="manager-class-stat-item">
                    <FileText size={15} aria-hidden="true" />
                    {classroom.examCount ?? 0} đề thi
                  </span>
                </div>

                <div className="manager-class-actions">
                  <Link
                    to={`/manage/classes/${classroom.id}`}
                    className="button button-primary button-inline"
                  >
                    Xem chi tiết
                  </Link>
                  <div className="manager-class-actions-row">
                    <button
                      type="button"
                      className="button button-secondary button-inline"
                      onClick={() => void handleCopyInfo(classroom)}
                    >
                      {copiedClassId === classroom.id
                        ? 'Đã sao chép!'
                        : 'Sao chép thông tin lớp'}
                    </button>
                    <button
                      type="button"
                      className="button button-danger button-inline"
                      onClick={() => {
                        setClassToDelete(classroom)
                        setDeleteError('')
                      }}
                    >
                      Xóa lớp
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <div className="exam-dialog-backdrop">
          <section
            className="manager-class-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-class-modal-title"
          >
            <h2 id="create-class-modal-title">Tạo lớp học mới</h2>
            <form onSubmit={(e) => void handleCreateClass(e)}>
              <div className="manager-class-form-fields">
                <div className="manager-class-field">
                  <label htmlFor="create-class-name">Tên lớp học</label>
                  <input
                    id="create-class-name"
                    type="text"
                    required
                    placeholder="Ví dụ: Lớp Toán 12A1"
                    value={createName}
                    disabled={createBusy}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>

                <div className="manager-class-field">
                  <label htmlFor="create-class-desc">Mô tả (tùy chọn)</label>
                  <textarea
                    id="create-class-desc"
                    rows={3}
                    placeholder="Mô tả ngắn gọn về lớp học..."
                    value={createDescription}
                    disabled={createBusy}
                    onChange={(e) => setCreateDescription(e.target.value)}
                  />
                </div>

                <div className="manager-class-field">
                  <label htmlFor="create-class-password">Mật khẩu lớp</label>
                  <input
                    id="create-class-password"
                    type="text"
                    required
                    placeholder="Nhập mật khẩu cho học sinh tham gia..."
                    value={createPassword}
                    disabled={createBusy}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </div>
              </div>

              {createError && (
                <p className="form-error" role="alert" style={{ marginTop: '12px' }}>
                  {createError}
                </p>
              )}

              <div className="manager-class-modal-actions">
                <button
                  type="button"
                  className="button button-secondary button-inline"
                  disabled={createBusy}
                  onClick={() => setShowCreateModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary button-inline"
                  disabled={createBusy}
                >
                  {createBusy ? 'Đang tạo...' : 'Tạo lớp học'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {classToDelete && (
        <div className="exam-dialog-backdrop">
          <section
            className="manager-class-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-class-modal-title"
          >
            <h2 id="delete-class-modal-title">Xác nhận xóa lớp học</h2>
            <p>
              Bạn có chắc chắn muốn xóa lớp học{' '}
              <strong>&ldquo;{classToDelete.name}&rdquo;</strong>?
            </p>

            <div className="manager-class-delete-warning">
              Lưu ý: Lớp học chỉ có thể xóa khi chưa có đề thi hoặc bài làm nào của
              học sinh. Thao tác xóa không thể hoàn tác.
            </div>

            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="manager-class-modal-actions">
              <button
                type="button"
                className="button button-secondary button-inline"
                disabled={deleteBusy}
                onClick={() => {
                  setClassToDelete(null)
                  setDeleteError('')
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button button-danger button-inline"
                disabled={deleteBusy}
                onClick={() => void handleDeleteClass()}
              >
                {deleteBusy ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
