import { useEffect, useRef, useState } from 'react'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'
import { authApi } from '../api/auth.api'
import { useAuth } from '../auth/useAuth'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxFileSize = 2 * 1024 * 1024

function isValidImageSource(value: string | null): value is string {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
}

function storageError(error: unknown) {
  const isQuotaError = error instanceof DOMException &&
    ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name)
  return isQuotaError
    ? 'Bộ nhớ trình duyệt đã đầy. Hãy chọn ảnh nhỏ hơn hoặc giải phóng bộ nhớ rồi thử lại.'
    : 'Không thể lưu ảnh trên trình duyệt này. Vui lòng kiểm tra quyền lưu trữ rồi thử lại.'
}

function readImage(file: File, kind: 'avatar' | 'cover'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(kind === 'cover'
      ? 'Không thể đọc ảnh bìa. Vui lòng chọn lại tệp.'
      : 'Không thể đọc ảnh. Vui lòng chọn lại tệp.'))
    reader.onabort = () => reject(new Error(kind === 'cover'
      ? 'Đọc ảnh bìa bị gián đoạn. Vui lòng thử lại.'
      : 'Đọc ảnh bị gián đoạn. Vui lòng thử lại.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string' && isValidImageSource(result)) resolve(result)
      else reject(new Error(kind === 'cover'
        ? 'Tệp ảnh bìa không hợp lệ. Vui lòng chọn ảnh PNG, JPG hoặc WebP khác.'
        : 'Tệp ảnh không hợp lệ. Vui lòng chọn ảnh PNG, JPG hoặc WebP khác.'))
    }
    reader.readAsDataURL(file)
  })
}

export function useProfileImage(userId: string, kind: 'avatar' | 'cover', initialUrl?: string | null) {
  const { updateUser } = useAuth()
  const storageKey = `online-exam.${kind}.${userId}`
  const imageLabel = kind === 'avatar' ? 'Ảnh đại diện' : 'Ảnh bìa'
  const [image, setImage] = useState<string | null>(() => {
    try {
      if (initialUrl !== undefined) {
        if (isValidImageSource(initialUrl)) return initialUrl
        if (initialUrl === null) return null
      }
      const stored = localStorage.getItem(storageKey)
      if (isValidImageSource(stored)) return stored
      return null
    } catch {
      return initialUrl ?? null
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useAutoDismissNotice()
  const updating = useRef(false)


  useEffect(() => {
    if (initialUrl !== undefined) {
      setImage(initialUrl)
      try {
        if (initialUrl) {
          localStorage.setItem(storageKey, initialUrl)
        } else {
          localStorage.removeItem(storageKey)
        }
      } catch {
        // ignore storage error
      }
    }
  }, [initialUrl, storageKey])

  async function updateImage(file: File) {
    setError('')
    setNotice('')
    if (updating.current) return
    if (!allowedTypes.has(file.type)) {
      setError(kind === 'cover'
        ? 'Vui lòng chọn ảnh bìa PNG, JPG hoặc WebP.'
        : 'Vui lòng chọn ảnh PNG, JPG hoặc WebP.')
      return
    }
    if (file.size > maxFileSize) {
      setError(`${imageLabel} phải có dung lượng tối đa 2 MB.`)
      return
    }

    updating.current = true
    setSaving(true)
    try {
      if (typeof FileReader === 'undefined' || typeof Image === 'undefined') {
        throw new Error('Trình duyệt này chưa hỗ trợ đọc ảnh. Vui lòng thử bằng trình duyệt khác.')
      }
      const dataUrl = await readImage(file, kind)
      const decodedImage = new Image()
      if (typeof decodedImage.decode !== 'function') {
        throw new Error('Trình duyệt này chưa hỗ trợ kiểm tra ảnh. Vui lòng thử bằng trình duyệt khác.')
      }
      decodedImage.src = dataUrl
      try {
        await decodedImage.decode()
      } catch {
        throw new Error(kind === 'cover'
          ? 'Ảnh bìa bị lỗi hoặc không hợp lệ. Vui lòng chọn ảnh khác.'
          : 'Ảnh bị lỗi hoặc không hợp lệ. Vui lòng chọn ảnh khác.')
      }
      try {
        localStorage.setItem(storageKey, dataUrl)
        if (kind === 'avatar') {
          localStorage.removeItem(`online-exam.avatar-removed.${userId}`)
        }
      } catch (storageFailure) {
        const isQuotaError = storageFailure instanceof DOMException &&
          ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(storageFailure.name)
        if (!isQuotaError) {
          throw new Error(storageError(storageFailure), { cause: storageFailure })
        }
      }
      setImage(dataUrl)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
          detail: { userId, kind, value: dataUrl }
        }))
      }
      try {
        const updatedUser = await authApi.updateProfile({ [kind]: dataUrl })
        if (updatedUser) {
          updateUser(updatedUser)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
              detail: { userId, kind, user: updatedUser }
            }))
          }
        }
      } catch {
        // Background sync tolerance
      }
      setNotice(`${imageLabel} đã được lưu trên trình duyệt này.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `Không thể cập nhật ${imageLabel.toLowerCase()}. Vui lòng thử lại.`)
    } finally {
      updating.current = false
      setSaving(false)
    }
  }

  function removeImage() {
    setError('')
    setNotice('')
    if (updating.current) return
    try {
      localStorage.removeItem(storageKey)
      if (kind === 'avatar') {
        localStorage.setItem(`online-exam.avatar-removed.${userId}`, String(Date.now()))
      }
      setImage(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
          detail: { userId, kind, value: null }
        }))
      }
      authApi.updateProfile({ [kind]: null }).then((updatedUser) => {
        if (updatedUser) {
          updateUser(updatedUser)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('online-exam:profile-updated', {
              detail: { userId, kind, user: updatedUser }
            }))
          }
        }
      }).catch(() => {
        // Sync in background
      })
      setNotice(`${imageLabel} đã được xóa trên trình duyệt này.`)
    } catch (storageFailure) {
      setError(storageError(storageFailure))
    }
  }

  return { image, saving, error, notice, updateImage, removeImage }
}
