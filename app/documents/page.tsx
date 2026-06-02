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
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>📄 My Documents</h1>

          <h2 style={{ color: '#2f5d3a' }}>
            {documents.length} Document
            {documents.length !== 1 ? 's' : ''}
          </h2>

          <p className="muted">
            View campground documents assigned to your account.
          </p>
        </section>

        {documents.length === 0 && (
          <section className="card">
            <h2>No Documents Found</h2>

            <p className="muted">
              No documents have been assigned to your account yet.
            </p>
          </section>
        )}

        <div className="grid">
          {documents.map((doc) => (
            <section
              key={doc.id}
              className="card"
              style={{
                borderLeft: '7px solid #2f5d3a',
              }}
            >
              <h2>{doc.document_name}</h2>

              <p>
                <strong>Type:</strong>{' '}
                {doc.document_type || 'General'}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                {doc.signature_status === 'signed'
                  ? '🟢 Signed'
                  : '🟡 Pending'}
              </p>

              {doc.file_url && (
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <button>
                    View Document
                  </button>
                </a>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}