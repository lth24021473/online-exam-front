import type { ExamStudentResult } from '../api/manager-exams'
import type { ViolationType } from '../api/attempts'
import { formatDate } from '../utils/date'
import './CheatTimelineModal.css'

const VIOLATION_TITLE_MAP: Record<ViolationType, string> = {
  TAB_SWITCH: 'Chuyển tab hoặc rời giao diện thi',
  FULLSCREEN_EXIT: 'Thoát chế độ toàn màn hình',
  DEVTOOLS_OPEN: 'Thao tác mở công cụ DevTools (F12)',
  CLIPBOARD_ACTION: 'Thao tác sao chép / dán phím tắt',
  MULTIPLE_FACES: 'Phát hiện nhiều hơn một khuôn mặt',
  NO_FACE_DETECTED: 'Không tìm thấy khuôn mặt trong khung hình',
}

interface CheatTimelineModalProps {
  isOpen: boolean
  attempt: ExamStudentResult | null
  maxViolations?: number
  onClose: () => void
}

export default function CheatTimelineModal({
  isOpen,
  attempt,
  maxViolations = 3,
  onClose,
}: CheatTimelineModalProps) {
  if (!isOpen || !attempt) return null

  const violations = attempt.violations ?? []
  const count = attempt.violationCount ?? violations.length
  const isSuspended =
    attempt.terminatedReason === 'EXCEEDED_VIOLATIONS' || count >= maxViolations

  return (
    <div className="exam-dialog-backdrop cheat-timeline-backdrop">
      <section
        className="exam-panel exam-confirm cheat-timeline-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheat-timeline-title"
      >
        <div className="cheat-timeline-header">
          <div>
            <h2 id="cheat-timeline-title" className="proctoring-badge-warning" style={{ margin: '0 0 8px', display: 'inline-block' }}>NHẬT KÝ GIÁM SÁT</h2>
            <p className="cheat-timeline-student" style={{ margin: 0 }}>
              Học sinh: <strong>{attempt.user.fullName}</strong> ({attempt.user.email})
            </p>
          </div>
          <button
            type="button"
            className="manager-text-button"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>

        <div className="cheat-timeline-summary">
          <div>
            <span>Tổng số vi phạm</span>
            <strong>
              {count} / {maxViolations}
            </strong>
          </div>
          <div>
            <span>Mức độ rủi ro</span>
            <strong
              className={
                count === 0
                  ? 'risk-text-low'
                  : count >= maxViolations || isSuspended
                    ? 'risk-text-high'
                    : 'risk-text-medium'
              }
            >
              {count === 0
                ? 'An toàn'
                : count >= maxViolations || isSuspended
                  ? 'Nguy cơ cao'
                  : 'Đáng ngờ'}
            </strong>
          </div>
          <div>
            <span>Trạng thái kết thúc</span>
            <strong>
              {attempt.terminatedReason === 'EXCEEDED_VIOLATIONS'
                ? 'Bị hệ thống đình chỉ'
                : attempt.terminatedReason === 'TIME_EXPIRED'
                  ? 'Hết giờ làm bài'
                  : 'Nộp bài bình thường'}
            </strong>
          </div>
        </div>

        <div className="cheat-timeline-content">
          <h3>Chi tiết từng sự kiện vi phạm ({violations.length})</h3>
          {violations.length === 0 ? (
            <p className="cheat-timeline-empty">
              Không có sự kiện vi phạm nào được ghi nhận trong lượt thi này.
            </p>
          ) : (
            <ol className="cheat-timeline-list">
              {violations.map((item, index) => (
                <li key={item.id} className="cheat-timeline-item">
                  <div className="cheat-timeline-marker">{index + 1}</div>
                  <div className="cheat-timeline-body">
                    <div className="cheat-timeline-top">
                      <strong className="cheat-timeline-type">
                        {VIOLATION_TITLE_MAP[item.type] ?? item.type}
                      </strong>
                      <time className="cheat-timeline-time">{formatDate(item.createdAt)}</time>
                    </div>
                    {item.detail && <p className="cheat-timeline-detail">{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="cheat-timeline-actions">
          <button
            type="button"
            className="button button-secondary button-inline"
            onClick={onClose}
          >
            Đóng nhật ký
          </button>
        </div>
      </section>
    </div>
  )
}
