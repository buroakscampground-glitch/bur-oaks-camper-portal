'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, DoorOpen, ExternalLink, FileSignature, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signingDocument, setSigningDocument] = useState<any | null>(null)
  const [typedName, setTypedName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [decliningId, setDecliningId] = useState('')
  const [message, setMessage] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [suggestedSignerName, setSuggestedSignerName] = useState('')
  const router = useRouter()

  async function openDocument(documentId: string) {
    router.push(`/documents/view/${documentId}`)
  }

  function reviewBeforeSigning(documentId: string) {
    window.open(`/documents/view/${documentId}`, '_blank', 'noopener,noreferrer')
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

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setLoading(false)
        return
      }

      const response = await fetch('/api/camper-documents', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage(result?.error || 'Unable to load your documents.')
      } else {
        setDocuments(result?.documents || [])
        setSuggestedSignerName(String(result?.suggestedSignerName || '').trim())
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

  async function declineRenewal(document: any) {
    const confirmed = window.confirm(
      'Are you sure you do not want to renew your seasonal site? This will notify the campground that you plan to leave when your current agreement ends.'
    )
    if (!confirmed) return

    setDecliningId(String(document.id))
    setMessage('Recording your decision…')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/renewal-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentId: document.id, decision: 'not-renew' }),
    })
    const result = await response.json().catch(() => null)
    setDecliningId('')

    if (!response.ok) {
      setMessage(result?.error || 'Your decision could not be recorded. Please contact the office.')
      return
    }

    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, signature_status: 'declined' } : item))
    setMessage('Your decision not to renew was recorded. The campground office has been notified.')
  }

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading documents...</p>
  }

  const documentsNeedingSignature = documents.filter(
    (doc) => doc.signature_status !== 'signed' && doc.signature_status !== 'not_required' && doc.signature_status !== 'declined'
  )
  const signedDocuments = documents.filter((doc) => doc.signature_status === 'signed')
  const referenceDocuments = documents.filter((doc) => doc.signature_status === 'not_required')
  const declinedDocuments = documents.filter((doc) => doc.signature_status === 'declined')
  const signatureProgress = documents.length
    ? Math.round(((signedDocuments.length + referenceDocuments.length + declinedDocuments.length) / documents.length) * 100)
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
    if (doc.signature_status === 'declined') return 'You chose not to renew; the office was notified'
    if (doc.signature_status === 'pending_second_signature') return 'Waiting for second signer'
    return doc.requires_two_signatures ? 'Waiting for first signer' : 'Signature pending'
  }
  const canCurrentUserSign = (doc: any) =>
    doc.signature_status !== 'signed' &&
    doc.signature_status !== 'not_required' &&
    doc.signature_status !== 'declined' &&
    !hasCurrentUserSigned(doc)

  const isRenewalDocument = (doc: any) => /renewal/i.test(`${doc.document_name || ''} ${doc.document_type || ''}`)

  function beginSigning(document: any) {
    setSigningDocument(document)
    setTypedName(suggestedSignerName)
    setConsentAccepted(false)
    setMessage('')
  }

  function renderDocumentCard(doc: any) {
    return (
      <section
        key={doc.id}
        className={doc.signature_status === 'signed' ? 'camper-document-card signed' : doc.signature_status === 'declined' ? 'camper-document-card declined' : 'camper-document-card'}
      >
        <div className="camper-document-icon">
          {doc.signature_status === 'signed' ? <CheckCircle2 size={22} /> : doc.signature_status === 'declined' ? <DoorOpen size={22} /> : <FileSignature size={22} />}
        </div>
        <small>{doc.document_type || 'General'}</small>
        <h2>{doc.document_name}</h2>
        {doc.access_is_delegated && (
          <p className="camper-document-shared-account">
            Authorized family account · Lot {doc.access_lot_number || '—'} · {doc.access_camper_name || 'Camper'}
          </p>
        )}
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
            <button type="button" className="primary" onClick={() => beginSigning(doc)}>
              Review &amp; Sign
            </button>
          )}
          {canCurrentUserSign(doc) && isRenewalDocument(doc) && !doc.access_is_delegated && (
            <button type="button" className="decline-renewal" disabled={decliningId === String(doc.id)} onClick={() => declineRenewal(doc)}>
              <DoorOpen size={15} /> {decliningId === String(doc.id) ? 'Recording…' : 'I Am Not Renewing'}
            </button>
          )}
          {!canCurrentUserSign(doc) && doc.signature_status !== 'signed' && doc.signature_status !== 'not_required' && doc.signature_status !== 'declined' && (
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
        <p>Review documents assigned to your campsite or an authorized family account, open the original file, and electronically sign when required.</p>
        <div className="camper-documents-summary">
          <article><small>Needs signature</small><strong>{documentsNeedingSignature.length}</strong></article>
          <article><small>Completed / records</small><strong>{signedDocuments.length + referenceDocuments.length + declinedDocuments.length}</strong></article>
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

        {(signedDocuments.length > 0 || referenceDocuments.length > 0 || declinedDocuments.length > 0) && (
          <section className="camper-document-section">
            <div className="camper-document-section-heading">
              <span>YOUR RECORDS</span>
              <h2>Signed, declined, and reference documents</h2>
              <p>These files are saved with your camper account for easy access.</p>
            </div>
            <div className="camper-documents-grid">
              {[...signedDocuments, ...declinedDocuments, ...referenceDocuments].map(renderDocumentCard)}
            </div>
          </section>
        )}

      {message && <div className="camper-document-message">{message}</div>}

      {signingDocument && (
        <div className="signature-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="signature-modal-title">
          <section className="signature-modal">
            <div className="signature-modal-heading">
              <span className="signature-modal-icon"><LockKeyhole size={22} /></span>
              <div>
                <small>SECURE ELECTRONIC SIGNATURE</small>
                <h2 id="signature-modal-title">Review and sign</h2>
                <p>{signingDocument.document_name}</p>
              </div>
              <button type="button" className="signature-modal-close" aria-label="Close signing window" onClick={() => setSigningDocument(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="signature-simple-steps" aria-label="Three signing steps">
              <span><b>1</b> Review</span>
              <span><b>2</b> Confirm</span>
              <span><b>3</b> Sign</span>
            </div>
            <button type="button" className="signature-review-button" onClick={() => reviewBeforeSigning(String(signingDocument.id))}>
              <ExternalLink size={17} /> Open document to review <small>(new tab)</small>
            </button>
            {signingDocument.requires_two_signatures && (
              <p className="signature-two-signer-note">
                <strong>Two signatures are required.</strong> Yours will be saved now; the other person can sign from their own login afterward.
              </p>
            )}
            <label className="signature-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
              />
              <span><strong>I reviewed and agree to this document.</strong> I agree to use electronic records and understand that typing my full legal name and selecting “Sign Document Securely” is my electronic signature and shows my intent to sign this document.</span>
            </label>
            <label className="signature-name-field">
              <span>Full legal name</span>
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="Full legal name"
                autoComplete="name"
                autoCapitalize="words"
              />
              <small>{suggestedSignerName ? 'We filled this in from your profile. Check that it is correct.' : 'Type your name exactly as you want it recorded.'}</small>
            </label>
            <p className={consentAccepted && typedName.trim().length >= 3 ? 'signature-submit-note ready' : 'signature-submit-note'}>
              <Check size={15} />
              {!consentAccepted
                ? 'Check the agreement box above to enable signing.'
                : typedName.trim().length < 3
                  ? 'Enter your full legal name to enable signing.'
                  : 'Ready. Nothing is submitted until you tap the green button.'}
            </p>
            <div className="signature-modal-actions">
              <button type="button" onClick={() => setSigningDocument(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                onClick={signDocument}
                disabled={signing || !consentAccepted || typedName.trim().length < 3}
              >
                {signing ? 'Signing securely…' : 'Sign Document Securely'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
