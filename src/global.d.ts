// Google Analytics gtag.js — loaded conditionally via PUBLIC_GA_MEASUREMENT_ID
interface Window {
  dataLayer: unknown[]
  gtag?: (...args: unknown[]) => void
}
