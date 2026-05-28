'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
        .eq('email', user.email)
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

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading documents...</p>
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>My Documents</h1>

      {documents.length === 0 && (
        <p>No documents found yet.</p>
      )}

      {documents.map((doc) => (
        <div
          key={doc.id}
          style={{
            border: '1px solid #ccc',
            padding: '20px',
            borderRadius: '10px',
            marginBottom: '20px',
            maxWidth: '700px',
          }}
        >
          <h2>{doc.document_name}</h2>

          <p>
            <strong>Type:</strong> {doc.document_type}
          </p>

          <p>
            <strong>Status:</strong> {doc.signature_status}
          </p>
        </div>
      ))}
    </main>
  )
}