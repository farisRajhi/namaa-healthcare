import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PatientAuthProvider, usePatientAuth } from './context/PatientAuthContext'
import { PlatformAuthProvider, usePlatformAuth } from './context/PlatformAuthContext'
import DashboardLayout from './components/layout/DashboardLayout'
import PortalLayout from './components/portal/PortalLayout'
import Landing from './pages/Landing'
// HIDDEN: billing UI — re-enable when subscriptions return
// import Pricing from './pages/Pricing'
// import Billing from './pages/Billing'
// import BillingCheckout from './pages/BillingCheckout'
import RequiresActivation from './components/activation/RequiresActivation'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Appointments from './pages/Appointments'
import Management from './pages/Management'
import Settings from './pages/Settings'
import BrandIdentity from './pages/BrandIdentity'
import FAQ from './pages/FAQ'
import Campaigns from './pages/Campaigns'
import Reminders from './pages/Reminders'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import Integrations from './pages/Integrations'
import AgentBuilderList from './pages/AgentBuilderList'
import AgentBuilder from './pages/AgentBuilder'
import Reports from './pages/Reports'
import KnowledgeBase from './pages/KnowledgeBase'
import PatientEngagement from './pages/PatientEngagement'
import PatientSuggestions from './pages/PatientSuggestions'
import PatientIntelligence from './pages/PatientIntelligence'
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
import PlatformLayout from './components/platform/PlatformLayout'
import PlatformLogin from './pages/platform/PlatformLogin'
import PlatformDashboard from './pages/platform/PlatformDashboard'
import PlatformOrgs from './pages/platform/PlatformOrgs'
import PlatformOrgDetail from './pages/platform/PlatformOrgDetail'
// HIDDEN: billing UI — re-enable when subscriptions return
// import PlatformSubscriptions from './pages/platform/PlatformSubscriptions'
import PlatformAudit from './pages/platform/PlatformAudit'

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

function ProtectedPlatformRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePlatformAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/platform/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <>
      <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* HIDDEN: billing UI — re-enable when subscriptions return
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      <Route path="/billing/checkout/:planId" element={<ProtectedRoute><BillingCheckout /></ProtectedRoute>} />
      */}

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Always-on routes (no activation required) — dashboard home, profile/settings */}
        <Route index element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/branding" element={<BrandIdentity />} />

        {/* Activation-gated feature routes — Platform Admin must flip is_activated=true */}
        <Route path="patients" element={<RequiresActivation><Patients /></RequiresActivation>} />
        <Route path="patients/:id" element={<RequiresActivation><PatientDetail /></RequiresActivation>} />
        <Route path="appointments" element={<RequiresActivation><Appointments /></RequiresActivation>} />
        <Route path="management" element={<RequiresActivation><Management /></RequiresActivation>} />
        <Route path="faq" element={<RequiresActivation><FAQ /></RequiresActivation>} />
        <Route path="knowledge-base" element={<RequiresActivation><KnowledgeBase /></RequiresActivation>} />

        <Route path="patient-intelligence" element={<RequiresActivation><PatientIntelligence /></RequiresActivation>} />
        <Route path="reminders" element={<RequiresActivation><Reminders /></RequiresActivation>} />
        <Route path="analytics-dashboard" element={<RequiresActivation><AnalyticsDashboard /></RequiresActivation>} />
        <Route path="analytics" element={<RequiresActivation><AnalyticsDashboard /></RequiresActivation>} />

        <Route path="patient-engagement" element={<RequiresActivation><PatientEngagement /></RequiresActivation>} />
        <Route path="patient-suggestions" element={<RequiresActivation><PatientSuggestions /></RequiresActivation>} />
        <Route path="campaigns" element={<RequiresActivation><Campaigns /></RequiresActivation>} />
        <Route path="agent-builder" element={<RequiresActivation><AgentBuilderList /></RequiresActivation>} />
        <Route path="agent-builder/:id" element={<RequiresActivation><AgentBuilder /></RequiresActivation>} />
        <Route path="reports" element={<RequiresActivation><Reports /></RequiresActivation>} />

        <Route path="integrations" element={<RequiresActivation><Integrations /></RequiresActivation>} />

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

      {/* Platform Admin (operator of the Tawafud SaaS) — isolated auth */}
      <Route
        path="/platform/login"
        element={
          <PlatformAuthProvider>
            <PlatformLogin />
          </PlatformAuthProvider>
        }
      />
      <Route
        path="/platform"
        element={
          <PlatformAuthProvider>
            <ProtectedPlatformRoute>
              <PlatformLayout />
            </ProtectedPlatformRoute>
          </PlatformAuthProvider>
        }
      >
        <Route index element={<PlatformDashboard />} />
        <Route path="orgs" element={<PlatformOrgs />} />
        <Route path="orgs/:id" element={<PlatformOrgDetail />} />
        {/* HIDDEN: billing UI — re-enable when subscriptions return
        <Route path="subscriptions" element={<PlatformSubscriptions />} />
        */}
        <Route path="audit" element={<PlatformAudit />} />
      </Route>

      {/* Catch all — proper 404 page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  )
}

export default App
