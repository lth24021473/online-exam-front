import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getAccessToken } from '../api/axios'
import { ManagerExamCreation } from '../api/manager-exam-creation'
import { getManagerErrorMessage } from '../api/manager-exams'
import ManagerCreateExamForm from '../components/ManagerCreateExamForm'
import type { ManagerCreateExamPayload } from '../components/ManagerCreateExamForm'
import './ManagerExams.css'

export default function ManagerCreateExamPage() {
  const navigate = useNavigate()
  const [creation] = useState(() => new ManagerExamCreation())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function create(payload: ManagerCreateExamPayload) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    const token = getAccessToken()
    const isActive = () => mounted.current && getAccessToken() === token
    try {
      const id = await creation.save(payload, isActive)
      if (isActive()) navigate(`/manage/exams/${id}`, { replace: true, state: { notice: 'Đã tạo đề thi bản nháp.' } })
    } catch (failure) {
      if (isActive()) setError(creation.blocked && failure instanceof Error ? failure.message : getManagerErrorMessage(failure))
    } finally {
      lock.current = false
      if (isActive()) setBusy(false)
    }
  }

  return <div className="exam-page manager-page manager-create-page">
    <Link className="exam-back-link" to="/manage/exams"><ArrowLeft size={17} aria-hidden="true" />Quản lý đề thi</Link>
    <header className="exam-page-heading"><div><h1>Tạo đề thi</h1></div></header>
    <ManagerCreateExamForm busy={busy} error={error} creationBlocked={creation.blocked} onCreate={create} />
    {error && <Link className="exam-back-link" to={creation.examId ? `/manage/exams/${creation.examId}` : '/manage/exams'}>{creation.examId ? 'Mở bản nháp đã lưu' : 'Kiểm tra danh sách đề thi'}</Link>}
  </div>
}
