'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'

function canPreviewInBrowser(fileUrl?: string) {
  if (!fileUrl) return true
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(fileUrl.split('?')[0])
}

export default function AdminTemplateViewerPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const templateId = params?.id
  const [template, setTemplate] = useState<any | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const browserPreviewAllowed = useMemo(
    () => canPreviewInBrowser(template?.storage_path),
    [template?.storage_path]
  )

  useEffect(() => {
    loadTemplate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  async function loadTemplate() {
    if (!templateId) return

    setLoading(true)
    setMessage('')

    const { data: templateData, error: templateError } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (templateError || !templateData?.storage_path) {
      setMessage('Unable to load this library document.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.storage
      .from('camper-documents')
      .createSignedUrl(templateData.storage_path, 60)

    if (error || !data?.signedUrl) {
      setMessage('Unable to open this library document.')
      setLoading(false)
      return
    }

    setTemplate(templateData)
    setUrl(data.signedUrl)
    setLoading(false)
  }

  return (
    <main className="document-viewer-page">
      <section className="document-viewer-shell">
        <div className="document-viewer-header">
          <button type="button" onClick={() => router.push('/admin/documents')}>
            <ArrowLeft size={17} /> Back to documents
          </button>
          <div>
            <span><ShieldCheck size={15} /> Admin library viewer</span>
            <h1>{template?.document_name || 'Library document'}</h1>
            <p>Preview the master template or open it in your device’s document app.</p>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={17} /> Open full screen
            </a>
          )}
        </div>

        {loading && (
          <div className="document-viewer-state">
            <FileText size={34} />
            <h2>Preparing library document…</h2>
            <p>This private link only lasts a short time.</p>
          </div>
        )}

        {!loading && message && (
          <div className="document-viewer-state">
            <FileText size={34} />
            <h2>Unable to open document</h2>
            <p>{message}</p>
            <button type="button" onClick={loadTemplate}>Try again</button>
          </div>
        )}

        {!loading && url && (
          <>
            {browserPreviewAllowed ? (
              <iframe className="document-viewer-frame" src={url} title="Library document preview" />
            ) : (
              <div className="document-viewer-state">
                <FileText size={42} />
                <h2>This file opens best in your device’s document app.</h2>
                <p>Word documents may not preview inside every browser. Tap below to open or download it.</p>
                <a href={url} target="_blank" rel="noreferrer">
                  <Download size={17} /> Open / Download Document
                </a>
              </div>
            )}

            <div className="document-viewer-footer">
              <span>Having trouble? Tap “Open full screen” or refresh the secure link.</span>
              <button type="button" onClick={loadTemplate}>Refresh secure link</button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
