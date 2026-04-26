import { api } from './api'

export interface BrandIdentity {
  name: string | null
  nameAr: string | null
  logoUrl: string | null
  colors: string[]
  voiceTone: string | null
}

export interface AdImage {
  adImageId: string
  url: string
  mimetype: string
  instruction: string
  status: string
  createdAt: string
}

export async function fetchBranding(): Promise<BrandIdentity> {
  const res = await api.get('/api/branding')
  return res.data?.data ?? { name: null, nameAr: null, logoUrl: null, colors: [], voiceTone: null }
}

export async function updateBranding(input: {
  nameAr?: string | null
  colors?: string[]
  voiceTone?: string | null
}): Promise<Partial<BrandIdentity>> {
  const res = await api.put('/api/branding', input)
  return res.data?.data ?? {}
}

export async function uploadBrandLogo(file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/branding/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data?.data ?? { logoUrl: '' }
}

export async function deleteBrandLogo(): Promise<void> {
  await api.delete('/api/branding/logo')
}

export async function generateAdImage(input: {
  instruction: string
  size?: 'square' | 'portrait' | 'landscape'
}): Promise<AdImage> {
  const res = await api.post('/api/ad-images/generate', input)
  return res.data?.data
}

export async function listAdImages(): Promise<AdImage[]> {
  const res = await api.get('/api/ad-images')
  return res.data?.data ?? []
}

export async function deleteAdImage(adImageId: string): Promise<void> {
  await api.delete(`/api/ad-images/${adImageId}`)
}
