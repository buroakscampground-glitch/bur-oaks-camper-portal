'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'

type ViewerState = {
  url: string
  fileUrl?: string
}

function canPreviewInBrowser(fileUrl?: string) {
  if (!fileUrl) return true
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(fileUrl.split('?')[0])
}

export default function DocumentViewerPage() {
  const params = useParams<{ id: string }>()
  const documentId = params?.id
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const browserPreviewAllowed = useMemo(
    () => canPreviewInBrowser(viewer?.fileUrl),
    [viewer?.fileUrl]
  )

  useEffect(() => {
    loadDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  async function loadDocument() {
    if (!documentId) return

    setLoading(true)
    setMessage('')

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/document-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ documentId }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.url) {
      setMessage(result?.error || 'This document could not be opened. Please contact the campground office.')
      setLoading(false)
      return
    }

    setViewer({
      url: result.url,
      fileUrl: result.fileUrl,
    })
    setLoading(false)
  }

  return (
    <main className="document-viewer-page">
      <section className="document-viewer-shell">
        <div className="document-viewer-header">
          <a href="/documents">
            <ArrowLeft size={17} /> Back
          </a>
          <div>
            <span><ShieldCheck size={15} /> Secure document viewer</span>
            <h1>Review your document</h1>
            <p>If your device cannot preview this file, use the open/download button below.</p>
          </div>
          {viewer?.url && (
            <a href={viewer.url} target="_blank" rel="noreferrer">
              <ExternalLink size={17} /> Open full screen
            </a>
          )}
        </div>

        {loading && (
          <div className="document-viewer-state">
            <FileText size={34} />
            <h2>Preparing secure document…</h2>
            <p>This private link only lasts a short time.</p>
          </div>
        )}

        {!loading && message && (
          <div className="document-viewer-state">
            <FileText size={34} />
            <h2>Unable to open document</h2>
            <p>{message}</p>
            <button type="button" onClick={loadDocument}>Try again</button>
          </div>
        )}

        {!loading && viewer?.url && (
          <>
            {browserPreviewAllowed ? (
              <iframe className="document-viewer-frame" src={viewer.url} title="Document preview" />
            ) : (
              <div className="document-viewer-state">
                <FileText size={42} />
                <h2>This file opens best in your device’s document app.</h2>
                <p>Word documents may not preview inside every browser. Tap below to open or download it.</p>
                <a href={viewer.url} target="_blank" rel="noreferrer">
                  <Download size={17} /> Open / Download Document
                </a>
              </div>
            )}

            <div className="document-viewer-footer">
              <span>Having trouble? Tap “Open full screen” or refresh the secure link.</span>
              <button type="button" onClick={loadDocument}>Refresh secure link</button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
