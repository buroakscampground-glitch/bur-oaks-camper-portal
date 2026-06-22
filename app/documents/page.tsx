'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileSignature, LockKeyhole, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signingDocument, setSigningDocument] = useState<any | null>(null)
  const [typedName, setTypedName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function openDocument(documentId: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

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
    const result = await response.json()

    if (!response.ok || !result.url) {
      window.alert('This document could not be opened. Please contact the campground office.')
      return
    }

    window.location.href = result.url
  }

  useEffect(() => {
    async function loadDocuments() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: camper } = await supabase
        .from('campers')
        .select('*')
        .ilike('email', user.email || '')
        .single()

      if (!camper) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('camper_id', camper.id)

      if (error) {
        console.error(error)
      } else {
        setDocuments(data || [])
      }

      setLoading(false)
    }

    loadDocuments()
  }, [])

  async function signDocument() {
    if (!signingDocument) return

    setSigning(true)
    setMessage('Recording your electronic signature…')

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/sign-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        documentId: signingDocument.id,
        typedName,
        consentAccepted,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setMessage(result.error || 'Unable to sign this document.')
      setSigning(false)
      return
    }

    setDocuments((current) =>
      current.map((document) =>
        document.id === signingDocument.id
          ? {
              ...document,
              signature_status: 'signed',
              signed_at: result.signedAt,
              signed_name: typedName.trim(),
              signature_record_hash: result.signatureRecordHash,
            }
          : document
      )
    )
    setSigningDocument(null)
    setTypedName('')
    setConsentAccepted(false)
    setSigning(false)
    setMessage('✅ Document signed and securely recorded.')
  }

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading documents...</p>
  }

  return (
    <main className="camper-documents-page">
      <section className="camper-documents-hero">
        <button type="button" onClick={() => router.push('/portal')}>← Back to Portal</button>
        <span><ShieldCheck size={17} /> Secure document center</span>
        <h1>Leases, renewals, and campground documents.</h1>
        <p>Review assigned documents, open the original file, and electronically sign when a signature is required.</p>
      </section>

        {documents.length === 0 && (
          <section className="camper-documents-empty">
            <FileSignature size={34} />
            <h2>No Documents Found</h2>
            <p>
              No documents have been assigned to your account yet.
            </p>
          </section>
        )}

        <div className="camper-documents-grid">
          {documents.map((doc) => (
            <section
              key={doc.id}
              className={doc.signature_status === 'signed' ? 'camper-document-card signed' : 'camper-document-card'}
            >
              <div className="camper-document-icon">
                {doc.signature_status === 'signed' ? <CheckCircle2 size={22} /> : <FileSignature size={22} />}
              </div>
              <small>{doc.document_type || 'General'}</small>
              <h2>{doc.document_name}</h2>
              <p className="camper-document-status">
                {doc.signature_status === 'signed'
                  ? `Signed${doc.signed_at ? ` on ${new Date(doc.signed_at).toLocaleDateString()}` : ''}`
                  : 'Signature pending'}
              </p>
              {doc.signed_name && <p className="camper-document-signed-name">Signed by {doc.signed_name}</p>}

              <div className="camper-document-actions">
                {doc.file_url && (
                  <button type="button" onClick={() => openDocument(String(doc.id))}>
                    View Document
                  </button>
                )}
                {doc.signature_status !== 'signed' && (
                  <button type="button" className="primary" onClick={() => { setSigningDocument(doc); setMessage('') }}>
                    Sign Lease
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>

      {message && <div className="camper-document-message">{message}</div>}

      {signingDocument && (
        <div className="signature-modal-backdrop" role="dialog" aria-modal="true">
          <section className="signature-modal">
            <span className="signature-modal-icon"><LockKeyhole size={22} /></span>
            <small>ELECTRONIC SIGNATURE</small>
            <h2>{signingDocument.document_name}</h2>
            <p>
              Before signing, open and review the document. By continuing, you agree to use
              electronic records and signatures for this Bur Oaks Campground document.
            </p>
            <label className="signature-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
              />
              <span>I agree that typing my full legal name and selecting Sign Document is my electronic signature and shows my intent to sign this document.</span>
            </label>
            <label className="signature-name-field">
              <span>Type your full legal name</span>
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="Full legal name"
              />
            </label>
            <div className="signature-modal-actions">
              <button type="button" onClick={() => openDocument(String(signingDocument.id))}>Review Document</button>
              <button type="button" onClick={() => setSigningDocument(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                onClick={signDocument}
                disabled={signing || !consentAccepted || typedName.trim().length < 3}
              >
                {signing ? 'Signing…' : 'Sign Document'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
