import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="Tracnghiem.com — Trang chủ">
      <span className="brand-icon"><FileText size={16} strokeWidth={1.8} aria-hidden="true" /></span>
      <span>Tracnghiem.com</span>
    </Link>
  )
}
