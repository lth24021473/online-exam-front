import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordFieldProps {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
}

export default function PasswordField({ id, label, autoComplete, minLength = 6 }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-field">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} name={id} type={visible ? 'text' : 'password'} placeholder={label}
        autoComplete={autoComplete} minLength={minLength} required />
      <button className="password-toggle" type="button" onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible}>
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  )
}
