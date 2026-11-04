import type { LatestViolation } from '../attempts/useExamProctoring'
import './ProctoringWarningModal.css'

interface ProctoringWarningModalProps {
  isOpen: boolean
  isTerminated?: boolean
  violation: LatestViolation | null
  maxViolations?: number
  onDismiss: () => void
}

export default function ProctoringWarningModal({
  isOpen,
  isTerminated = false,
  violation,
  maxViolations = 3,
  onDismiss,
}: ProctoringWarningModalProps) {
  if (!isOpen && !isTerminated) return null

  if (isTerminated) {
    return (
      <div className="exam-dialog-backdrop proctoring-dialog-backdrop">
        <section
          className="exam-panel exam-confirm proctoring-modal proctoring-terminated-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="proctoring-terminated-title"
        >
          <div className="proctoring-header-danger">
            <span className="proctoring-badge-danger">ĐÃ ĐÌNH CHỈ</span>
            <h2 id="proctoring-terminated-title">BÀI THI BỊ KHÓA VÀ THU HỒI TỰ ĐỘNG</h2>
          </div>
          <p className="proctoring-message">
            Bạn đã vi phạm quy chế thi quá số lần cho phép ({maxViolations} lần). Hệ thống giám sát
            thông minh đã tự động khóa và nộp bài thi của bạn lên máy chủ.
          </p>
          <div className="proctoring-actions">
            <button
              type="button"
              className="button button-primary button-inline"
              onClick={onDismiss}
            >
              Xem kết quả bài thi
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!violation) return null

  const remainingAttempts = Math.max(0, violation.maxViolations - violation.count)

  return (
    <div className="exam-dialog-backdrop proctoring-dialog-backdrop">
      <section
        className="exam-panel exam-confirm proctoring-modal proctoring-warning-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="proctoring-warning-title"
      >
        <div className="proctoring-header-warning">
          <span className="proctoring-badge-warning">CẢNH BÁO VI PHẠM</span>
          <h2 id="proctoring-warning-title">PHÁT HIỆN HÀNH VI ĐÁNG NGỜ!</h2>
        </div>
        <div className="proctoring-violation-detail">
          <strong>Hành vi ghi nhận:</strong>
          <p className="proctoring-violation-label">{violation.label}</p>
          {violation.detail && <p className="proctoring-violation-sub">{violation.detail}</p>}
        </div>
        <div className="proctoring-counter-box">
          <span>Số lần vi phạm:</span>
          <strong>
            {violation.count} / {violation.maxViolations}
          </strong>
        </div>
        <p className="proctoring-warning-notice">
          {remainingAttempts > 0
            ? `Cảnh báo: Bạn chỉ còn ${remainingAttempts} lần vi phạm trước khi bài thi bị tự động thu bài và khóa vĩnh viễn!`
            : 'Đây là lần vi phạm cuối cùng! Mọi hành vi tiếp theo sẽ chấm dứt bài thi ngay lập tức.'}
        </p>
        <div className="proctoring-actions">
          <button
            type="button"
            className="button button-primary button-inline"
            onClick={onDismiss}
          >
            Tôi đã hiểu và cam kết không tái phạm
          </button>
        </div>
      </section>
    </div>
  )
}
