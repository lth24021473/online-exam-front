import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Clock3, ShieldCheck, Award } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { examsApi } from '../api/exams'
import type { ExamInfo } from '../api/exams'
import { attemptsApi } from '../api/attempts'
import { getApiErrorMessage } from '../api/axios'
import { useAuth } from '../auth/useAuth'

export default function ExamDetailPage() {
  const { examId = '' } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState<{ exam: ExamInfo | null; error: string } | null>(null)
  const [attemptInfo, setAttemptInfo] = useState<{ count: number; hasActive: boolean } | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    examsApi.detail(examId, controller.signal).then((exam) => {
      if (!controller.signal.aborted) setData({ exam, error: '' })
    }).catch((err: unknown) => {
      if (!axios.isCancel(err) && !controller.signal.aborted) setData({ exam: null, error: getApiErrorMessage(err) })
    })

    if (user?.role === 'STUDENT') {
      attemptsApi.history({ examId }, controller.signal).then((res) => {
        if (!controller.signal.aborted) {
          const activeOrSubmitted = res.items.filter((item) => item.status !== 'CANCELLED')
          setAttemptInfo({
            count: activeOrSubmitted.length,
            hasActive: res.items.some((item) => item.status === 'IN_PROGRESS'),
          })
        }
      }).catch(() => {
        // Silently tolerate attempt history fetch failure on initial exam detail view
      })
    }

    return () => controller.abort()
  }, [examId, revision, user?.role])

  const start = user?.role === 'STUDENT'
  const now = Date.now()
  const notYetOpen = Boolean(data?.exam?.opensAt && new Date(data.exam.opensAt).getTime() > now)
  const isClosed = data?.exam?.status !== 'PUBLISHED' || Boolean(data?.exam?.closesAt && new Date(data.exam.closesAt).getTime() <= now)
  const maxAttempts = data?.exam?.maxAttempts ?? 1
  const quotaReached = attemptInfo !== null && !attemptInfo.hasActive && attemptInfo.count >= maxAttempts

  return <div className="exam-page exam-detail">
    <Link className="exam-back" to="/exams"><ArrowLeft size={17} aria-hidden="true" /> Danh sách đề thi</Link>
    {!data ? <p role="status" className="exam-panel">Đang tải thông tin đề thi…</p> : data.error ? <div className="exam-panel"><p className="form-error" role="alert">{data.error}</p><button className="button button-inline exam-button-secondary" onClick={() => { setData(null); setRevision((value) => value + 1) }}>Thử lại</button></div> : <>
      <section className="exam-panel">
        <h1>{data.exam?.title || 'Đề thi theo mã'}</h1>
        {data.exam?.description && <p className="exam-muted">{data.exam.description}</p>}
        <div className="exam-facts">
          {data.exam && <>
            <div><Clock3 size={22} aria-hidden="true" /><strong>{data.exam.durationMinutes} phút</strong><span>Thời gian làm bài</span></div>
            <div><BookOpen size={22} aria-hidden="true" /><strong>{data.exam.totalQuestions ?? '—'} câu</strong><span>Số câu hỏi</span></div>
            <div><Award size={22} aria-hidden="true" /><strong>{maxAttempts} lượt</strong><span>Số lần làm tối đa</span></div>
          </>}
          <div><ShieldCheck size={22} aria-hidden="true" /><strong>Tự động lưu</strong><span>Tiếp tục bài khi quay lại</span></div>
        </div>
        <div className="exam-instructions">
          <h2>Hướng dẫn làm bài</h2>
          <p>{data.exam?.instructions || 'Mỗi câu chỉ chọn một đáp án.'}</p>
          <ul>
            <li>Đáp án được lưu sau mỗi lần chọn hoặc thay đổi.</li>
            <li>Thời gian tính từ khi bắt đầu bài và tiếp tục chạy khi bạn rời trang.</li>
            <li>Bài làm tự nộp khi hết giờ. Kiểm tra trạng thái lưu trước khi nộp.</li>
            {data.exam?.opensAt && <li>Thời gian mở đề: {new Date(data.exam.opensAt).toLocaleString('vi-VN')}</li>}
            {data.exam?.closesAt && <li>Thời gian đóng đề: {new Date(data.exam.closesAt).toLocaleString('vi-VN')}</li>}
            {attemptInfo !== null && <li>Lượt làm bài của bạn: {attemptInfo.count}/{maxAttempts}</li>}
          </ul>
        </div>
        <div className="exam-actions">
          {start ? (
            notYetOpen ? (
              <p className="form-error" role="alert">Chưa đến giờ làm bài (Đề thi sẽ mở vào lúc {new Date(data.exam!.opensAt!).toLocaleString('vi-VN')}).</p>
            ) : isClosed ? (
              <div>
                <p className="form-error" role="alert">Đề thi hiện chưa mở hoặc đã kết thúc thời gian thi.</p>
                <Link className="button button-secondary button-inline" to="/history">Xem kết quả bài đã làm</Link>
              </div>
            ) : quotaReached ? (
              <div>
                <p className="form-error" role="alert">Bạn đã sử dụng hết số lượt làm bài cho đề thi này ({attemptInfo.count}/{maxAttempts} lượt).</p>
                <Link className="button button-primary button-inline" to="/history">Xem kết quả & đáp án</Link>
              </div>
            ) : (
              <Link className="button button-primary button-inline" to={`/exams/${examId}/take`}>Bắt đầu / Tiếp tục bài</Link>
            )
          ) : (
            <Link className="button button-primary button-inline" to={`/manage/exams/${examId}`}>Quản lý đề thi</Link>
          )}
          {start && <Link className="exam-back" to="/history">Xem lịch sử làm bài</Link>}
        </div>
      </section>
    </>}
  </div>
}
