'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function AdminDocumentsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('Lease')
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function loadCampers() {
      const { data } = await supabase
        .from('campers')
        .select('*')

      setCampers(data || [])
    }

    loadCampers()
  }, [])

  async function uploadDocument() {
    if (!camperId) {
  setMessage('Please select a camper.')
  return
}
    if (!file) {
      setMessage('Please select a file.')
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${camperId}/${crypto.randomUUID()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('camper-documents')
      .upload(filePath, file)
    if (uploadError) {
      setMessage(uploadError.message)
      return
    }

    const { error } = await supabase
      .from('documents')
      .insert({
        camper_id: camperId,
        document_name: documentName,
        document_type: documentType,
        file_url: filePath,
        signature_status: 'pending',
      })

    if (error) {
      await supabase.storage.from('camper-documents').remove([filePath])
      setMessage(error.message)
    } else {
      setMessage('Document uploaded successfully!')
      setDocumentName('')
      setFile(null)
    }
  }

  return (
  <main style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '700px' }}>

    <a
      href="/admin"
      style={{
        display: 'inline-block',
        marginBottom: '20px',
        textDecoration: 'none',
        fontWeight: 'bold',
      }}
    >
      ← Back to Dashboard
    </a>
<button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
    <h1>Admin Documents</h1>

      <label>Camper</label>

      <select
        value={camperId}
        onChange={(e) => setCamperId(e.target.value)}
        style={{
          display: 'block',
          width: '100%',
          padding: '10px',
          marginBottom: '15px',
        }}
      >
        <option value="">Select Camper</option>

        {campers.map((camper) => (
          <option key={camper.id} value={camper.id}>
            Lot {camper.lot_number} - {camper.first_name}
          </option>
        ))}
      </select>

      <label>Document Name</label>

      <input
        value={documentName}
        onChange={(e) => setDocumentName(e.target.value)}
        placeholder="2026 Seasonal Lease"
        style={{
          display: 'block',
          width: '100%',
          padding: '10px',
          marginBottom: '15px',
        }}
      />

      <label>Document Type</label>

      <input
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value)}
        style={{
          display: 'block',
          width: '100%',
          padding: '10px',
          marginBottom: '15px',
        }}
      />

      <label>Select PDF/File</label>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{
          display: 'block',
          marginBottom: '20px',
        }}
      />

      <button
        onClick={uploadDocument}
        style={{
          padding: '12px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Upload Document
      </button>

      {message && <p style={{ marginTop: '20px' }}>{message}</p>}
    </main>
  )
}
