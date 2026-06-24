'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileSignature, LockKeyhole, ShieldCheck } from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signingDocument, setSigningDocument] = useState<any | null>(null)
  const [typedName, setTypedName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [message, setMessage] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const router = useRouter()

  async function openDocument(documentId: string) {
    router.push(`/documents/view/${documentId}`)
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
      setCurrentUserEmail(user.email?.trim().toLowerCase() || '')

      const camper = await getCurrentCamper()

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
              signature_status: result.signatureStatus || 'signed',
              ...(result.signedSlot === 'second'
                ? {
                    second_signed_at: result.signedAt,
                    second_signed_name: typedName.trim(),
                    second_signed_email: currentUserEmail,
                    second_signature_record_hash: result.signatureRecordHash,
                  }
                : {
                    signed_at: result.signedAt,
                    signed_name: typedName.trim(),
                    signed_email: currentUserEmail,
                    signature_record_hash: result.signatureRecordHash,
                  }),
            }
          : document
      )
    )
    setSigningDocument(null)
    setTypedName('')
    setConsentAccepted(false)
    setSigning(false)
    setMessage(result.signatureStatus === 'pending_second_signature'
      ? '✅ Your signature was recorded. This document is waiting for the second signer.'
      : '✅ Document signed and securely recorded.')
  }

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading documents...</p>
  }

  const documentsNeedingSignature = documents.filter(
    (doc) => doc.signature_status !== 'signed' && doc.signature_status !== 'not_required'
  )
  const signedDocuments = documents.filter((doc) => doc.signature_status === 'signed')
  const referenceDocuments = documents.filter((doc) => doc.signature_status === 'not_required')
  const signatureProgress = documents.length
    ? Math.round(((signedDocuments.length + referenceDocuments.length) / documents.length) * 100)
    : 100
  const normalizedEmail = currentUserEmail.trim().toLowerCase()
  const hasCurrentUserSigned = (doc: any) =>
    [doc.signed_email, doc.second_signed_email]
      .map((email) => String(email || '').trim().toLowerCase())
      .includes(normalizedEmail)
  const documentStatusText = (doc: any) => {
    if (doc.signature_status === 'signed') {
      if (doc.requires_two_signatures) return 'Both signatures complete'
      return `Signed${doc.signed_at ? ` on ${new Date(doc.signed_at).toLocaleDateString()}` : ''}`
    }
    if (doc.signature_status === 'not_required') return 'No signature required'
    if (doc.signature_status === 'pending_second_signature') return 'Waiting for second signer'
    return doc.requires_two_signatures ? 'Waiting for first signer' : 'Signature pending'
  }
  const canCurrentUserSign = (doc: any) =>
    doc.signature_status !== 'signed' &&
    doc.signature_status !== 'not_required' &&
    !hasCurrentUserSigned(doc)

  function renderDocumentCard(doc: any) {
    return (
      <section
        key={doc.id}
        className={doc.signature_status === 'signed' ? 'camper-document-card signed' : 'camper-document-card'}
      >
        <div className="camper-document-icon">
          {doc.signature_status === 'signed' ? <CheckCircle2 size={22} /> : <FileSignature size={22} />}
        </div>
        <small>{doc.document_type || 'General'}</small>
        <h2>{doc.document_name}</h2>
        <p className="camper-document-status">{documentStatusText(doc)}</p>
        {doc.requires_two_signatures && (
          <div className="camper-document-signers">
            <p className={doc.signed_name ? 'complete' : ''}>
              <span>Signer 1</span>
              <strong>{doc.signed_name || 'Waiting'}</strong>
            </p>
            <p className={doc.second_signed_name ? 'complete' : ''}>
              <span>Signer 2</span>
              <strong>{doc.second_signed_name || 'Waiting'}</strong>
            </p>
          </div>
        )}
        {doc.signed_name && <p className="camper-document-signed-name">Signed by {doc.signed_name}</p>}
        {doc.second_signed_name && <p className="camper-document-signed-name">Second signer: {doc.second_signed_name}</p>}
        {doc.signature_record_hash && (
          <p className="camper-document-proof">Secure signature record saved</p>
        )}

        <div className="camper-document-actions">
          {doc.file_url && (
            <button type="button" onClick={() => openDocument(String(doc.id))}>
              View Document
            </button>
          )}
          {canCurrentUserSign(doc) && (
            <button type="button" className="primary" onClick={() => { setSigningDocument(doc); setMessage('') }}>
              Sign Document
            </button>
          )}
          {!canCurrentUserSign(doc) && doc.signature_status !== 'signed' && doc.signature_status !== 'not_required' && (
            <span className="camper-document-waiting-note">Waiting for the other signer</span>
          )}
        </div>
      </section>
    )
  }

  return (
    <main className="camper-documents-page">
      <section className="camper-documents-hero">
        <button type="button" onClick={() => router.push('/portal')}>← Back to Portal</button>
        <span><ShieldCheck size={17} /> Secure document center</span>
        <h1>Leases, renewals, and campground documents.</h1>
        <p>Review assigned documents, open the original file, and electronically sign when a signature is required.</p>
        <div className="camper-documents-summary">
          <article><small>Needs signature</small><strong>{documentsNeedingSignature.length}</strong></article>
          <article><small>Signed / complete</small><strong>{signedDocuments.length + referenceDocuments.length}</strong></article>
          <article><small>Progress</small><strong>{signatureProgress}%</strong></article>
        </div>
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

        {documentsNeedingSignature.length > 0 && (
          <section className="camper-document-section">
            <div className="camper-document-section-heading">
              <span>ACTION NEEDED</span>
              <h2>Documents waiting for your signature</h2>
              <p>Open each file, review it, then sign securely in the portal.</p>
            </div>
            <div className="camper-documents-grid urgent">
              {documentsNeedingSignature.map(renderDocumentCard)}
            </div>
          </section>
        )}

        {(signedDocuments.length > 0 || referenceDocuments.length > 0) && (
          <section className="camper-document-section">
            <div className="camper-document-section-heading">
              <span>YOUR RECORDS</span>
              <h2>Signed and reference documents</h2>
              <p>These files are saved with your camper account for easy access.</p>
            </div>
            <div className="camper-documents-grid">
              {[...signedDocuments, ...referenceDocuments].map(renderDocumentCard)}
            </div>
          </section>
        )}

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
            {signingDocument.requires_two_signatures && (
              <p className="signature-two-signer-note">
                This document requires two signatures. Your signature will be saved, then the document will remain open until the second signer completes it.
              </p>
            )}
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
