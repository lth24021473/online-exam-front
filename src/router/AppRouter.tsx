import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import DashboardPage from '../pages/DashboardPage'
import ProfilePage from '../pages/ProfilePage'
import NotFoundPage from '../pages/NotFoundPage'
import GuestRoute from './GuestRoute'
import ProtectedRoute from './ProtectedRoute'
import StudentRoute from './StudentRoute'
import ExamsPage from '../pages/ExamsPage'
import ExamDetailPage from '../pages/ExamDetailPage'
import TakeExamPage from '../pages/TakeExamPage'
import AttemptResultPage from '../pages/AttemptResultPage'
import AttemptHistoryPage from '../pages/AttemptHistoryPage'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route index element={<Navigate to="/login" replace />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="exams/:examId" element={<ExamDetailPage />} />
          <Route element={<StudentRoute />}>
            <Route path="exams/:examId/take" element={<TakeExamPage />} />
            <Route path="history" element={<AttemptHistoryPage />} />
            <Route path="attempts/:attemptId/result" element={<AttemptResultPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
