import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, SubmitEvent } from 'react'
import { BookOpen, BriefcaseBusiness, CalendarDays, Camera, Check, ClipboardList, LogOut, Mail, MapPin, Moon, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { AuthUser } from '../api/auth.api'
import { useAuth } from '../auth/useAuth'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'
import { useProfileAvatar } from '../profile/useProfileAvatar'
import { useProfileCover } from '../profile/useProfileCover'
import { useAccountProfile } from '../profile/useAccountProfile'
import { useTheme } from '../theme/useTheme'
import './ProfilePage.css'

const tabs = [
  { id: 'about', label: 'Giới thiệu' },
  { id: 'classes', label: 'Lớp học' },
  { id: 'tasks', label: 'Nhiệm vụ' },
  { id: 'edit', label: 'Chỉnh sửa tài khoản' },
  { id: 'settings', label: 'Cài đặt' },
] as const

type ProfileTab = typeof tabs[number]['id']

function Avatar({ avatar, fullName }: { avatar: string | null; fullName: string }) {
  const initials = fullName.trim().split(/\s+/).slice(-2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase('vi-VN') || '?'
  return (
    <div className="account-avatar">
      {avatar ? <img src={avatar} alt={`Ảnh đại diện của ${fullName}`} /> : (
        <span className="account-avatar-initials" role="img" aria-label={`Ảnh đại diện của ${fullName}`}>{initials}</span>
      )}
    </div>
  )
}

function ProfileContent({ user, logout }: { user: AuthUser; logout: () => Promise<void> }) {
  const { profile, saveProfile } = useAccountProfile()
  const fullName = profile.fullName
  const [draft, setDraft] = useState(profile)
  const [editError, setEditError] = useState('')
  const [editNotice, setEditNotice] = useAutoDismissNotice()
  const { isDarkMode, toggleTheme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const [signingOut, setSigningOut] = useState(false)
  const { avatar, saving, error, notice, updateAvatar, removeAvatar } = useProfileAvatar(user.id)
  const { cover, saving: savingCover, error: coverError, notice: coverNotice, updateCover, removeCover } = useProfileCover(user.id)
  const requestedTab = searchParams.get('tab')
  const activeTab: ProfileTab = tabs.find((tab) => tab.id === requestedTab)?.id ?? 'about'
  const role = user.role === 'EXAM_MANAGER' ? 'Quản lý đề thi' : 'Học viên'
  const joined = new Date(user.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  useEffect(() => {
    function keepActiveTabVisible() {
      const selected = tabRefs.current[tabs.findIndex((tab) => tab.id === activeTab)]
      const bar = selected?.parentElement
      if (!selected || !bar) return
      const buttonBounds = selected.getBoundingClientRect()
      const barBounds = bar.getBoundingClientRect()
      // Bounds include the page zoom, while scrollLeft uses unscaled CSS pixels.
      const scale = barBounds.width / bar.offsetWidth || 1
      if (buttonBounds.left < barBounds.left) bar.scrollLeft += (buttonBounds.left - barBounds.left) / scale
      else if (buttonBounds.right > barBounds.right) bar.scrollLeft += (buttonBounds.right - barBounds.right) / scale
    }
    keepActiveTabVisible()
    window.addEventListener('resize', keepActiveTabVisible)
    return () => window.removeEventListener('resize', keepActiveTabVisible)
  }, [activeTab])

  function selectTab(tab: ProfileTab) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('tab', tab)
      return next
    })
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % tabs.length; break
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break
      case 'Home': next = 0; break
      case 'End': next = tabs.length - 1; break
      default: return
    }
    event.preventDefault()
    selectTab(tabs[next].id)
    tabRefs.current[next]?.focus()
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) await updateAvatar(file)
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) await updateCover(file)
  }

  function handleProfileSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditError('')
    setEditNotice('')
    try {
      setDraft(saveProfile(draft))
      setEditNotice('Đã lưu thay đổi tài khoản.')
    } catch (failure) {
      setEditError(failure instanceof Error ? failure.message : 'Không thể lưu thông tin tài khoản. Vui lòng thử lại.')
    }
  }

  function cancelProfileChanges() {
    setDraft(profile)
    setEditError('')
    setEditNotice('')
  }

  async function handleLogout() {
    setSigningOut(true)
    try { await logout() } finally { setSigningOut(false) }
  }

  return (
    <div className="account-profile">
      <header className="account-profile-header">
        <div className="account-cover">
          <img src={cover ?? '/images/study-background.jpg'} alt={`Ảnh bìa của ${fullName}`} />
        </div>
        <div className="account-identity">
          <div className="account-avatar-shell">
            <Avatar avatar={avatar} fullName={fullName} />
            <button className="account-avatar-camera" type="button" aria-label="Đổi ảnh đại diện"
              disabled={saving} onClick={() => fileInput.current?.click()}>
              <Camera size={23} aria-hidden="true" />
            </button>
          </div>
          <div className="account-name">
            <h1>{fullName}</h1>
            <p><span className="account-role-dot" />{role}<span className="account-meta-divider">•</span>Tham gia {joined}</p>
          </div>
        </div>
        <div className="account-tab-bar" role="tablist" aria-label="Thông tin tài khoản">
          {tabs.map((tab, index) => (
            <button key={tab.id} id={`profile-tab-${tab.id}`} type="button" role="tab"
              ref={(element) => { tabRefs.current[index] = element }}
              className={`account-tab${activeTab === tab.id ? ' is-active' : ''}`}
              aria-selected={activeTab === tab.id} aria-controls={`profile-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKey(event, index)}>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" ref={fileInput}
        aria-label="Chọn ảnh đại diện" disabled={saving} onChange={handleAvatarChange} tabIndex={-1} />
      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" ref={coverInput}
        aria-label="Chọn ảnh bìa" disabled={savingCover} onChange={handleCoverChange} tabIndex={-1} />

      <div className="account-content">
        {coverError && <p className="account-feedback account-feedback-error" role="alert">{coverError}</p>}
        {coverNotice && <p className="account-feedback account-feedback-success" role="status"><Check size={18} aria-hidden="true" />{coverNotice}</p>}
        {error && <p className="account-feedback account-feedback-error" role="alert">{error}</p>}
        {notice && <p className="account-feedback account-feedback-success" role="status"><Check size={18} aria-hidden="true" />{notice}</p>}

        <section id="profile-panel-about" role="tabpanel" aria-labelledby="profile-tab-about" hidden={activeTab !== 'about'} tabIndex={0}>
          <div className="account-about-grid">
            <article className="account-card">
              <h2>Giới thiệu</h2>
              <p className="account-card-description">Thông tin tài khoản của bạn.</p>
              <dl className="account-details">
                <div><dt><UsersRound size={17} aria-hidden="true" />Họ và tên</dt><dd>{fullName}</dd></div>
                <div><dt><Mail size={17} aria-hidden="true" />Email</dt><dd>{user.email}</dd></div>
                <div><dt><BriefcaseBusiness size={17} aria-hidden="true" />Nơi làm việc</dt><dd>{profile.workplace || 'Chưa cập nhật'}</dd></div>
                <div><dt><MapPin size={17} aria-hidden="true" />Nơi ở hiện tại</dt><dd>{profile.currentResidence || 'Chưa cập nhật'}</dd></div>
                <div><dt><ShieldCheck size={17} aria-hidden="true" />Vai trò</dt><dd>{role}</dd></div>
                <div><dt><CalendarDays size={17} aria-hidden="true" />Ngày tham gia</dt><dd>{joined}</dd></div>
              </dl>
            </article>
            <article className="account-card account-learning-card">
              <span className="account-card-icon"><BookOpen size={27} aria-hidden="true" /></span>
              <h2>Cùng học, cùng tiến bộ</h2>
              <p className="account-card-description">Một nơi để xem lớp học, theo dõi nhiệm vụ và quản lý tài khoản của bạn.</p>
              <div className="account-shortcuts">
                <button type="button" onClick={() => selectTab('classes')}><UsersRound size={20} aria-hidden="true" /><span>Lớp học của tôi</span><span aria-hidden="true">→</span></button>
                <button type="button" onClick={() => selectTab('tasks')}><ClipboardList size={20} aria-hidden="true" /><span>Nhiệm vụ của tôi</span><span aria-hidden="true">→</span></button>
              </div>
            </article>
          </div>
        </section>

        <section id="profile-panel-classes" role="tabpanel" aria-labelledby="profile-tab-classes" hidden={activeTab !== 'classes'} tabIndex={0}>
          <div className="account-card">
            <h2>Lớp học</h2>
            <div className="account-empty-state">
              <span className="account-card-icon"><UsersRound size={35} aria-hidden="true" /></span>
              <h3>Chưa có lớp học để hiển thị</h3>
              <p>Các lớp học của bạn sẽ xuất hiện tại đây khi có dữ liệu.</p>
            </div>
          </div>
        </section>

        <section id="profile-panel-tasks" role="tabpanel" aria-labelledby="profile-tab-tasks" hidden={activeTab !== 'tasks'} tabIndex={0}>
          <div className="account-card">
            <h2>Nhiệm vụ</h2>
            <div className="account-empty-state">
              <span className="account-card-icon"><ClipboardList size={35} aria-hidden="true" /></span>
              <h3>Chưa có nhiệm vụ để hiển thị</h3>
              <p>Khi có nhiệm vụ được giao, bạn có thể theo dõi tại đây.</p>
            </div>
          </div>
        </section>

        <section id="profile-panel-edit" role="tabpanel" aria-labelledby="profile-tab-edit" hidden={activeTab !== 'edit'} tabIndex={0}>
          <div className="account-card account-edit-card">
            <h2>Chỉnh sửa tài khoản</h2>
            <p className="account-card-description">Cập nhật thông tin hiển thị và hình ảnh của bạn.</p>
            <form className="account-edit-form" onSubmit={handleProfileSave} noValidate>
              <div className="account-edit-fields">
                <div className="account-edit-field account-edit-name">
                  <label htmlFor="profile-name">Tên tài khoản</label>
                  <input id="profile-name" name="fullName" autoComplete="name" maxLength={100} required
                    value={draft.fullName} onChange={(event) => { setDraft({ ...draft, fullName: event.currentTarget.value }); setEditNotice('') }} />
                </div>
                <div className="account-edit-field">
                  <label htmlFor="profile-workplace">Nơi làm việc</label>
                  <input id="profile-workplace" name="workplace" autoComplete="organization" maxLength={150}
                    placeholder="Nhập nơi làm việc" value={draft.workplace}
                    onChange={(event) => { setDraft({ ...draft, workplace: event.currentTarget.value }); setEditNotice('') }} />
                </div>
                <div className="account-edit-field">
                  <label htmlFor="profile-residence">Nơi ở hiện tại</label>
                  <input id="profile-residence" name="currentResidence" autoComplete="address-level2" maxLength={150}
                    placeholder="Nhập nơi ở hiện tại" value={draft.currentResidence}
                    onChange={(event) => { setDraft({ ...draft, currentResidence: event.currentTarget.value }); setEditNotice('') }} />
                </div>
              </div>
              {editError && <p className="account-feedback account-feedback-error" role="alert">{editError}</p>}
              {editNotice && <p className="account-feedback account-feedback-success" role="status"><Check size={18} aria-hidden="true" />{editNotice}</p>}
              <div className="account-edit-actions">
                <button className="account-action-button account-action-primary" type="submit"><Save size={17} aria-hidden="true" />Lưu thay đổi</button>
                <button className="account-action-button" type="button" onClick={cancelProfileChanges}>Hủy thay đổi</button>
              </div>
            </form>
            <div className="account-edit-media">
              <div className="account-edit-image-section">
                <h3>Ảnh đại diện</h3>
                <div className="account-avatar-preview">
                  <Avatar avatar={avatar} fullName={fullName} />
                </div>
                <div className="account-settings-actions">
                  <button className="account-action-button account-action-primary" type="button" disabled={saving} onClick={() => fileInput.current?.click()}>
                    <Camera size={17} aria-hidden="true" />{saving ? 'Đang lưu ảnh…' : 'Chỉnh sửa ảnh đại diện'}
                  </button>
                  {avatar && <button className="account-action-button" type="button" disabled={saving} onClick={removeAvatar}><Trash2 size={17} aria-hidden="true" />Xóa ảnh đại diện</button>}
                </div>
              </div>
              <div className="account-edit-image-section">
                <h3>Ảnh bìa</h3>
                <div className="account-cover-preview">
                  <img src={cover ?? '/images/study-background.jpg'} alt={`Bản xem trước ảnh bìa của ${fullName}`} />
                </div>
                <div className="account-settings-actions">
                  <button className="account-action-button account-action-primary" type="button" disabled={savingCover} onClick={() => coverInput.current?.click()}>
                    <Camera size={17} aria-hidden="true" />{savingCover ? 'Đang lưu ảnh…' : 'Chọn ảnh bìa mới'}
                  </button>
                  {cover && <button className="account-action-button" type="button" disabled={savingCover} onClick={removeCover}><Trash2 size={17} aria-hidden="true" />Xóa ảnh bìa</button>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="profile-panel-settings" role="tabpanel" aria-labelledby="profile-tab-settings" hidden={activeTab !== 'settings'} tabIndex={0}>
          <div className="account-card account-settings-card">
            <h2>Cài đặt tài khoản</h2>
            <div className="account-settings-section">
              <h3>Giao diện</h3>
              <div className="account-theme-setting">
                <span className="account-theme-icon"><Moon size={23} aria-hidden="true" /></span>
                <div className="account-theme-copy">
                  <p id="dark-mode-label">Chế độ tối</p>
                </div>
                <button className="account-theme-switch" type="button" role="switch"
                  aria-checked={isDarkMode} aria-labelledby="dark-mode-label"
                  onClick={toggleTheme}>
                  <span className="account-theme-switch-thumb" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="account-settings-section">
              <h3>Tài khoản</h3>
              <p className="account-settings-email">{user.email}</p>
              <button className="account-action-button" type="button" disabled={signingOut} onClick={handleLogout}>
                <LogOut size={17} aria-hidden="true" />{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất tài khoản'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  if (!user) return null
  return <ProfileContent key={user.id} user={user} logout={logout} />
}
