import { useCallback, useEffect, useRef, useState } from 'react'
import { attemptsApi } from '../api/attempts'
import type { ViolationType } from '../api/attempts'

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  TAB_SWITCH: 'Chuyển tab hoặc rời giao diện thi',
  FULLSCREEN_EXIT: 'Thoát chế độ toàn màn hình',
  DEVTOOLS_OPEN: 'Thao tác mở công cụ DevTools (F12)',
  CLIPBOARD_ACTION: 'Thao tác sao chép / dán phím tắt',
  MULTIPLE_FACES: 'Phát hiện nhiều hơn một khuôn mặt',
  NO_FACE_DETECTED: 'Không tìm thấy khuôn mặt trong khung hình',
}

export interface LatestViolation {
  type: ViolationType
  label: string
  detail?: string
  count: number
  maxViolations: number
}

export interface UseExamProctoringOptions {
  attemptId?: string
  enabled?: boolean
  maxViolations?: number
  initialViolationCount?: number
  isActive: boolean
  onTerminate: () => void
}

export function useExamProctoring({
  attemptId,
  enabled = true,
  maxViolations = 3,
  initialViolationCount = 0,
  isActive,
  onTerminate,
}: UseExamProctoringOptions) {
  const [violationCount, setViolationCount] = useState(initialViolationCount)
  const [isWarningOpen, setIsWarningOpen] = useState(false)
  const [latestViolation, setLatestViolation] = useState<LatestViolation | null>(null)
  const [isTerminated, setIsTerminated] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))

  const lastRecordedAt = useRef<Record<string, number>>({})
  const terminatingRef = useRef(false)
  const activatedAt = useRef<number | null>(null)

  useEffect(() => {
    if (isActive) {
      if (!activatedAt.current) {
        activatedAt.current = Date.now()
      }
    } else {
      activatedAt.current = null
    }
  }, [isActive])

  const record = useCallback(
    async (type: ViolationType, detail?: string) => {
      if (!enabled || !isActive || !attemptId || isTerminated || terminatingRef.current) return

      const now = Date.now()

      // Grace period: ignore ONLY tab switch for 2 seconds to avoid window focus blur flicker
      if (activatedAt.current && now - activatedAt.current < 2000) {
        if (type === 'TAB_SWITCH') {
          return
        }
      }

      // Throttling: avoid duplicate triggers within 3 seconds for same type
      const last = lastRecordedAt.current[type] ?? 0
      const lastAny = lastRecordedAt.current['GLOBAL'] ?? 0
      if (type === 'FULLSCREEN_EXIT') {
        if (now - last < 1500) return
      } else {
        if (now - last < 3000 || now - lastAny < 1500) return
      }
      lastRecordedAt.current[type] = now
      lastRecordedAt.current['GLOBAL'] = now

      try {
        const res = await attemptsApi.recordViolation(attemptId, type, detail)
        setViolationCount(res.violationCount)

        const violationInfo: LatestViolation = {
          type,
          label: VIOLATION_LABELS[type] ?? type,
          detail,
          count: res.violationCount,
          maxViolations,
        }
        setLatestViolation(violationInfo)

        if (res.terminated || res.violationCount >= maxViolations) {
          terminatingRef.current = true
          setIsTerminated(true)
          setIsWarningOpen(false)
          onTerminate()
        } else {
          setIsWarningOpen(true)
        }
      } catch {
        // Network or server error during proctoring recording should not crash student UI
      }
    },
    [attemptId, enabled, isActive, isTerminated, maxViolations, onTerminate],
  )

  // Request Fullscreen helper
  const enterFullscreen = useCallback(async () => {
    try {
      const doc = document as unknown as {
        fullscreenElement?: Element
        webkitFullscreenElement?: Element
        mozFullScreenElement?: Element
        msFullscreenElement?: Element
      }
      const isAlready = Boolean(
        doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement,
      )
      if (!isAlready) {
        const el = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>
          mozRequestFullScreen?: () => Promise<void>
          msRequestFullscreen?: () => Promise<void>
        }
        if (el.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen()
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen()
        }
      }
      setIsFullscreen(true)
    } catch {
      // Browser might block if not directly triggered by user gesture
    }
  }, [])

  // Fullscreen change listener
  useEffect(() => {
    if (!enabled || !isActive) return

    const handleFullscreenChange = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element
        webkitFullscreenElement?: Element
        mozFullScreenElement?: Element
        msFullscreenElement?: Element
      }
      const active = Boolean(
        doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement,
      )
      setIsFullscreen(active)
      if (!active && isActive && !terminatingRef.current) {
        void record('FULLSCREEN_EXIT', 'Thí sinh đã thoát chế độ toàn màn hình')
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    }
  }, [enabled, isActive, record])

  // Tab switch & Window blur listener
  useEffect(() => {
    if (!enabled || !isActive) return

    const handleVisibility = () => {
      if (document.hidden && !terminatingRef.current) {
        void record('TAB_SWITCH', 'Thí sinh chuyển sang tab hoặc ứng dụng khác')
      }
    }

    const handleBlur = () => {
      if (!document.hidden && !terminatingRef.current) {
        void record('TAB_SWITCH', 'Màn hình làm bài mất tiêu điểm')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
    }
  }, [enabled, isActive, record])

  // DevTools keyboard shortcuts listener
  useEffect(() => {
    if (!enabled || !isActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // F12
      if (event.key === 'F12') {
        event.preventDefault()
        void record('DEVTOOLS_OPEN', 'Phím tắt F12 (Developer Tools)')
        return
      }

      const ctrlOrMeta = event.ctrlKey || event.metaKey
      const keyUpper = event.key.toUpperCase()

      // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (ctrlOrMeta && event.shiftKey && ['I', 'J', 'C'].includes(keyUpper)) {
        event.preventDefault()
        void record('DEVTOOLS_OPEN', `Phím tắt Ctrl+Shift+${keyUpper}`)
        return
      }

      // Ctrl+U (View Source)
      if (ctrlOrMeta && keyUpper === 'U') {
        event.preventDefault()
        void record('DEVTOOLS_OPEN', 'Phím tắt xem mã nguồn (Ctrl+U)')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [enabled, isActive, record])

  // Clipboard & contextmenu blocking
  useEffect(() => {
    if (!enabled || !isActive) return

    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault()
      void record('CLIPBOARD_ACTION', 'Thao tác sao chép nội dung (Copy)')
    }

    const handleCut = (event: ClipboardEvent) => {
      event.preventDefault()
      void record('CLIPBOARD_ACTION', 'Thao tác cắt nội dung (Cut)')
    }

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault()
      void record('CLIPBOARD_ACTION', 'Thao tác dán nội dung (Paste)')
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [enabled, isActive, record])

  const dismissWarning = useCallback(() => {
    setIsWarningOpen(false)
  }, [])

  return {
    violationCount,
    isWarningOpen,
    latestViolation,
    isTerminated,
    isFullscreen,
    enterFullscreen,
    dismissWarning,
    recordViolation: record,
  }
}
