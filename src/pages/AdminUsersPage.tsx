import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Search, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AuthRole, AuthUser } from '../api/auth.api'
import { adminUsersApi, getAdminErrorMessage } from '../api/admin-users'
import type { UpdatedAdminUser } from '../api/admin-users'
import { expireSession, getAccessToken } from '../api/axios'
import { useAuth } from '../auth/useAuth'
import { accountRoles, roleLabels } from '../auth/roles'
import './AdminUsersPage.css'

type LoadState<T> = { key: string; value: T } | { key: string; error: string }
const formatDate = (date: string) => Number.isFinite(Date.parse(date))
  ? new Date(date).toLocaleString('vi-VN')
  : '—'

function AdminUserDetail({ id, revision, currentUserId, onUpdate, onDelete, onBusy }: {
  id: string
  revision: number
  currentUserId: string
  onUpdate: (user: UpdatedAdminUser) => void
  onDelete: (id: string) => void
  onBusy: (busy: boolean) => void
}) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<LoadState<AuthUser> | null>(null)
  const [role, setRole] = useState<AuthRole>('STUDENT')
  const [confirmation, setConfirmation] = useState<'role' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null)
  const mutationLock = useRef(false)
  const confirmCancel = useRef<HTMLButtonElement>(null)
  const key = `${id}:${revision}`

  useEffect(() => {
    const controller = new AbortController()
    adminUsersApi.detail(id, controller.signal).then((account) => {
      if (!controller.signal.aborted) {
        setLoaded({ key, value: account })
        setRole(account.role)
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, error: getAdminErrorMessage(error) })
    })
    return () => controller.abort()
  }, [id, key])

  useEffect(() => {
    if (confirmation) confirmCancel.current?.focus()
  }, [confirmation])

  const current = loaded?.key === key ? loaded : null
  const account = current && 'value' in current ? current.value : null

  const finishOwnSession = (message: string, requestToken: string | null) => {
    // A delayed response from a previous login must not clear a newer session.
    if (!requestToken || getAccessToken() !== requestToken) return
    expireSession(message)
    navigate('/login', { replace: true })
  }

  async function confirmAction() {
    if (!account || !confirmation || mutationLock.current) return
    mutationLock.current = true
    const requestToken = getAccessToken()
    setBusy(true)
    onBusy(true)
    setFeedback(null)
    try {
      if (confirmation === 'role') {
        const updated = await adminUsersApi.updateRole(account.id, role)
        if (account.id === currentUserId) {
          finishOwnSession('Vai trò của bạn đã thay đổi. Vui lòng đăng nhập lại.', requestToken)
          return
        }
        setLoaded({ key, value: { ...account, ...updated } })
        setRole(updated.role)
        onUpdate(updated)
        setFeedback({ text: 'Đã cập nhật vai trò. Người dùng cần đăng nhập lại.' })
      } else {
        await adminUsersApi.remove(account.id)
        if (account.id === currentUserId) {
          finishOwnSession('Tài khoản của bạn đã được xóa.', requestToken)
          return
        }
        onDelete(account.id)
      }
      setConfirmation(null)
    } catch (error) {
      setConfirmation(null)
      setFeedback({ text: getAdminErrorMessage(error), error: true })
    } finally {
      mutationLock.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  return <section className="exam-panel admin-user-detail" aria-label="Chi tiết tài khoản" aria-busy={busy}>
    {!current ? <p role="status">Đang tải tài khoản…</p>
      : 'error' in current ? <p className="form-error" role="alert">{current.error}</p>
      : account && <>
        <p className="exam-eyebrow">THÔNG TIN TÀI KHOẢN</p>
        <h2>{account.fullName}</h2>
        <dl className="admin-user-facts">
          <div><dt>Email</dt><dd>{account.email}</dd></div>
          <div><dt>Vai trò hiện tại</dt><dd>{roleLabels[account.role]}</dd></div>
          <div><dt>Ngày tạo</dt><dd>{formatDate(account.createdAt)}</dd></div>
          <div><dt>Cập nhật</dt><dd>{formatDate(account.updatedAt)}</dd></div>
        </dl>
        {feedback && <p className={feedback.error ? 'form-error' : 'form-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        <form className="admin-role-form" onSubmit={(event) => {
          event.preventDefault()
          if (!busy && role !== account.role) { setFeedback(null); setConfirmation('role') }
        }}>
          <label htmlFor="admin-user-role">Vai trò</label>
          <select id="admin-user-role" value={role} disabled={busy || Boolean(confirmation)} onChange={(event) => {
            setRole(event.target.value as AuthRole)
            setFeedback(null)
          }}>
            {accountRoles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}
          </select>
          <button type="submit" className="button button-primary button-inline" disabled={busy || Boolean(confirmation) || role === account.role}>Lưu vai trò</button>
        </form>
        <p className="exam-muted admin-role-help">Đổi vai trò sẽ kết thúc các phiên đăng nhập hiện tại của tài khoản.</p>
        <button type="button" className="button button-danger button-inline" disabled={busy || Boolean(confirmation)} onClick={() => {
          setFeedback(null)
          setConfirmation('delete')
        }}><Trash2 size={17} aria-hidden="true" /> Xóa tài khoản</button>

        {confirmation && <section className="admin-confirm" role="dialog" aria-labelledby="admin-confirm-title" onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) setConfirmation(null)
        }}>
          <h3 id="admin-confirm-title">{confirmation === 'role' ? 'Đổi vai trò tài khoản?' : 'Xóa tài khoản?'}</h3>
          <p>{confirmation === 'role'
            ? `Đổi vai trò của ${account.email} thành ${roleLabels[role]}. Người dùng sẽ phải đăng nhập lại.`
            : `Xóa tài khoản ${account.email}. Thao tác này không thể hoàn tác.`}</p>
          {account.id === currentUserId && <p className="form-error">Đây là tài khoản bạn đang dùng. Bạn sẽ được đưa về trang đăng nhập.</p>}
          <div className="exam-actions">
            <button ref={confirmCancel} type="button" className="button button-secondary button-inline" disabled={busy} onClick={() => setConfirmation(null)}>{confirmation === 'role' ? 'Giữ nguyên' : 'Giữ tài khoản'}</button>
            <button type="button" className={`button button-inline ${confirmation === 'delete' ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={() => { void confirmAction() }}>{busy ? 'Đang xử lý…' : confirmation === 'role' ? 'Xác nhận đổi vai trò' : 'Xác nhận xóa'}</button>
          </div>
        </section>}
      </>}
  </section>
}

export default function AdminUsersPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('user') || ''
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<LoadState<AuthUser[]> | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const key = String(revision)

  useEffect(() => {
    const controller = new AbortController()
    adminUsersApi.list(controller.signal).then((accounts) => {
      if (!controller.signal.aborted) setLoaded({ key, value: accounts })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, error: getAdminErrorMessage(error) })
    })
    return () => controller.abort()
  }, [key])

  const current = loaded?.key === key ? loaded : null
  const accounts = current && 'value' in current ? current.value : null
  const needle = search.trim().toLocaleLowerCase('vi-VN')
  const filtered = accounts?.filter((account) => `${account.fullName} ${account.email}`.toLocaleLowerCase('vi-VN').includes(needle)) ?? []

  function select(id: string) {
    setNotice('')
    setSearchParams(id ? { user: id } : {})
  }

  function updateAccount(updated: UpdatedAdminUser) {
    setLoaded((previous) => previous && 'value' in previous
      ? { ...previous, value: previous.value.map((account) => account.id === updated.id ? { ...account, ...updated } : account) }
      : previous)
  }

  function deleteAccount(id: string) {
    setLoaded((previous) => previous && 'value' in previous
      ? { ...previous, value: previous.value.filter((account) => account.id !== id) }
      : previous)
    select('')
    setNotice('Đã xóa tài khoản.')
  }

  return <div className="exam-page admin-users-page">
    <header className="exam-page-heading">
      <div><h1>Quản lý tài khoản</h1><p>Xem người dùng, cập nhật vai trò và quản lý quyền truy cập.</p></div>
      <UsersRound size={35} aria-hidden="true" />
    </header>
    <div className="admin-toolbar">
      <label className="admin-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Tìm tài khoản</span><input type="search" value={search} placeholder="Tìm theo tên hoặc email" onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="button" className="button button-secondary button-inline" disabled={busy} onClick={() => {
        setNotice('')
        setRevision((value) => value + 1)
      }}><RefreshCw size={17} aria-hidden="true" /> Làm mới</button>
    </div>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!current ? <section className="exam-state-panel" role="status">Đang tải danh sách tài khoản…</section>
      : 'error' in current ? <section className="exam-state-panel"><p className="form-error" role="alert">{current.error}</p><button type="button" className="button button-primary button-inline" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></section>
      : <div className="admin-users-workspace">
        <section className="exam-panel admin-users-list" aria-label="Danh sách tài khoản">
          <p className="exam-muted">{filtered.length} / {accounts?.length ?? 0} tài khoản</p>
          {filtered.length === 0 ? <p>Không có tài khoản phù hợp.</p> : <ul>{filtered.map((account) => <li key={account.id}>
            <button type="button" className={selectedId === account.id ? 'is-selected' : ''} aria-label={`Xem ${account.email}`} aria-pressed={selectedId === account.id} disabled={busy} onClick={() => select(account.id)}>
              <span><strong>{account.fullName}</strong><span className="admin-user-email">{account.email}</span></span>
              <span className="admin-role-badge">{roleLabels[account.role]}</span>
            </button>
          </li>)}</ul>}
        </section>
        {selectedId && user ? <AdminUserDetail key={selectedId} id={selectedId} revision={revision} currentUserId={user.id} onUpdate={updateAccount} onDelete={deleteAccount} onBusy={setBusy} />
          : <section className="exam-panel admin-user-placeholder"><ShieldCheck size={34} aria-hidden="true" /><h2>Chọn một tài khoản</h2><p className="exam-muted">Xem thông tin và điều chỉnh vai trò trong danh sách bên cạnh.</p></section>}
      </div>}
  </div>
}
