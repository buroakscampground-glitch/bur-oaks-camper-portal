'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, DoorOpen, FileSignature, FileText, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  camperCanSignDocument,
  camperDocumentFilters,
  camperDocumentWaitsForAnotherSigner,
  filterCamperDocuments,
  hasCamperSignedDocument,
  isRenewalDocument,
  normalizeCamperDocumentFilter,
  type CamperDocumentFilter,
} from '../../lib/camper-document-center'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [signingDocument, setSigningDocument] = useState<any | null>(null)
  const [typedName, setTypedName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [renewalDecision, setRenewalDecision] = useState<'renew' | 'not-renew' | ''>('')
  const [signing, setSigning] = useState(false)
  const [decliningId, setDecliningId] = useState('')
  const [message, setMessage] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [suggestedSignerName, setSuggestedSignerName] = useState('')
  const [signingPreviewUrl, setSigningPreviewUrl] = useState('')
  const [signingPreviewLoading, setSigningPreviewLoading] = useState(false)
  const [signingPreviewError, setSigningPreviewError] = useState('')
  const [documentFilter, setDocumentFilter] = useState<CamperDocumentFilter>('all')
  const signingRef = useRef(false)
  const decliningRef = useRef('')
  const router = useRouter()

  function sendToLogin() {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`
  }

  async function openDocument(documentId: string) {
    router.push(`/documents/view/${documentId}`)
  }

  async function loadDocuments() {
    setLoading(true)
    setLoadError('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        sendToLogin()
        return
      }
      setCurrentUserEmail(user.email?.trim().toLowerCase() || '')

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        throw new Error('Your session could not be verified.')
      }

      const response = await fetch('/api/camper-documents', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) throw new Error(result?.error || 'Unable to load your documents.')
      {
        const loadedDocuments = result?.documents || []
        const signerName = String(result?.suggestedSignerName || '').trim()
        setDocuments(loadedDocuments)
        setSuggestedSignerName(signerName)

        const requestedDocumentId = new URLSearchParams(window.location.search).get('sign')
        setDocumentFilter(normalizeCamperDocumentFilter(new URLSearchParams(window.location.search).get('view')))
        const requestedDocument = loadedDocuments.find((document: any) => String(document.id) === requestedDocumentId)
        const signedEmails = [requestedDocument?.signed_email, requestedDocument?.second_signed_email]
          .map((email) => String(email || '').trim().toLowerCase())
        const currentEmail = user.email?.trim().toLowerCase() || ''
        const canOpenSigning = requestedDocument &&
          !['signed', 'not_required', 'declined'].includes(String(requestedDocument.signature_status || '')) &&
          !signedEmails.includes(currentEmail)

        if (canOpenSigning) {
          setSigningDocument(requestedDocument)
          setTypedName(signerName)
          setConsentAccepted(false)
          setRenewalDecision('')
          setMessage('')
          setSigningPreviewUrl('')
          void loadSigningPreview(String(requestedDocument.id))
        }
      }

    } catch (error) {
      console.error('Unable to open camper documents:', error)
      setLoadError('We could not open your documents. Nothing was signed or changed.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  useEffect(() => () => {
    if (signingPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(signingPreviewUrl)
  }, [signingPreviewUrl])

  async function refreshDocumentState(documentId: string, token: string) {
    try {
      const response = await fetch('/api/camper-documents', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) return null
      const latestDocuments = result?.documents || []
      setDocuments(latestDocuments)
      return latestDocuments.find((document: any) => String(document.id) === String(documentId)) || null
    } catch {
      return null
    }
  }

  async function signDocument() {
    if (signingRef.current) return
    if (!signingDocument) return

    signingRef.current = true
    setSigning(true)
    setMessage('Recording your electronic signature…')

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      signingRef.current = false
      setSigning(false)
      sendToLogin()
      return
    }

    const documentId = String(signingDocument.id)

    let response: Response
    let result: any
    try {
      response = await fetch('/api/sign-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId,
          typedName,
          consentAccepted,
          renewalDecision,
        }),
      })
      result = await response.json().catch(() => null)
    } catch {
      const latestDocument = await refreshDocumentState(documentId, token)
      const signedEmails = [latestDocument?.signed_email, latestDocument?.second_signed_email]
        .map((email) => String(email || '').trim().toLowerCase())

      if (signedEmails.includes(currentUserEmail)) {
        setSigningDocument(null)
        setSigningPreviewUrl('')
        setMessage('✅ Your signature was securely recorded. The connection dropped after it was saved, so the document center refreshed its status.')
      } else {
        setMessage('We could not confirm whether your signature was recorded. Your entries are still here—check the document status before selecting Sign & Finish again.')
      }
      signingRef.current = false
      setSigning(false)
      return
    }

    if (!response.ok) {
      if (response.status === 409) await refreshDocumentState(documentId, token)
      setMessage(result?.error || 'Unable to sign this document. Check its current status before trying again.')
      signingRef.current = false
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
    setSigningPreviewUrl('')
    setSigningPreviewError('')
    setTypedName('')
    setConsentAccepted(false)
    setRenewalDecision('')
    signingRef.current = false
    setSigning(false)
    setMessage(result.signatureStatus === 'pending_second_signature'
      ? '✅ Your signature was recorded. This document is waiting for the second signer.'
      : '✅ Document signed and securely recorded.')
  }

  async function declineRenewal(document: any) {
    const documentId = String(document.id)
    if (decliningRef.current) return

    const confirmed = window.confirm(
      'Are you sure you do not want to renew your seasonal site? This will notify the campground that you plan to leave when your current agreement ends.'
    )
    if (!confirmed) return

    decliningRef.current = documentId
    setDecliningId(documentId)
    setMessage('Recording your decision…')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      decliningRef.current = ''
      setDecliningId('')
      sendToLogin()
      return
    }

    let response: Response
    let result: any
    try {
      response = await fetch('/api/renewal-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentId, decision: 'not-renew' }),
      })
      result = await response.json().catch(() => null)
    } catch {
      const latestDocument = await refreshDocumentState(documentId, token)
      decliningRef.current = ''
      setDecliningId('')
      if (latestDocument?.signature_status === 'declined') {
        setSigningDocument(null)
        setRenewalDecision('')
        setSigningPreviewUrl('')
        setMessage('Your decision not to renew was recorded. The connection dropped after it was saved, so the document center refreshed its status.')
      } else {
        setMessage('We could not confirm whether your decision was recorded. Check the document status before selecting I Am Not Renewing again.')
      }
      return
    }
    decliningRef.current = ''
    setDecliningId('')

    if (!response.ok) {
      setMessage(result?.error || 'Your decision could not be recorded. Please contact the office.')
      return
    }

    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, signature_status: 'declined' } : item))
    if (signingDocument?.id === document.id) {
      setSigningDocument(null)
      setRenewalDecision('')
      setSigningPreviewUrl('')
    }
    setMessage('Your decision not to renew was recorded. The campground office has been notified.')
  }

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading documents...</p>
  }

  if (loadError) {
    return (
      <main className="camper-portal-page">
        <div className="portal-loading" role="alert">
          <AlertTriangle size={34} />
          <p>{loadError}</p>
          <button className="portal-loading-retry" type="button" onClick={loadDocuments}>Try again</button>
          <a href="/portal">Back to portal</a>
        </div>
      </main>
    )
  }

  const hasCurrentUserSigned = (doc: any) => hasCamperSignedDocument(doc, currentUserEmail)
  const canCurrentUserSign = (doc: any) => camperCanSignDocument(doc, currentUserEmail)
  const documentsNeedingSignature = documents.filter(canCurrentUserSign)
  const documentsWaitingForOthers = documents.filter((doc) => camperDocumentWaitsForAnotherSigner(doc, currentUserEmail))
  const signedDocuments = documents.filter((doc) => doc.signature_status === 'signed')
  const referenceDocuments = documents.filter((doc) => doc.signature_status === 'not_required')
  const declinedDocuments = documents.filter((doc) => doc.signature_status === 'declined')
  const documentStatusText = (doc: any) => {
    if (doc.signature_status === 'signed') {
      if (doc.requires_two_signatures) return 'Both signatures complete'
      return `Signed${doc.signed_at ? ` on ${new Date(doc.signed_at).toLocaleDateString()}` : ''}`
    }
    if (doc.signature_status === 'not_required') return 'No signature required'
    if (doc.signature_status === 'declined') return 'You chose not to renew; the office was notified'
    if (doc.signature_status === 'pending_second_signature' && hasCurrentUserSigned(doc)) return 'Your signature is saved — waiting for the other signer'
    if (doc.signature_status === 'pending_second_signature') return 'Your signature is required as the second signer'
    return 'Your signature is required'
  }

  const pendingRenewalDocuments = documentsNeedingSignature.filter(isRenewalDocument)
  const visibleDocuments = filterCamperDocuments(documents, documentFilter, currentUserEmail)
  const visibleNeedingSignature = visibleDocuments.filter(canCurrentUserSign)
  const visibleWaitingForOthers = visibleDocuments.filter((doc) => camperDocumentWaitsForAnotherSigner(doc, currentUserEmail))
  const visibleSignedDocuments = visibleDocuments.filter((doc) => doc.signature_status === 'signed')
  const visibleReferenceDocuments = visibleDocuments.filter((doc) => doc.signature_status === 'not_required')
  const visibleDeclinedDocuments = visibleDocuments.filter((doc) => doc.signature_status === 'declined')

  function selectDocumentFilter(filter: CamperDocumentFilter) {
    setDocumentFilter(filter)
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('view')
    else url.searchParams.set('view', filter)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  async function loadSigningPreview(documentId: string) {
    setSigningPreviewLoading(true)
    setSigningPreviewError('')
    setSigningPreviewUrl('')

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      sendToLogin()
      return
    }

    const response = await fetch('/api/document-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentId }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.url) {
      setSigningPreviewLoading(false)
      setSigningPreviewError(result?.error || 'The document preview could not be opened. Please try again.')
      return
    }

    try {
      const fileResponse = await fetch(result.url)
      if (!fileResponse.ok) throw new Error('The secure file could not be loaded.')
      const file = await fileResponse.blob()
      if (!file.size) throw new Error('The document file is empty.')
      const localPreviewUrl = URL.createObjectURL(file)
      setSigningPreviewUrl(localPreviewUrl)
    } catch (error: any) {
      setSigningPreviewError(error?.message || 'The document preview could not be opened. Please try again.')
    } finally {
      setSigningPreviewLoading(false)
    }
  }

  function closeSigning() {
    setSigningDocument(null)
    setRenewalDecision('')
    setConsentAccepted(false)
    setSigningPreviewUrl('')
    setSigningPreviewError('')
    setSigningPreviewLoading(false)
  }

  function beginSigning(document: any) {
    setSigningDocument(document)
    setTypedName(suggestedSignerName)
    setConsentAccepted(false)
    setRenewalDecision('')
    setMessage('')
    setSigningPreviewUrl('')
    void loadSigningPreview(String(document.id))
  }

  function displayRenewalDate(value: unknown) {
    const raw = String(value || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Needs office review'
    return new Date(`${raw}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function renderDocumentCard(doc: any) {
    const needsSignature = canCurrentUserSign(doc)
    const waitingForOtherSigner = documentsWaitingForOthers.includes(doc)

    return (
      <section
        key={doc.id}
        className={doc.signature_status === 'signed'
          ? 'camper-document-card signed'
            : doc.signature_status === 'declined'
              ? 'camper-document-card declined'
            : waitingForOtherSigner
              ? 'camper-document-card waiting'
            : needsSignature
              ? 'camper-document-card needs-signature'
              : 'camper-document-card'}
      >
        <div className="camper-document-icon">
          {doc.signature_status === 'signed' ? <CheckCircle2 size={22} /> : doc.signature_status === 'declined' ? <DoorOpen size={22} /> : <FileSignature size={22} />}
        </div>
        <small>{doc.document_type || 'General'}</small>
        <h2>{doc.document_name}</h2>
        {needsSignature && (
          <p className="camper-document-needs-signature">
            <AlertTriangle size={17} /> <strong>DOCUMENT NEEDS SIGNED</strong>
          </p>
        )}
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
        {canCurrentUserSign(doc) && isRenewalDocument(doc) && (
          <p className="camper-renewal-deadline-warning">
            <AlertTriangle size={17} />
            <span><strong>Renewal signature required.</strong> Failure to sign and return this renewal by the deadline will be treated as non-renewal. When your current lease expires, the office will consider the site available to rent to another camper.</span>
          </p>
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
          <article><small>Your action</small><strong>{documentsNeedingSignature.length}</strong></article>
          <article><small>Waiting on others</small><strong>{documentsWaitingForOthers.length}</strong></article>
          <article><small>Completed / records</small><strong>{signedDocuments.length + referenceDocuments.length + declinedDocuments.length}</strong></article>
        </div>
      </section>

        {documentsNeedingSignature.length > 0 && (
          <section className="camper-signature-required-banner" aria-label="Signature action required">
            <span><AlertTriangle size={26} /></span>
            <div>
              <small>ACTION REQUIRED</small>
              <h2>{documentsNeedingSignature.length} document{documentsNeedingSignature.length === 1 ? '' : 's'} need your signature.</h2>
              <p>Open each document, review it, and select <strong>Review &amp; Sign</strong> to complete it.</p>
              {pendingRenewalDocuments.length > 0 && (
                <p className="camper-signature-renewal-rule"><strong>Important renewal notice:</strong> Failure to sign and return a renewal by its deadline will be treated as non-renewal. When the current lease expires, the office will consider that campsite available to rent to another camper.</p>
              )}
            </div>
            <a href="#documents-to-sign">Sign now</a>
          </section>
        )}

        {documents.length > 0 && (
          <section className="camper-document-filters" aria-labelledby="document-filter-heading">
            <div>
              <small>FIND A DOCUMENT</small>
              <h2 id="document-filter-heading">Show only what you need</h2>
              <p>Your files stay unchanged. These buttons only organize what is visible on this screen.</p>
            </div>
            <div className="camper-document-filter-buttons" role="group" aria-label="Filter documents">
              {camperDocumentFilters.map((filter) => {
                const count = filterCamperDocuments(documents, filter.key, currentUserEmail).length
                return (
                  <button
                    key={filter.key}
                    type="button"
                    className={documentFilter === filter.key ? 'active' : ''}
                    aria-pressed={documentFilter === filter.key}
                    onClick={() => selectDocumentFilter(filter.key)}
                  >
                    <span>{filter.label}</span><strong>{count}</strong>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {documents.length === 0 && (
          <section className="camper-documents-empty">
            <FileSignature size={34} />
            <h2>No Documents Found</h2>
            <p>
              No documents have been assigned to your account yet.
            </p>
          </section>
        )}

        {visibleNeedingSignature.length > 0 && (
          <section className="camper-document-section" id="documents-to-sign">
            <div className="camper-document-section-heading">
              <span>ACTION NEEDED</span>
              <h2>Documents waiting for your signature</h2>
              <p>Open each file, review it, then sign securely in the portal.</p>
            </div>
            <div className="camper-documents-grid urgent">
              {visibleNeedingSignature.map(renderDocumentCard)}
            </div>
          </section>
        )}

        {visibleWaitingForOthers.length > 0 && (
          <section className="camper-document-section">
            <div className="camper-document-section-heading">
              <span>YOU ARE DONE FOR NOW</span>
              <h2>Waiting for another signer</h2>
              <p>Your signature is safely recorded. The other signer must finish these documents; no repeat signature is needed from you.</p>
            </div>
            <div className="camper-documents-grid waiting">
              {visibleWaitingForOthers.map(renderDocumentCard)}
            </div>
          </section>
        )}

        {(visibleSignedDocuments.length > 0 || visibleReferenceDocuments.length > 0 || visibleDeclinedDocuments.length > 0) && (
          <section className="camper-document-section">
            <div className="camper-document-section-heading">
              <span>YOUR RECORDS</span>
              <h2>Signed, declined, and reference documents</h2>
              <p>These files are saved with your camper account for easy access.</p>
            </div>
            <div className="camper-documents-grid">
              {[...visibleSignedDocuments, ...visibleDeclinedDocuments, ...visibleReferenceDocuments].map(renderDocumentCard)}
            </div>
          </section>
        )}

        {documents.length > 0 && visibleDocuments.length === 0 && (
          <section className="camper-documents-empty filtered" role="status">
            <FileText size={34} />
            <h2>No documents in this view</h2>
            <p>Choose another filter to see the rest of your document center.</p>
            <button type="button" onClick={() => selectDocumentFilter('all')}>Show all documents</button>
          </section>
        )}

      {message && <div className="camper-document-message" role="status" aria-live="polite">{message}</div>}

      {signingDocument && (
        <div className="signature-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="signature-modal-title">
          <section className="signature-modal">
            <div className="signature-modal-heading">
              <span className="signature-modal-icon"><LockKeyhole size={22} /></span>
              <div>
                <small>SECURE ELECTRONIC SIGNATURE</small>
                <h2 id="signature-modal-title">Review and sign</h2>
                <p>{signingDocument.document_name} · Review, sign, and you are done.</p>
              </div>
              <button type="button" className="signature-modal-close" aria-label="Close signing window" onClick={closeSigning} disabled={signing || Boolean(decliningId)}>
                <X size={20} />
              </button>
            </div>
            <div className="signature-simple-steps" aria-label="Three signing steps">
              <span><b>1</b> Review</span>
              <span><b>2</b> Confirm</span>
              <span><b>3</b> Done</span>
            </div>
            {isRenewalDocument(signingDocument) && (
              signingDocument.renewal_details?.complete ? (
                <section className="signature-renewal-details" aria-label="Required renewal information">
                  <header><ShieldCheck size={18} /><div><small>REQUIRED INFORMATION</small><strong>Renewal details for this campsite</strong></div></header>
                  <dl>
                    <div><dt>Camper</dt><dd>{signingDocument.renewal_details.camper_name}</dd></div>
                    <div><dt>Site</dt><dd>Lot {signingDocument.renewal_details.lot_number}</dd></div>
                    <div><dt>Current agreement ends</dt><dd>{displayRenewalDate(signingDocument.renewal_details.contract_end_date)}</dd></div>
                    <div><dt>Signature due</dt><dd>{displayRenewalDate(signingDocument.renewal_details.response_due_date)}</dd></div>
                    <div><dt>Payment schedule</dt><dd>{signingDocument.renewal_details.payment_plan}</dd></div>
                    {signingDocument.renewal_details.annual_rent && <div><dt>Annual lot rent</dt><dd>${Number(signingDocument.renewal_details.annual_rent).toFixed(2)}</dd></div>}
                  </dl>
                  <p>These details are attached to your secure signature record. If anything is incorrect, close this window and contact the office before signing.</p>
                </section>
              ) : (
                <section className="signature-renewal-details incomplete" role="alert">
                  <header><AlertTriangle size={18} /><div><small>OFFICE REVIEW REQUIRED</small><strong>This renewal is missing required campsite information.</strong></div></header>
                  <p>The portal has stopped signing so an incomplete renewal cannot be accepted. The campground office must correct it before sending another reminder.</p>
                </section>
              )
            )}
            {isRenewalDocument(signingDocument) && (
              <section className="signature-renewal-choice" aria-labelledby="renewal-choice-heading">
                <small>RENEWAL CHOICE</small>
                <h3 id="renewal-choice-heading">Are you renewing Lot {signingDocument.renewal_details?.lot_number || signingDocument.access_lot_number || '—'}?</h3>
                <p>Choose here—the PDF preview below is read-only and its printed boxes cannot be clicked.</p>
                <div>
                  <label className={renewalDecision === 'renew' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name={`renewal-decision-${signingDocument.id}`}
                      value="renew"
                      checked={renewalDecision === 'renew'}
                      onChange={() => { setRenewalDecision('renew'); setConsentAccepted(false) }}
                    />
                    <span><strong>Yes</strong><small>I am renewing this site</small></span>
                  </label>
                  <label className={renewalDecision === 'not-renew' ? 'selected danger' : ''}>
                    <input
                      type="radio"
                      name={`renewal-decision-${signingDocument.id}`}
                      value="not-renew"
                      checked={renewalDecision === 'not-renew'}
                      onChange={() => { setRenewalDecision('not-renew'); setConsentAccepted(false) }}
                    />
                    <span><strong>No</strong><small>I am not renewing this site</small></span>
                  </label>
                </div>
                {renewalDecision === 'renew' && <p className="signature-renewal-choice-confirmed"><CheckCircle2 size={16} /> Yes selected. Review the document, then sign below.</p>}
                {renewalDecision === 'not-renew' && (
                  signingDocument.access_is_delegated
                    ? <p className="signature-renewal-choice-warning">The primary account holder must record a non-renewal decision for this site. Please contact the office if that person cannot sign in.</p>
                    : <button type="button" className="signature-renewal-decline" disabled={decliningId === String(signingDocument.id)} onClick={() => declineRenewal(signingDocument)}>
                        <DoorOpen size={15} /> {decliningId === String(signingDocument.id) ? 'Recording…' : 'Confirm I Am Not Renewing'}
                      </button>
                )}
              </section>
            )}
            <div className="signature-inline-document" aria-label="Document to review before signing">
              <div className="signature-inline-document-heading">
                <FileText size={17} />
                <span><strong>1. Read the document below</strong><small>No download is needed.</small></span>
              </div>
              {signingPreviewLoading && <p>Opening your secure document…</p>}
              {!signingPreviewLoading && signingPreviewError && (
                <div className="signature-inline-document-error">
                  <p>{signingPreviewError}</p>
                  <button type="button" onClick={() => loadSigningPreview(String(signingDocument.id))}>Try again</button>
                </div>
              )}
              {signingPreviewUrl && <iframe src={signingPreviewUrl} title={signingDocument.document_name || 'Document preview'} />}
            </div>
            {signingDocument.requires_two_signatures && (
              <p className="signature-two-signer-note">
                <strong>Two signatures are required.</strong> Yours will be saved now; the other person can sign from their own login afterward.
              </p>
            )}
            {(!isRenewalDocument(signingDocument) || renewalDecision === 'renew') && (
              <>
                <label className="signature-consent">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => setConsentAccepted(event.target.checked)}
                  />
                  <span><strong>I reviewed and agree to this document.</strong> I agree to use electronic records and understand that typing my full legal name and selecting “Sign &amp; Finish” is my electronic signature and shows my intent to sign this document.</span>
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
                  <button type="button" onClick={closeSigning}>Cancel</button>
                  <button
                    type="button"
                    className="primary"
                    onClick={signDocument}
                    disabled={signing || !consentAccepted || typedName.trim().length < 3 || (isRenewalDocument(signingDocument) && (renewalDecision !== 'renew' || !signingDocument.renewal_details?.complete))}
                  >
                    {signing ? 'Signing securely…' : 'Sign & Finish'}
                  </button>
                </div>
              </>
            )}
            {isRenewalDocument(signingDocument) && !renewalDecision && (
              <p className="signature-renewal-choice-required">Select Yes or No above to continue.</p>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
