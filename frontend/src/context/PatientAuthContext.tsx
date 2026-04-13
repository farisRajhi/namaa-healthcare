import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { api } from '../lib/api'

interface PatientUser {
  patientId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  sex: string | null
  mrn: string | null
  contacts: Array<{
    contactId: string
    type: string
    value: string
    isPrimary: boolean
  }>
  memories: Array<{
    type: string
    key: string
    value: string
  }>
}

interface PatientAuthContextType {
  patient: PatientUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (phone: string, dateOfBirth: string) => Promise<void>
  logout: () => void
  refreshProfile: () => Promise<void>
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined)

const PATIENT_TOKEN_KEY = 'patient_token'

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<PatientUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchPatient = useCallback(async () => {
    try {
      const token = sessionStorage.getItem(PATIENT_TOKEN_KEY)
      if (!token) {
        setIsLoading(false)
        return
      }
      const response = await api.get('/api/patient-portal/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPatient(response.data)
    } catch {
      sessionStorage.removeItem(PATIENT_TOKEN_KEY)
      setPatient(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPatient()
  }, [fetchPatient])

  const login = async (phone: string, dateOfBirth: string) => {
    const response = await api.post('/api/patient-portal/login', { phone, dateOfBirth })
    const { token } = response.data
    sessionStorage.setItem(PATIENT_TOKEN_KEY, token)
    await fetchPatient()
  }

  const logout = () => {
    sessionStorage.removeItem(PATIENT_TOKEN_KEY)
    setPatient(null)
  }

  const refreshProfile = async () => {
    await fetchPatient()
  }

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        isAuthenticated: !!patient,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  )
}

export function usePatientAuth() {
  const context = useContext(PatientAuthContext)
  if (context === undefined) {
    throw new Error('usePatientAuth must be used within a PatientAuthProvider')
  }
  return context
}

/** Helper: get the patient bearer token for API calls */
export function getPatientToken(): string | null {
  return sessionStorage.getItem(PATIENT_TOKEN_KEY)
}

/** Axios instance pre-configured for patient portal API calls */
export function patientApi() {
  const token = getPatientToken()
  return {
    get: (url: string, config?: any) =>
      api.get(url, { ...config, headers: { ...config?.headers, Authorization: `Bearer ${token}` } }),
    post: (url: string, data?: any, config?: any) =>
      api.post(url, data, { ...config, headers: { ...config?.headers, Authorization: `Bearer ${token}` } }),
    put: (url: string, data?: any, config?: any) =>
      api.put(url, data, { ...config, headers: { ...config?.headers, Authorization: `Bearer ${token}` } }),
    patch: (url: string, data?: any, config?: any) =>
      api.patch(url, data, { ...config, headers: { ...config?.headers, Authorization: `Bearer ${token}` } }),
  }
}
