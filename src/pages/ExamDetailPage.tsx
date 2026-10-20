import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Clock3, Play, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { examsApi } from '../api/exams'
import type { ExamInfo } from '../api/exams'
import { getApiErrorMessage } from '../api/axios'
import { useAuth } from '../auth/useAuth'

export default function ExamDetailPage() {
  const { examId = '' } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState<{ exam: ExamInfo | null; error: string } | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    examsApi.detail(examId, controller.signal).then((exam) => { if (!controller.signal.aborted) setData({ exam, error: '' }) }).catch((err: unknown) => {
      if (!axios.isCancel(err) && !controller.signal.aborted) setData({ exam: null, error: getApiErrorMessage(err) })
    })
    return () => controller.abort()
  }, [examId, revision])
  const start = user?.role === 'STUDENT'
  return <div className="exam-page exam-detail">
    <Link className="exam-back" to="/exams"><ArrowLeft size={17} aria-hidden="true" /> Danh sách đề thi</Link>
    {!data ? <p role="status" className="exam-panel">Đang tải thông tin đề thi…</p> : data.error ? <div className="exam-panel"><p className="form-error" role="alert">{data.error}</p><button className="button button-inline exam-button-secondary" onClick={() => { setData(null); setRevision((value) => value + 1) }}>Thử lại</button></div> : <>
      <section className="exam-panel">
        <span className="exam-eyebrow">CHUẨN BỊ LÀM BÀI</span><h1>{data.exam?.title || 'Đề thi theo mã'}</h1><p className="exam-muted">{data.exam?.description || 'Mở bài làm bằng mã đề được chia sẻ. Thông tin và câu hỏi sẽ được tải khi bạn bắt đầu.'}</p>
        <div className="exam-facts">{data.exam && <><div><Clock3 size={22} aria-hidden="true" /><strong>{data.exam.durationMinutes} phút</strong><span>Thời gian làm bài</span></div><div><BookOpen size={22} aria-hidden="true" /><strong>{data.exam.totalQuestions ?? '—'} câu</strong><span>Số câu hỏi</span></div></>}<div><ShieldCheck size={22} aria-hidden="true" /><strong>Tự động lưu</strong><span>Tiếp tục bài khi quay lại</span></div></div>
        <div className="exam-instructions"><h2>Hướng dẫn làm bài</h2><p>{data.exam?.instructions || 'Mỗi câu chỉ chọn một đáp án.'}</p><ul><li>Đáp án được lưu sau mỗi lần chọn hoặc thay đổi.</li><li>Thời gian tính từ khi bắt đầu bài và tiếp tục chạy khi bạn rời trang.</li><li>Bài làm tự nộp khi hết giờ. Kiểm tra trạng thái lưu trước khi nộp.</li></ul></div>
        <div className="exam-actions">{start ? data.exam && data.exam.status !== 'PUBLISHED' ? <p className="form-error" role="alert">Đề thi hiện chưa mở để làm bài.</p> : <Link className="button button-primary button-inline" to={`/exams/${examId}/take`}><Play size={18} aria-hidden="true" /> Bắt đầu / Tiếp tục bài</Link> : <p className="exam-alert">Tài khoản quản lý và quản trị có thể xem thông tin đề. Chức năng làm bài dành cho học sinh.</p>}{start ? <Link className="exam-back" to="/history">Xem lịch sử làm bài</Link> : <Link className="button button-primary button-inline" to={`/manage/exams/${examId}`}>Quản lý đề thi</Link>}</div>
      </section>
    </>}
  </div>
}
