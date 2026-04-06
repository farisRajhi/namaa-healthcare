import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PatientAuthProvider, usePatientAuth } from './context/PatientAuthContext'
import DashboardLayout from './components/layout/DashboardLayout'
import PortalLayout from './components/portal/PortalLayout'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Appointments from './pages/Appointments'
import Management from './pages/Management'
import Settings from './pages/Settings'
import FAQ from './pages/FAQ'
import Campaigns from './pages/Campaigns'
import Reminders from './pages/Reminders'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import Integrations from './pages/Integrations'
// SmsTemplates page removed — redirects to PatientEngagement
import AgentBuilderList from './pages/AgentBuilderList'
import AgentBuilder from './pages/AgentBuilder'
import Reports from './pages/Reports'
import KnowledgeBase from './pages/KnowledgeBase'
// Offers, PatientInsights, MarketingHub pages removed — redirects to PatientEngagement
import PatientEngagement from './pages/PatientEngagement'
import PatientLogin from './pages/portal/PatientLogin'
import PatientDashboard from './pages/portal/PatientDashboard'
import PatientAppointments from './pages/portal/PatientAppointments'
import PatientBooking from './pages/portal/PatientBooking'
import PatientProfile from './pages/portal/PatientProfile'
import LoadingSpinner from './components/ui/LoadingSpinner'
import PrivacyPolicy from './pages/Legal/PrivacyPolicy'
import Terms from './pages/Legal/Terms'
import NotFound from './pages/NotFound'
import PublicBooking from './pages/PublicBooking'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-healthcare-bg">
        <LoadingSpinner size="lg" text="جاري التحميل..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function ProtectedPatientRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePatientAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" text="جاري التحميل..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/patient" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="management" element={<Management />} />
        <Route path="settings" element={<Settings />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="patient-engagement" element={<PatientEngagement />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="analytics-dashboard" element={<AnalyticsDashboard />} />
        <Route path="analytics" element={<AnalyticsDashboard />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="agent-builder" element={<AgentBuilderList />} />
        <Route path="agent-builder/:id" element={<AgentBuilder />} />
        <Route path="reports" element={<Reports />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        {/* Redirects: old marketing pages → Patient Engagement */}
        <Route path="marketing" element={<Navigate to="/dashboard/patient-engagement" replace />} />
        <Route path="sms-templates" element={<Navigate to="/dashboard/patient-engagement" replace />} />
        <Route path="offers" element={<Navigate to="/dashboard/patient-engagement" replace />} />
        <Route path="patient-insights" element={<Navigate to="/dashboard/patient-engagement" replace />} />
      </Route>

      {/* Legal pages */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />

      {/* Patient Portal — Public */}
      <Route
        path="/patient"
        element={
          <PatientAuthProvider>
            <PatientLogin />
          </PatientAuthProvider>
        }
      />

      {/* Patient Portal — Protected */}
      <Route
        path="/patient/dashboard"
        element={
          <PatientAuthProvider>
            <ProtectedPatientRoute>
              <PortalLayout />
            </ProtectedPatientRoute>
          </PatientAuthProvider>
        }
      >
        <Route index element={<PatientDashboard />} />
        <Route path="appointments" element={<PatientAppointments />} />
        <Route path="book" element={<PatientBooking />} />
        <Route path="profile" element={<PatientProfile />} />
      </Route>

      {/* Public self-booking link for clinics */}
      <Route path="/book/:slug" element={<PublicBooking />} />

      {/* Catch all — proper 404 page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
