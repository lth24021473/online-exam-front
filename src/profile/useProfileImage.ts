import { useRef, useState } from 'react'
import { useAutoDismissNotice } from '../hooks/useAutoDismissNotice'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxFileSize = 2 * 1024 * 1024
const dataUrlPattern = /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function isImageDataUrl(value: string | null): value is string {
  return Boolean(value && !value.endsWith(',') && dataUrlPattern.test(value))
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
      if (typeof result === 'string' && isImageDataUrl(result)) resolve(result)
      else reject(new Error(kind === 'cover'
        ? 'Tệp ảnh bìa không hợp lệ. Vui lòng chọn ảnh PNG, JPG hoặc WebP khác.'
        : 'Tệp ảnh không hợp lệ. Vui lòng chọn ảnh PNG, JPG hoặc WebP khác.'))
    }
    reader.readAsDataURL(file)
  })
}

export function useProfileImage(userId: string, kind: 'avatar' | 'cover') {
  const storageKey = `online-exam.${kind}.${userId}`
  const imageLabel = kind === 'avatar' ? 'Ảnh đại diện' : 'Ảnh bìa'
  const [image, setImage] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return isImageDataUrl(stored) ? stored : null
    } catch {
      return null
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useAutoDismissNotice()
  const updating = useRef(false)

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
      } catch (storageFailure) {
        throw new Error(storageError(storageFailure), { cause: storageFailure })
      }
      setImage(dataUrl)
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
      setImage(null)
      setNotice(`${imageLabel} đã được xóa trên trình duyệt này.`)
    } catch (storageFailure) {
      setError(storageError(storageFailure))
    }
  }

  return { image, saving, error, notice, updateImage, removeImage }
}
