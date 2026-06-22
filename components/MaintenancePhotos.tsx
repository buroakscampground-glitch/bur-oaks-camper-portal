'use client'

import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function MaintenancePhotos({ paths }: { paths?: string[] | null }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    let active = true

    async function loadPhotos() {
      if (!paths?.length) {
        setUrls([])
        return
      }

      const signedUrls = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage
            .from('maintenance-photos')
            .createSignedUrl(path, 60 * 60)

          return data?.signedUrl || null
        })
      )

      if (active) {
        setUrls(signedUrls.filter((url): url is string => Boolean(url)))
      }
    }

    loadPhotos()

    return () => {
      active = false
    }
  }, [paths])

  if (!paths?.length) return null

  return (
    <div className="maintenance-photo-section">
      <strong className="maintenance-photo-label">
        <ImageIcon size={16} /> Attached photos
      </strong>
      <div className="maintenance-photo-grid">
        {urls.map((url) => (
          <a href={url} target="_blank" rel="noreferrer" key={url}>
            <img src={url} alt="Maintenance request attachment" />
          </a>
        ))}
      </div>
    </div>
  )
}
