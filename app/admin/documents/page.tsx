'use client'

import { useEffect, useState } from 'react'
import {
  ArchiveRestore,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  FileStack,
  FileUp,
  Loader2,
  LockKeyhole,
  Trash2,
  UserRoundCheck,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type StorageItem = { id?: string | null; name: string }

export default function AdminDocumentsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('Lease')
  const [assignedFile, setAssignedFile] = useState<File | null>(null)
  const [templateFiles, setTemplateFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  async function loadData() {
    const [camperResult, templateResult] = await Promise.all([
      supabase.from('campers').select('*').eq('active', true).order('lot_number'),
      supabase.from('document_templates').select('*').order('created_at', { ascending: false }),
    ])

    setCampers(camperResult.data || [])
    setTemplates(templateResult.data || [])

    if (templateResult.error && /document_templates/i.test(templateResult.error.message)) {
      setMessage('Run migration 009 before adding the launch templates.')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function collectStoragePaths(bucket: string, prefix = ''): Promise<string[]> {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) {
      if (/not found/i.test(error.message)) return []
      throw error
    }

    const paths: string[] = []
    for (const item of (data || []) as StorageItem[]) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) paths.push(path)
      else paths.push(...(await collectStoragePaths(bucket, path)))
    }
    return paths
  }

  async function clearBucket(bucket: string) {
    const paths = await collectStoragePaths(bucket)
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100))
      if (error) throw error
    }
  }

  async function replaceTemplateLibrary() {
    if (templateFiles.length !== 2) {
      setMessage('Select exactly the two approved Bur Oaks Word documents.')
      return
    }

    if (!window.confirm('Replace the entire document library with these two unassigned templates?')) return

    setWorking(true)
    setMessage('Clearing the old document library…')

    try {
      await clearBucket('camper-documents')
      await clearBucket('Documents')
      const { error: documentDeleteError } = await supabase.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (documentDeleteError) throw documentDeleteError
      const { error: templateDeleteError } = await supabase.from('document_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (templateDeleteError) throw templateDeleteError

      for (const file of templateFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const storagePath = `templates/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('camper-documents').upload(storagePath, file)
        if (uploadError) throw uploadError

        const displayName = file.name
          .replace(/\.docx$/i, '')
          .replace('$1500', '$1,500')

        const { error: rowError } = await supabase.from('document_templates').insert({
          document_name: displayName,
          document_type: 'Seasonal Lease Template',
          storage_path: storagePath,
        })
        if (rowError) throw rowError
      }

      setTemplateFiles([])
      setMessage('The document library now contains only the two approved unassigned templates.')
      await loadData()
    } catch (error: any) {
      setMessage(error.message || 'Unable to replace the document library.')
    } finally {
      setWorking(false)
    }
  }

  async function uploadAssignedDocument() {
    if (!camperId) return setMessage('Please select a camper.')
    if (!assignedFile) return setMessage('Please select a file.')
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

  async function openTemplate(template: any) {
    const { data, error } = await supabase.storage.from('camper-documents').createSignedUrl(template.storage_path, 60)
    if (error || !data?.signedUrl) return setMessage('Unable to open this template.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteTemplate(template: any) {
    if (!window.confirm(`Delete ${template.document_name}?`)) return
    await supabase.storage.from('camper-documents').remove([template.storage_path])
    const { error } = await supabase.from('document_templates').delete().eq('id', template.id)
    setMessage(error ? error.message : 'Template deleted.')
    if (!error) await loadData()
  }

  return (
    <main className="admin-document-center">
      <section className="admin-document-overview">
        <article><span className="green"><FileStack size={22} /></span><div><small>Approved templates</small><strong>{templates.length}</strong><em>Private and unassigned</em></div></article>
        <article><span className="gold"><LockKeyhole size={22} /></span><div><small>Storage</small><strong>Private</strong><em>Short-lived secure links</em></div></article>
        <article><span className="blue"><UserRoundCheck size={22} /></span><div><small>Active campers</small><strong>{campers.length}</strong><em>Available for future assignment</em></div></article>
      </section>

      <div className="admin-document-layout">
        <section className="admin-document-panel template-library">
          <div className="admin-document-heading">
            <span><ArchiveRestore size={22} /></span>
            <div><small>MASTER LIBRARY</small><h2>Unassigned templates</h2><p>Approved source documents available for future camper assignments.</p></div>
          </div>

          <div className="admin-template-list">
            {templates.length === 0 ? (
              <div className="admin-document-empty"><FileStack size={31} /><h3>No approved templates</h3><p>Select the two launch files in the replacement panel.</p></div>
            ) : templates.map((template) => (
              <article key={template.id}>
                <span className="admin-template-file"><FileCheck2 size={21} /></span>
                <div><small>{template.document_type}</small><strong>{template.document_name}</strong><em>Not assigned to a camper</em></div>
                <button type="button" onClick={() => openTemplate(template)} aria-label={`Open ${template.document_name}`}><ArrowUpRight size={17} /></button>
                <button className="danger" type="button" onClick={() => deleteTemplate(template)} aria-label={`Delete ${template.document_name}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        </section>

        <aside className="admin-document-panel replace-library">
          <div className="admin-document-heading compact">
            <span><FileUp size={21} /></span>
            <div><small>GO-LIVE FILES</small><h2>Replace library</h2></div>
          </div>
          <p>This removes every old assigned document and stored file, then installs exactly two private unassigned templates.</p>
          <label className="admin-document-dropzone">
            <FileUp size={26} />
            <strong>Select both Word documents</strong>
            <small>{templateFiles.length ? `${templateFiles.length} file${templateFiles.length === 1 ? '' : 's'} selected` : '.docx files · exactly two required'}</small>
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={(event) => setTemplateFiles(Array.from(event.target.files || []))} />
          </label>
          {templateFiles.map((file) => <div className="admin-selected-file" key={file.name}><CheckCircle2 size={15} /> {file.name}</div>)}
          <button className="admin-replace-library-button" type="button" onClick={replaceTemplateLibrary} disabled={working || templateFiles.length !== 2}>
            {working ? <Loader2 className="admin-spin" size={17} /> : <ArchiveRestore size={17} />}
            {working ? 'Updating library…' : 'Replace with selected files'}
          </button>
        </aside>
      </div>

      <section className="admin-document-panel assign-document-panel">
        <div className="admin-document-heading compact">
          <span><UserRoundCheck size={21} /></span>
          <div><small>FUTURE ASSIGNMENTS</small><h2>Assign a camper document</h2><p>Use this only after complete camper information is available.</p></div>
        </div>
        <div className="admin-assignment-form">
          <label><span>Camper</span><select value={camperId} onChange={(event) => setCamperId(event.target.value)}><option value="">Select camper</option>{campers.map((camper) => <option key={camper.id} value={camper.id}>Lot {camper.lot_number} — {camper.first_name} {camper.last_name}</option>)}</select></label>
          <label><span>Document name</span><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="2026 Seasonal Lease" /></label>
          <label><span>Type</span><input value={documentType} onChange={(event) => setDocumentType(event.target.value)} /></label>
          <label><span>File</span><input type="file" onChange={(event) => setAssignedFile(event.target.files?.[0] || null)} /></label>
          <button type="button" onClick={uploadAssignedDocument} disabled={working}>Assign document</button>
        </div>
      </section>

      {message && <div className="admin-document-message">{message}</div>}
    </main>
  )
}
