/**
 * Mappers between the Patient Intelligence backend API shape and the frontend
 * UI types. The backend select uses Prisma column names (externalPatientId,
 * lastVisitDate, aiScore, services) and wraps lists in `{ data, pagination }`.
 * The UI expects flat objects with shorter names (id, lastVisit, riskScore,
 * matchedServices). Keep this file as the single point that bridges the two.
 */

export interface PatientRow {
  id: string
  name: string
  nameAr: string | null
  phone: string
  lastVisit: string | null
  matchedServices: string[]
  riskScore: number | null
  segment: string | null
  reasoning: string | null
  matchedPatientId: string | null
  previousCampaigns: number
  lastCampaignResult: string | null
}

export interface PatientsResponse {
  patients: PatientRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface RawPatient {
  externalPatientId: string
  name?: string | null
  nameAr?: string | null
  phone?: string | null
  lastVisitDate?: string | null
  lastService?: string | null
  services?: string[] | null
  totalVisits?: number
  aiScore?: number | null
  aiReasoning?: string | null
  aiSegment?: string | null
  aiSuggestedAction?: string | null
  matchedPatientId?: string | null
  previousCampaigns?: number
  lastCampaignResult?: string | null
}

interface RawPagination {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
}

interface RawPatientsResponse {
  data?: RawPatient[]
  pagination?: RawPagination
}

export function mapPatientRow(p: RawPatient): PatientRow {
  const services = Array.isArray(p.services) && p.services.length > 0
    ? p.services
    : p.lastService
      ? [p.lastService]
      : []

  return {
    id: p.externalPatientId,
    name: p.name ?? '',
    nameAr: p.nameAr ?? null,
    phone: p.phone ?? '',
    lastVisit: p.lastVisitDate ?? null,
    matchedServices: services,
    riskScore: typeof p.aiScore === 'number' ? p.aiScore : null,
    segment: p.aiSegment ?? null,
    reasoning: p.aiReasoning ?? null,
    matchedPatientId: p.matchedPatientId ?? null,
    previousCampaigns: p.previousCampaigns ?? 0,
    lastCampaignResult: p.lastCampaignResult ?? null,
  }
}

export function mapPatientsResponse(raw: RawPatientsResponse | RawPatient[] | undefined | null): PatientsResponse {
  const list = Array.isArray(raw) ? raw : raw?.data ?? []
  const pagination = (Array.isArray(raw) ? undefined : raw?.pagination) ?? {}

  return {
    patients: list.map(mapPatientRow),
    total: pagination.total ?? list.length,
    page: pagination.page ?? 1,
    limit: pagination.limit ?? list.length,
    totalPages: pagination.totalPages ?? 1,
  }
}
