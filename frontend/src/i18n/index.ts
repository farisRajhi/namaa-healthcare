import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en/translation.json'
import ar from './locales/ar/translation.json'

const resources = {
  en: { translation: en },
  ar: { translation: ar },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

// Update document direction and font based on language
const applyLanguageSettings = (lng: string) => {
  const isRtl = lng === 'ar'
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  document.documentElement.lang = lng

  // The CSS already handles font switching via [dir="rtl"] selectors
  // but we also set a class for additional styling hooks
  if (isRtl) {
    document.documentElement.classList.add('lang-ar')
    document.documentElement.classList.remove('lang-en')
  } else {
    document.documentElement.classList.add('lang-en')
    document.documentElement.classList.remove('lang-ar')
  }
}

i18n.on('languageChanged', applyLanguageSettings)

// Set initial direction
applyLanguageSettings(i18n.language)

export default i18n
