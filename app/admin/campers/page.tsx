'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminCampersPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .order('lot_number', { ascending: true })

    setCampers(data || [])
  }

  useEffect(() => {
    loadCampers()
  }, [])

  function clearForm() {
    setLotNumber('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setEditingId(null)
  }

  async function saveCamper() {
    if (editingId) {
      const { error } = await supabase
        .from('campers')
        .update({
          lot_number: lotNumber,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        })
        .eq('id', editingId)

      if (error) {
        setMessage(error.message)
        return
      }

      setMessage('Camper updated!')
    } else {
      const { error } = await supabase.from('campers').insert({
        lot_number: lotNumber,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
      })

      if (error) {
        setMessage(error.message)
        return
      }

      setMessage('Camper added!')
    }

    clearForm()
    loadCampers()
  }

  function editCamper(camper: any) {
    setEditingId(camper.id)
    setLotNumber(camper.lot_number || '')
    setFirstName(camper.first_name || '')
    setLastName(camper.last_name || '')
    setEmail(camper.email || '')
    setPhone(camper.phone || '')
    setMessage('Editing camper...')
  }

  async function deleteCamper(id: string) {
    const confirmDelete = confirm('Are you sure you want to delete this camper?')

    if (!confirmDelete) return

    const { error } = await supabase.from('campers').delete().eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Camper deleted!')
    loadCampers()
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>Manage Campers</h1>

      <h2>{editingId ? 'Edit Camper' : 'Add Camper'}</h2>

      <input placeholder="Lot Number" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
      <input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      <input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <button onClick={saveCamper}>
        {editingId ? 'Update Camper' : 'Add Camper'}
      </button>

      {editingId && <button onClick={clearForm}>Cancel Edit</button>}

      {message && <p>{message}</p>}

      <h2>Current Campers</h2>

      {campers.map((camper) => (
        <div key={camper.id} style={{ marginBottom: '12px' }}>
          Lot {camper.lot_number} - {camper.first_name} {camper.last_name} - {camper.email}

          <br />

          <button onClick={() => editCamper(camper)}>Edit</button>
          <button onClick={() => deleteCamper(camper.id)}>Delete</button>
        </div>
      ))}
    </main>
  )
}