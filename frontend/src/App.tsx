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
import Appointments from './pages/Appointments'
import Providers from './pages/Providers'
import Services from './pages/Services'
import Departments from './pages/Departments'
import Facilities from './pages/Facilities'
import Management from './pages/Management'
import Settings from './pages/Settings'
import CallCenter from './pages/CallCenter'
import Prescriptions from './pages/Prescriptions'
import FAQ from './pages/FAQ'
import Campaigns from './pages/Campaigns'
import Reminders from './pages/Reminders'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import FleetDashboard from './pages/FleetDashboard'
import QualityReview from './pages/QualityReview'
import Integrations from './pages/Integrations'
import AuditLog from './pages/AuditLog'
import SmsTemplates from './pages/SmsTemplates'
import Waitlist from './pages/Waitlist'
import AgentBuilderList from './pages/AgentBuilderList'
import AgentBuilder from './pages/AgentBuilder'
import Reports from './pages/Reports'
import PatientLogin from './pages/portal/PatientLogin'
import PatientDashboard from './pages/portal/PatientDashboard'
import PatientAppointments from './pages/portal/PatientAppointments'
import PatientBooking from './pages/portal/PatientBooking'
import PatientPrescriptions from './pages/portal/PatientPrescriptions'
import PatientProfile from './pages/portal/PatientProfile'
import LoadingSpinner from './components/ui/LoadingSpinner'
import PrivacyPolicy from './pages/Legal/PrivacyPolicy'
import Terms from './pages/Legal/Terms'
import DoctorSchedule from './pages/DoctorSchedule'

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
        <Route path="appointments" element={<Appointments />} />
        <Route path="providers" element={<Providers />} />
        <Route path="services" element={<Services />} />
        <Route path="departments" element={<Departments />} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="management" element={<Management />} />
        <Route path="settings" element={<Settings />} />
        <Route path="call-center" element={<CallCenter />} />
        <Route path="prescriptions" element={<Prescriptions />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="analytics-dashboard" element={<AnalyticsDashboard />} />
        <Route path="analytics" element={<AnalyticsDashboard />} />
        <Route path="fleet" element={<FleetDashboard />} />
        <Route path="quality" element={<QualityReview />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="sms-templates" element={<SmsTemplates />} />
        <Route path="waitlist" element={<Waitlist />} />
        <Route path="agent-builder" element={<AgentBuilderList />} />
        <Route path="agent-builder/:id" element={<AgentBuilder />} />
        <Route path="reports" element={<Reports />} />
      </Route>

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
        <Route path="prescriptions" element={<PatientPrescriptions />} />
        <Route path="profile" element={<PatientProfile />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
