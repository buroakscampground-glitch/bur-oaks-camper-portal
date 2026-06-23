'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArchiveRestore,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FileStack,
  FileUp,
  GripVertical,
  Loader2,
  LockKeyhole,
  Search,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024

export default function AdminDocumentsPage() {
  const router = useRouter()
  const [campers, setCampers] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('Lease')
  const [assignedFile, setAssignedFile] = useState<File | null>(null)
  const [templateFiles, setTemplateFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  const [assigningCamperId, setAssigningCamperId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [draggedTemplateId, setDraggedTemplateId] = useState('')
  const [libraryDropActive, setLibraryDropActive] = useState(false)
  const [camperSearch, setCamperSearch] = useState('')
  const [signatureSearch, setSignatureSearch] = useState('')
  const [signatureView, setSignatureView] = useState<'waiting' | 'signed'>('waiting')
  const [futureTemplateId, setFutureTemplateId] = useState('')
  const [removingDocumentId, setRemovingDocumentId] = useState('')

  async function loadData() {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    const [camperResult, templateResult, documentResponse] = await Promise.all([
      supabase.from('campers').select('*').eq('active', true).order('lot_number'),
      supabase.from('document_templates').select('*').order('created_at', { ascending: false }),
      token
        ? fetch('/api/admin-documents', {
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve(null),
    ])

    setCampers(camperResult.data || [])
    setTemplates(templateResult.data || [])

    if (documentResponse) {
      const documentResult = await documentResponse.json().catch(() => null)
      if (documentResponse.ok) {
        setDocuments(documentResult?.documents || [])
      } else {
        setDocuments([])
        setMessage(documentResult?.error || 'Unable to load assigned documents.')
      }
    } else {
      setDocuments([])
    }

    if (templateResult.error && /document_templates/i.test(templateResult.error.message)) {
      setMessage('Run migration 009 before adding the launch templates.')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function documentTypeForFile(file: File) {
    if (/lease|renewal/i.test(file.name)) return 'Lease / Renewal Template'
    if (/rule|policy|agreement/i.test(file.name)) return 'Campground Form Template'
    return 'Reusable Document Template'
  }

  function isAllowedDocument(file: File) {
    return (
      /\.(docx|doc|pdf)$/i.test(file.name) ||
      [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.type)
    )
  }

  function displayNameForFile(file: File) {
    return file.name
      .replace(/\.(docx|doc|pdf)$/i, '')
      .replace('$1500', '$1,500')
      .replace(/[-_]+/g, ' ')
      .trim()
  }

  async function addTemplatesToLibrary() {
    if (templateFiles.length === 0) {
      setMessage('Drop or select at least one document to add to the library.')
      return
    }

    setWorking(true)
    setMessage(`Adding ${templateFiles.length} document${templateFiles.length === 1 ? '' : 's'} to the library…`)

    try {
      for (const file of templateFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const storagePath = `templates/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('camper-documents')
          .upload(storagePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          })
        if (uploadError) throw uploadError

        const { error: rowError } = await supabase.from('document_templates').insert({
          document_name: displayNameForFile(file),
          document_type: documentTypeForFile(file),
          storage_path: storagePath,
        })
        if (rowError) {
          await supabase.storage.from('camper-documents').remove([storagePath])
          throw rowError
        }
      }

      setTemplateFiles([])
      setMessage('Documents added to the library. You can drag them onto campers whenever needed.')
      await loadData()
    } catch (error: any) {
      setMessage(error.message || 'Unable to add documents to the library.')
    } finally {
      setWorking(false)
    }
  }

  function setLibraryTemplateFiles(files: File[]) {
    const allowedFiles = files.filter(isAllowedDocument)
    const oversizedFile = allowedFiles.find((file) => file.size > MAX_DOCUMENT_SIZE)

    if (allowedFiles.length !== files.length) {
      setMessage('Only PDF or Word documents can be added to the library.')
    } else if (oversizedFile) {
      setMessage('Documents must be 20 MB or smaller.')
      setTemplateFiles([])
      return
    } else {
      setMessage('')
    }

    setTemplateFiles(allowedFiles)
  }

  async function uploadAssignedDocument() {
    if (!camperId) return setMessage('Please select a camper.')
    if (!assignedFile) return setMessage('Please select a file.')
    if (!isAllowedDocument(assignedFile)) return setMessage('Assigned documents must be PDF or Word files.')
    if (assignedFile.size > MAX_DOCUMENT_SIZE) return setMessage('Assigned documents must be 20 MB or smaller.')
    if (!documentName.trim()) return setMessage('Please enter a document name.')

    setWorking(true)
    setMessage('Uploading assigned document…')
    const safeName = assignedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${camperId}/${crypto.randomUUID()}-${safeName}`

    try {
      const { error: uploadError } = await supabase.storage.from('camper-documents').upload(filePath, assignedFile)
      if (uploadError) throw uploadError

      const { error } = await supabase.from('documents').insert({
        camper_id: camperId,
        document_name: documentName.trim(),
        document_type: documentType,
        file_url: filePath,
        signature_status: 'pending',
      })

      if (error) {
        await supabase.storage.from('camper-documents').remove([filePath])
        throw error
      }

      setCamperId('')
      setDocumentName('')
      setAssignedFile(null)
      setMessage('Document assigned successfully.')
    } catch (error: any) {
      setMessage(error.message || 'Unable to assign the document.')
    } finally {
      setWorking(false)
    }
  }

  async function assignLibraryDocumentFromDropdown() {
    if (!camperId) return setMessage('Please select a camper.')
    if (!futureTemplateId) return setMessage('Please select a document from the library.')

    await assignTemplateToCamper(futureTemplateId, camperId)
    setCamperId('')
    setFutureTemplateId('')
  }

  async function openTemplate(template: any) {
    router.push(`/admin/documents/templates/${template.id}`)
  }

  async function deleteTemplate(template: any) {
    if (!window.confirm(`Delete ${template.document_name}?`)) return
    await supabase.storage.from('camper-documents').remove([template.storage_path])
    const { error } = await supabase.from('document_templates').delete().eq('id', template.id)
    setMessage(error ? error.message : 'Template deleted.')
    if (!error) await loadData()
  }

  async function assignTemplateToCamper(templateId: string, targetCamperId: string) {
    if (working || !templateId || !targetCamperId) return

    const template = templates.find((item) => String(item.id) === String(templateId))
    const camper = campers.find((item) => String(item.id) === String(targetCamperId))
    if (!template || !camper) return setMessage('Please select a lease and camper.')

    const alreadyAssigned = documents.some(
      (document) =>
        String(document.camper_id) === String(targetCamperId) &&
        String(document.document_name).trim().toLowerCase() ===
          String(template.document_name).trim().toLowerCase()
    )

    if (alreadyAssigned) {
      setMessage(`${template.document_name} is already assigned to ${camper.first_name} ${camper.last_name}.`)
      return
    }

    setWorking(true)
    setAssigningCamperId(targetCamperId)
    setMessage(`Assigning ${template.document_name} to ${camper.first_name}…`)

    const originalName = String(template.storage_path).split('/').pop() || 'seasonal-lease.docx'
    const cleanName = originalName.replace(/^[0-9a-f-]{36}-/i, '')
    const destinationPath = `${targetCamperId}/${crypto.randomUUID()}-${cleanName}`

    try {
      const { error: copyError } = await supabase.storage
        .from('camper-documents')
        .copy(template.storage_path, destinationPath)
      if (copyError) throw copyError

      const { error: insertError } = await supabase.from('documents').insert({
        camper_id: targetCamperId,
        document_name: template.document_name,
        document_type: template.document_type || 'Seasonal Lease',
        file_url: destinationPath,
        signature_status: 'pending',
      })

      if (insertError) {
        await supabase.storage.from('camper-documents').remove([destinationPath])
        throw insertError
      }

      setSelectedTemplateId('')
      setMessage(`${template.document_name} was assigned to Lot ${camper.lot_number} — ${camper.first_name} ${camper.last_name}.`)
      await loadData()
    } catch (error: any) {
      setMessage(error.message || 'Unable to assign this lease.')
    } finally {
      setWorking(false)
      setAssigningCamperId('')
      setDraggedTemplateId('')
    }
  }

  async function assignSelectedTemplateToVisibleCampers() {
    if (!selectedTemplateId) {
      setMessage('Select a library document first.')
      return
    }

    const ok = window.confirm(`Assign the selected document to ${filteredCampers.length} visible camper${filteredCampers.length === 1 ? '' : 's'}? Campers who already have it will be skipped.`)
    if (!ok) return

    let assigned = 0
    setWorking(true)

    for (const camper of filteredCampers) {
      const template = templates.find((item) => String(item.id) === String(selectedTemplateId))
      if (!template) break

      const alreadyAssigned = documents.some(
        (document) =>
          String(document.camper_id) === String(camper.id) &&
          String(document.document_name).trim().toLowerCase() ===
            String(template.document_name).trim().toLowerCase()
      )
      if (alreadyAssigned) continue

      const originalName = String(template.storage_path).split('/').pop() || 'seasonal-lease.docx'
      const cleanName = originalName.replace(/^[0-9a-f-]{36}-/i, '')
      const destinationPath = `${camper.id}/${crypto.randomUUID()}-${cleanName}`

      const { error: copyError } = await supabase
        .storage
        .from('camper-documents')
        .copy(template.storage_path, destinationPath)
      if (copyError) continue

      const { error: insertError } = await supabase.from('documents').insert({
        camper_id: camper.id,
        document_name: template.document_name,
        document_type: template.document_type || 'Seasonal Lease',
        file_url: destinationPath,
        signature_status: 'pending',
      })

      if (insertError) {
        await supabase.storage.from('camper-documents').remove([destinationPath])
        continue
      }

      assigned += 1
    }

    setWorking(false)
    setMessage(`Assigned the selected document to ${assigned} camper${assigned === 1 ? '' : 's'}.`)
    await loadData()
  }

  async function removeAssignedDocument(document: any) {
    if (working || removingDocumentId) return

    const camper = camperById.get(String(document.camper_id))
    const camperLabel = camper
      ? `Lot ${camper.lot_number || 'N/A'} — ${camper.first_name || ''} ${camper.last_name || ''}`.trim()
      : 'this camper'
    const ok = window.confirm(
      `Pull back "${document.document_name || 'this document'}" from ${camperLabel}? This removes the assigned copy from their portal. The master library document will stay saved.`
    )
    if (!ok) return

    setRemovingDocumentId(String(document.id))
    setMessage('Removing assigned document…')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Please log in again before removing documents.')

      const response = await fetch(`/api/admin-documents?id=${encodeURIComponent(String(document.id))}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to remove this document.')
      }

      setMessage('Assigned document removed from camper portal.')
      await loadData()
    } catch (error: any) {
      setMessage(error.message || 'Unable to remove this document.')
    } finally {
      setRemovingDocumentId('')
    }
  }

  const filteredCampers = campers.filter((camper) => {
    const search = camperSearch.trim().toLowerCase()
    if (!search) return true
    return `${camper.first_name} ${camper.last_name} ${camper.lot_number || ''} ${camper.email || ''}`
      .toLowerCase()
      .includes(search)
  })

  const selectedTemplate = templates.find(
    (template) => String(template.id) === String(selectedTemplateId)
  )
  const camperById = new Map(campers.map((camper) => [String(camper.id), camper]))
  const isSignedDocument = (document: any) =>
    String(document.signature_status || '').toLowerCase() === 'signed'
  const isViewOnlyDocument = (document: any) =>
    String(document.signature_status || '').toLowerCase() === 'not_required'
  const isWaitingSignature = (document: any) =>
    !isSignedDocument(document) && !isViewOnlyDocument(document)
  const normalized = (value: unknown) => String(value || '').trim().toLowerCase()
  const camperFullName = (camper: any) =>
    `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
  const documentBelongsToCamper = (document: any, camper: any) => {
    const documentCamperId = String(document.camper_id || document.camper?.id || '')
    if (documentCamperId && documentCamperId === String(camper.id)) return true

    const camperEmails = [
      camper.email,
      camper.secondary_email,
      camper.signature_email,
    ].map(normalized).filter(Boolean)
    const documentEmails = [
      document.email,
      document.camper_email,
      document.assigned_email,
      document.recipient_email,
      document.signer_email,
    ].map(normalized).filter(Boolean)
    if (documentEmails.some((email) => camperEmails.includes(email))) return true

    const camperLot = normalized(camper.lot_number || camper.site_number || camper.site)
    const documentLot = normalized(document.lot_number || document.site_number || document.site || document.lot)
    if (camperLot && documentLot && camperLot === documentLot) return true

    const camperName = normalized(camperFullName(camper))
    const documentName = normalized(document.camper_name || document.assigned_to || document.recipient_name)
    if (camperName && documentName && documentName.includes(camperName)) return true

    return false
  }
  const signatureDocuments = documents
    .filter((document) =>
      signatureView === 'waiting'
        ? isWaitingSignature(document)
        : isSignedDocument(document)
    )
    .filter((document) => {
      const camper = camperById.get(String(document.camper_id))
      const search = signatureSearch.trim().toLowerCase()
      if (!search) return true
      return `${document.document_name || ''} ${document.document_type || ''} ${camper?.first_name || ''} ${camper?.last_name || ''} ${camper?.lot_number || ''} ${camper?.email || ''}`
        .toLowerCase()
        .includes(search)
    })
  const pendingSignatureCount = documents.filter(isWaitingSignature).length
  const signedSignatureCount = documents.filter(isSignedDocument).length

  return (
    <main className="admin-document-center">
      <section className="admin-document-overview">
        <article><span className="green"><FileStack size={22} /></span><div><small>Approved templates</small><strong>{templates.length}</strong><em>Private and unassigned</em></div></article>
        <article><span className="gold"><LockKeyhole size={22} /></span><div><small>Waiting signatures</small><strong>{pendingSignatureCount}</strong><em>Need camper action</em></div></article>
        <article><span className="blue"><UserRoundCheck size={22} /></span><div><small>Active campers</small><strong>{campers.length}</strong><em>Available for future assignment</em></div></article>
      </section>

      <section className="admin-document-panel signature-tracker-panel">
        <div className="admin-document-heading signature-tracker-heading">
          <span><FileCheck2 size={22} /></span>
          <div>
            <small>SIGNATURE TRACKER</small>
            <h2>Who still needs to sign?</h2>
            <p>Track assigned documents by camper, lot, status, and signed date.</p>
          </div>
          <div className="signature-tracker-actions">
            <label>
              <Search size={15} />
              <input
                value={signatureSearch}
                onChange={(event) => setSignatureSearch(event.target.value)}
                placeholder="Search person, lot, or document"
              />
            </label>
            <div>
              <button
                className={signatureView === 'waiting' ? 'active' : ''}
                type="button"
                onClick={() => setSignatureView('waiting')}
              >
                Waiting <strong>{pendingSignatureCount}</strong>
              </button>
              <button
                className={signatureView === 'signed' ? 'active' : ''}
                type="button"
                onClick={() => setSignatureView('signed')}
              >
                Signed <strong>{signedSignatureCount}</strong>
              </button>
            </div>
          </div>
        </div>

        <div className="signature-tracker-list">
          {signatureDocuments.map((document) => {
            const camper = camperById.get(String(document.camper_id))
            const signedDate = document.signed_at
              ? new Date(document.signed_at).toLocaleDateString()
              : null

            return (
              <article className={isSignedDocument(document) ? 'signed' : 'waiting'} key={document.id}>
                <span>{isSignedDocument(document) ? <CheckCircle2 size={19} /> : <FileCheck2 size={19} />}</span>
                <div>
                  <small>LOT {camper?.lot_number || 'N/A'} · {document.document_type || 'Document'}</small>
                  <strong>{camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : 'Camper not found'}</strong>
                  <p>{document.document_name || 'Untitled document'}</p>
                </div>
                <div className="signature-tracker-row-actions">
                  <em>{isSignedDocument(document) ? `Signed ${signedDate || ''}` : 'Waiting for signature'}</em>
                  <button
                    className="danger"
                    type="button"
                    onClick={() => removeAssignedDocument(document)}
                    disabled={removingDocumentId === String(document.id)}
                    aria-label={`Remove ${document.document_name || 'document'}`}
                  >
                    {removingDocumentId === String(document.id) ? <Loader2 className="admin-spin" size={14} /> : <Trash2 size={14} />}
                    Pull back
                  </button>
                </div>
              </article>
            )
          })}

          {signatureDocuments.length === 0 && (
            <div className="signature-tracker-empty">
              <FileCheck2 size={28} />
              <strong>{signatureView === 'waiting' ? 'No waiting signatures found' : 'No completed signatures found'}</strong>
              <span>{signatureSearch ? 'Try a different search.' : 'Documents will appear here as they are assigned and signed.'}</span>
            </div>
          )}
        </div>
      </section>

      <div className="admin-document-layout">
        <section className="admin-document-panel template-library">
          <div className="admin-document-heading">
            <span><ArchiveRestore size={22} /></span>
            <div><small>MASTER LIBRARY</small><h2>Unassigned templates</h2><p>Approved source documents available for future camper assignments.</p></div>
          </div>

          <div className="admin-template-list">
            {templates.length === 0 ? (
              <div className="admin-document-empty"><FileStack size={31} /><h3>No library documents yet</h3><p>Add leases, renewals, forms, and notices in the library panel.</p></div>
            ) : templates.map((template) => (
              <article
                key={template.id}
                className={selectedTemplateId === template.id ? 'selected' : ''}
                draggable
                onDragStart={(event) => {
                  setDraggedTemplateId(String(template.id))
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData('text/plain', String(template.id))
                }}
                onDragEnd={() => setDraggedTemplateId('')}
                onClick={() => setSelectedTemplateId(
                  selectedTemplateId === template.id ? '' : String(template.id)
                )}
              >
                <span className="admin-template-grip"><GripVertical size={17} /></span>
                <span className="admin-template-file"><FileCheck2 size={21} /></span>
                <div><small>{template.document_type}</small><strong>{template.document_name}</strong><em>Drag onto a camper or select to assign</em></div>
                <button type="button" onClick={(event) => { event.stopPropagation(); openTemplate(template) }} aria-label={`Open ${template.document_name}`}><ArrowUpRight size={17} /></button>
                <button className="danger" type="button" onClick={(event) => { event.stopPropagation(); deleteTemplate(template) }} aria-label={`Delete ${template.document_name}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        </section>

        <aside className="admin-document-panel replace-library">
          <div className="admin-document-heading compact">
            <span><FileUp size={21} /></span>
            <div><small>DOCUMENT LIBRARY</small><h2>Add reusable documents</h2></div>
          </div>
          <p>Add leases, renewals, forms, rules, and notices here. Existing library documents stay saved until you delete them.</p>
          <label
            className={`admin-document-dropzone ${libraryDropActive ? 'drag-active' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setLibraryDropActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'copy'
              setLibraryDropActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (event.currentTarget === event.target) setLibraryDropActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setLibraryDropActive(false)
              setLibraryTemplateFiles(Array.from(event.dataTransfer.files || []))
            }}
          >
            <FileUp size={26} />
            <strong>Drop documents here</strong>
            <small>{templateFiles.length ? `${templateFiles.length} file${templateFiles.length === 1 ? '' : 's'} ready` : 'or click to select · PDF or Word files'}</small>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={(event) => setLibraryTemplateFiles(Array.from(event.target.files || []))} />
          </label>
          {templateFiles.map((file) => <div className="admin-selected-file" key={file.name}><CheckCircle2 size={15} /> {file.name}</div>)}
          <button className="admin-replace-library-button" type="button" onClick={addTemplatesToLibrary} disabled={working || templateFiles.length === 0}>
            {working ? <Loader2 className="admin-spin" size={17} /> : <FilePlus2 size={17} />}
            {working ? 'Adding documents…' : `Add ${templateFiles.length || ''} to library`}
          </button>
        </aside>
      </div>

      <section className="admin-document-panel lease-assignment-board">
        <div className="admin-document-heading lease-board-heading">
          <span><UsersRound size={22} /></span>
          <div>
            <small>LEASE ASSIGNMENT BOARD</small>
            <h2>Drag a lease to a camper</h2>
            <p>Each camper receives a private copy. Your saved library documents remain available for future use.</p>
          </div>
          <label className="admin-camper-document-search">
            <Search size={16} />
            <input
              value={camperSearch}
              onChange={(event) => setCamperSearch(event.target.value)}
              placeholder="Search camper or lot"
            />
          </label>
        </div>

        {selectedTemplate && (
          <div className="admin-selected-template-banner">
            <FileCheck2 size={18} />
            <span><small>Selected lease</small><strong>{selectedTemplate.document_name}</strong></span>
            <em>Choose “Assign selected lease” on a camper below.</em>
            <button type="button" onClick={assignSelectedTemplateToVisibleCampers} disabled={working}>
              Assign to visible campers
            </button>
          </div>
        )}

        <div className="admin-camper-document-grid">
          {filteredCampers.map((camper) => {
            const camperDocuments = documents.filter((document) => documentBelongsToCamper(document, camper))
            const camperWaitingDocuments = camperDocuments.filter(isWaitingSignature)
            const camperSignedDocuments = camperDocuments.filter(isSignedDocument)
            const activeTemplateId = draggedTemplateId || selectedTemplateId
            const isAssigning = assigningCamperId === camper.id

            return (
              <article
                key={camper.id}
                className={`admin-camper-document-card ${draggedTemplateId ? 'drag-ready' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const templateId = event.dataTransfer.getData('text/plain') || draggedTemplateId
                  assignTemplateToCamper(templateId, camper.id)
                }}
              >
                <div className="admin-camper-document-person">
                  <span>{String(camper.first_name || '?').charAt(0)}{String(camper.last_name || '').charAt(0)}</span>
                  <div>
                    <small>LOT {camper.lot_number || 'UNASSIGNED'}</small>
                    <strong>{camper.first_name} {camper.last_name}</strong>
                    <em>{camper.email || 'No email entered'}</em>
                  </div>
                </div>

                <div className={`admin-camper-document-status ${camperDocuments.length ? 'has-documents' : ''}`}>
                  <strong>{camperDocuments.length}</strong>
                  <span>{camperDocuments.length === 1 ? 'document assigned' : 'documents assigned'}</span>
                  {camperDocuments.length > 0 && (
                    <em>{camperWaitingDocuments.length} waiting · {camperSignedDocuments.length} signed</em>
                  )}
                </div>

                <div className="admin-camper-document-files">
                  {camperDocuments.length === 0 ? (
                    <p><FilePlus2 size={15} /> No documents assigned</p>
                  ) : (
                    camperDocuments.slice(0, 4).map((document) => (
                      <p className={isSignedDocument(document) ? 'signed' : 'pending'} key={document.id}>
                        {isSignedDocument(document) ? <CheckCircle2 size={15} /> : <FileCheck2 size={15} />}
                        <span>{document.document_name}</span>
                        <em>{isSignedDocument(document) ? 'Signed' : isViewOnlyDocument(document) ? 'View only' : 'Waiting'}</em>
                        <button
                          type="button"
                          onClick={() => removeAssignedDocument(document)}
                          disabled={removingDocumentId === String(document.id)}
                          aria-label={`Remove ${document.document_name || 'document'}`}
                        >
                          {removingDocumentId === String(document.id) ? <Loader2 className="admin-spin" size={12} /> : <Trash2 size={12} />}
                        </button>
                      </p>
                    ))
                  )}
                  {camperDocuments.length > 4 && <small>+{camperDocuments.length - 4} more documents</small>}
                </div>

                <button
                  type="button"
                  disabled={!activeTemplateId || working}
                  onClick={() => assignTemplateToCamper(activeTemplateId, camper.id)}
                >
                  {isAssigning ? <Loader2 className="admin-spin" size={16} /> : <FilePlus2 size={16} />}
                  {isAssigning ? 'Assigning…' : activeTemplateId ? 'Assign selected lease' : 'Drag a lease here'}
                </button>
              </article>
            )
          })}
        </div>

        {filteredCampers.length === 0 && (
          <div className="admin-document-empty">
            <UsersRound size={31} />
            <h3>No campers found</h3>
            <p>Try a different name, email, or lot number.</p>
          </div>
        )}
      </section>

      <section className="admin-document-panel assign-document-panel">
        <div className="admin-document-heading compact">
          <span><UserRoundCheck size={21} /></span>
          <div><small>FUTURE ASSIGNMENTS</small><h2>Assign a camper document</h2><p>Choose a saved library document or upload a one-off file for a camper.</p></div>
        </div>

        <div className="admin-library-assignment-form">
          <label><span>Camper</span><select value={camperId} onChange={(event) => setCamperId(event.target.value)}><option value="">Select camper</option>{campers.map((camper) => <option key={camper.id} value={camper.id}>Lot {camper.lot_number} — {camper.first_name} {camper.last_name}</option>)}</select></label>
          <label><span>Library document</span><select value={futureTemplateId} onChange={(event) => setFutureTemplateId(event.target.value)}><option value="">Select saved document</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.document_name}</option>)}</select></label>
          <button type="button" onClick={assignLibraryDocumentFromDropdown} disabled={working || !camperId || !futureTemplateId}>
            {working ? 'Assigning…' : 'Assign library document'}
          </button>
        </div>

        <div className="admin-one-off-divider"><span>or upload one file just for this camper</span></div>

        <div className="admin-assignment-form">
          <label><span>Document name</span><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="2026 Seasonal Lease" /></label>
          <label><span>Type</span><input value={documentType} onChange={(event) => setDocumentType(event.target.value)} /></label>
          <label><span>File</span><input type="file" onChange={(event) => setAssignedFile(event.target.files?.[0] || null)} /></label>
          <button type="button" onClick={uploadAssignedDocument} disabled={working || !camperId}>Assign uploaded file</button>
        </div>
      </section>

      {message && <div className="admin-document-message">{message}</div>}
    </main>
  )
}
