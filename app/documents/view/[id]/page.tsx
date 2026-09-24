'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'

type ViewerState = {
  url: string
  fileUrl?: string
  isAdmin: boolean
  camperId?: string
  document?: {
    name?: string
    type?: string
    signatureStatus?: string
    signedAt?: string
    signedName?: string
    secondSignedAt?: string
    secondSignedName?: string
    requiresTwoSignatures?: boolean
    signatureRecordHash?: string
    secondSignatureRecordHash?: string
  }
}

function canPreviewInBrowser(fileUrl?: string) {
  if (!fileUrl) return true
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(fileUrl.split('?')[0])
}

function formatSignedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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

  useEffect(() => () => {
    if (viewer?.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url)
  }, [viewer?.url])

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

    try {
      const fileResponse = await fetch(result.url)
      if (!fileResponse.ok) throw new Error('The secure file could not be loaded.')
      const file = await fileResponse.blob()
      if (!file.size) throw new Error('The document file is empty.')
      setViewer({
        url: URL.createObjectURL(file),
        fileUrl: result.fileUrl,
        isAdmin: result.isAdmin === true,
        camperId: result.camperId,
        document: result.document,
      })
    } catch (error: any) {
      setMessage(error?.message || 'This document could not be opened. Please contact the campground office.')
    } finally {
      setLoading(false)
    }
  }

  const backHref = viewer?.isAdmin && viewer.camperId
    ? `/admin/campers/${encodeURIComponent(viewer.camperId)}?history=documents#camper-history`
    : '/documents'
  const signatureStatus = String(viewer?.document?.signatureStatus || '').toLowerCase()
  const isSigned = signatureStatus === 'signed'

  return (
    <main className="document-viewer-page">
      <section className="document-viewer-shell">
        <div className="document-viewer-header">
          <a href={backHref}>
            <ArrowLeft size={17} /> {viewer?.isAdmin ? 'Back to camper documents' : 'Back to documents'}
          </a>
          <div>
            <span><ShieldCheck size={15} /> Secure document viewer</span>
            <h1>{viewer?.document?.name || 'Review your document'}</h1>
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
            {isSigned && (
              <section className="document-viewer-signature-record" aria-label="Saved electronic signature record">
                <ShieldCheck size={22} />
                <div>
                  <small>SIGNED DOCUMENT · SECURE RECORD SAVED</small>
                  <strong>
                    Signed by {viewer.document?.signedName || 'camper'}
                    {viewer.document?.secondSignedName ? ` and ${viewer.document.secondSignedName}` : ''}
                  </strong>
                  <p>
                    {formatSignedDate(viewer.document?.signedAt)}
                    {viewer.document?.secondSignedAt ? ` · Second signature ${formatSignedDate(viewer.document.secondSignedAt)}` : ''}
                  </p>
                </div>
              </section>
            )}
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
