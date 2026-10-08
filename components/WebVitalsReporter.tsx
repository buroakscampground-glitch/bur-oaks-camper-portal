'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { webVitalParameters } from '../lib/web-vitals'

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const parameters = webVitalParameters(metric, window.location.pathname)
    if (parameters) trackPublicEvent('web_vital', parameters)
  })
  return null
}
