'use client'

import { useEffect, useMemo, useState } from 'react'
import { Camera, PackageCheck, PlusCircle, ReceiptText, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type InventoryItem = {
  id: string
  item_name: string
  category?: string | null
  unit?: string | null
  stock_quantity?: number | string | null
  reorder_level?: number | string | null
  unit_cost?: number | string | null
  active?: boolean | null
}

type TicketPart = {
  id: string
  item_name: string
  quantity: number | string
  unit?: string | null
  unit_cost?: number | string | null
  used_by?: string | null
  notes?: string | null
  created_at?: string | null
}

type ReceiptRecord = {
  id: string
  file_url: string
  file_name?: string | null
  vendor?: string | null
  amount?: number | string | null
  purchased_by?: string | null
  notes?: string | null
  created_at?: string | null
}

export default function MaintenancePartsPanel({
  ticketId,
  mode = 'maintenance',
}: {
  ticketId: string
  mode?: 'maintenance' | 'admin'
}) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [parts, setParts] = useState<TicketPart[]>([])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [usedBy, setUsedBy] = useState(mode === 'admin' ? 'Bur Oaks Admin' : 'Maintenance Staff')
  const [partNotes, setPartNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptVendor, setReceiptVendor] = useState('')
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')
  const [message, setMessage] = useState('')
  const [savingPart, setSavingPart] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId),
    [items, selectedItemId]
  )

  useEffect(() => {
    loadEverything()
  }, [ticketId])

  async function loadEverything() {
    const [itemsResult, partsResult, receiptsResult] = await Promise.all([
      supabase
        .from('maintenance_inventory_items')
        .select('*')
        .eq('active', true)
        .order('item_name', { ascending: true }),
      supabase
        .from('maintenance_ticket_parts')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false }),
      supabase
        .from('maintenance_receipts')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false }),
    ])

    setItems(itemsResult.data || [])
    setParts(partsResult.data || [])
    setReceipts(receiptsResult.data || [])
  }

  async function addPartUsed() {
    if (!selectedItem) {
      setMessage('Choose a part from inventory first.')
      return
    }

    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Enter a quantity greater than zero.')
      return
    }

    setSavingPart(true)
    setMessage('Saving part used…')

    const { error } = await supabase.from('maintenance_ticket_parts').insert({
      ticket_id: ticketId,
      inventory_item_id: selectedItem.id,
      item_name: selectedItem.item_name,
      quantity: qty,
      unit: selectedItem.unit || 'each',
      unit_cost: selectedItem.unit_cost || null,
      used_by: usedBy.trim() || (mode === 'admin' ? 'Bur Oaks Admin' : 'Maintenance Staff'),
      notes: partNotes.trim() || null,
    })

    if (error) {
      setMessage(error.message)
      setSavingPart(false)
      return
    }

    setQuantity('1')
    setPartNotes('')
    setMessage('Part saved and inventory count updated.')
    setSavingPart(false)
    loadEverything()
  }

  async function deletePart(partId: string) {
    if (mode !== 'admin') return
    if (!confirm('Remove this part from the work order and put it back into inventory?')) return

    const { error } = await supabase
      .from('maintenance_ticket_parts')
      .delete()
      .eq('id', partId)

    setMessage(error ? error.message : 'Part removed and inventory restored.')
    if (!error) loadEverything()
  }

  async function uploadReceipt() {
    if (!receiptFile) {
      setMessage('Choose a receipt photo first.')
      return
    }

    setUploadingReceipt(true)
    setMessage('Uploading receipt…')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const safeName = receiptFile.name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase()
    const path = `${user?.id || 'maintenance'}/receipts/${ticketId}/${crypto.randomUUID()}-${safeName}`

    const upload = await supabase.storage
      .from('maintenance-photos')
      .upload(path, receiptFile, { upsert: false, contentType: receiptFile.type || undefined })

    if (upload.error) {
      setMessage(upload.error.message)
      setUploadingReceipt(false)
      return
    }

    const { error } = await supabase.from('maintenance_receipts').insert({
      ticket_id: ticketId,
      file_url: path,
      file_name: receiptFile.name,
      vendor: receiptVendor.trim() || null,
      amount: receiptAmount.trim() ? Number(receiptAmount) : null,
      purchased_by: usedBy.trim() || (mode === 'admin' ? 'Bur Oaks Admin' : 'Maintenance Staff'),
      notes: receiptNotes.trim() || null,
    })

    if (error) {
      setMessage(error.message)
      setUploadingReceipt(false)
      return
    }

    setReceiptFile(null)
    setReceiptVendor('')
    setReceiptAmount('')
    setReceiptNotes('')
    setUploadingReceipt(false)
    setMessage('Receipt attached to this work order.')
    loadEverything()
  }

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage
      .from('maintenance-photos')
      .createSignedUrl(path, 60 * 60)

    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'Unable to open receipt.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="maintenance-parts-panel">
      <style>{`
        .maintenance-parts-panel{margin:18px 0;padding:22px;border:1px solid #dfddd3;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(34,54,38,.07)}
        .maintenance-parts-heading{display:flex;gap:13px;align-items:flex-start}
        .maintenance-parts-heading>span{display:grid;width:46px;height:46px;place-items:center;border-radius:15px;background:#e6efe6;color:#315f3d}
        .maintenance-parts-heading small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
        .maintenance-parts-heading h2{margin:5px 0 0;color:#263d2e;font:500 30px Georgia,serif}
        .maintenance-parts-heading p{margin:5px 0 15px;color:#657168;font-size:12px}
        .maintenance-parts-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .maintenance-parts-grid article{padding:15px;border:1px solid #e2dfd4;border-radius:18px;background:#fbfaf5}
        .maintenance-parts-grid strong{display:flex;align-items:center;gap:7px;color:#263d2e}
        .maintenance-parts-panel input,.maintenance-parts-panel select,.maintenance-parts-panel textarea{width:100%;margin-top:10px}
        .maintenance-parts-panel textarea{min-height:96px}
        .maintenance-parts-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .maintenance-parts-grid button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;margin-top:10px;background:#315f3d!important;color:#fff!important}
        .maintenance-parts-message{margin:12px 0 0;padding:11px 12px;border-radius:13px;background:#eef5ec;color:#315f3d;font-size:12px;font-weight:850}
        .maintenance-parts-history{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
        .maintenance-parts-history>div{padding:15px;border:1px solid #e2dfd4;border-radius:18px}
        .maintenance-parts-history h3{margin:0 0 10px;color:#263d2e}
        .maintenance-parts-history p{margin:0;color:#718078;font-size:12px}
        .maintenance-parts-line,.maintenance-receipt-line{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin-top:8px;padding:12px;border:1px solid #e7e4da;border-radius:14px;background:#fff;color:#263d2e;text-align:left}
        .maintenance-parts-line small,.maintenance-receipt-line small{display:block;margin-top:3px;color:#718078;font-size:11px}
        .maintenance-parts-line em{display:block;margin-top:3px;color:#9a7834;font-size:11px;font-style:normal}
        .maintenance-parts-line button{display:grid;width:34px;height:34px;place-items:center;border:0!important;background:#f8e2e1!important;color:#9d3e37!important}
        .maintenance-receipt-line{justify-content:flex-start;cursor:pointer}
        .maintenance-receipt-line svg{color:#315f3d}
        @media(max-width:920px){.maintenance-parts-grid,.maintenance-parts-history{grid-template-columns:1fr}}
        @media(max-width:640px){.maintenance-parts-row{grid-template-columns:1fr}}
      `}</style>
      <div className="maintenance-parts-heading">
        <span><PackageCheck size={18} /></span>
        <div>
          <small>PARTS & RECEIPTS</small>
          <h2>Inventory used on this work order</h2>
          <p>Record parts as they are used. Stock counts update automatically.</p>
        </div>
      </div>

      <div className="maintenance-parts-grid">
        <article>
          <strong><PlusCircle size={16} /> Add part used</strong>
          <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
            <option value="">Choose inventory item</option>
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.item_name} · {Number(item.stock_quantity || 0).toFixed(2)} {item.unit || 'each'} on hand
              </option>
            ))}
          </select>
          <div className="maintenance-parts-row">
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Qty used" inputMode="decimal" />
            <input value={usedBy} onChange={(event) => setUsedBy(event.target.value)} placeholder="Used by" />
          </div>
          <textarea value={partNotes} onChange={(event) => setPartNotes(event.target.value)} placeholder="Optional notes — example: replaced on bath house faucet." />
          <button type="button" onClick={addPartUsed} disabled={savingPart}>
            {savingPart ? 'Saving…' : 'Save Part Used'}
          </button>
        </article>

        <article>
          <strong><Camera size={16} /> Receipt photo</strong>
          <div className="maintenance-parts-row">
            <input value={receiptVendor} onChange={(event) => setReceiptVendor(event.target.value)} placeholder="Vendor / store" />
            <input value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} placeholder="Amount" inputMode="decimal" />
          </div>
          <input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
          <textarea value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} placeholder="Optional notes — what was bought or why." />
          <button type="button" onClick={uploadReceipt} disabled={uploadingReceipt}>
            {uploadingReceipt ? 'Uploading…' : 'Attach Receipt'}
          </button>
        </article>
      </div>

      {message && <p className="maintenance-parts-message">{message}</p>}

      <div className="maintenance-parts-history">
        <div>
          <h3>Parts used</h3>
          {parts.length === 0 ? (
            <p>No parts recorded yet.</p>
          ) : (
            parts.map((part) => (
              <div className="maintenance-parts-line" key={part.id}>
                <span>
                  <strong>{part.item_name}</strong>
                  <small>
                    {Number(part.quantity || 0).toFixed(2)} {part.unit || 'each'}
                    {part.used_by ? ` · ${part.used_by}` : ''}
                    {part.created_at ? ` · ${new Date(part.created_at).toLocaleDateString()}` : ''}
                  </small>
                  {part.notes && <em>{part.notes}</em>}
                </span>
                {mode === 'admin' && (
                  <button type="button" onClick={() => deletePart(part.id)}><Trash2 size={14} /></button>
                )}
              </div>
            ))
          )}
        </div>

        <div>
          <h3>Receipts</h3>
          {receipts.length === 0 ? (
            <p>No receipts attached yet.</p>
          ) : (
            receipts.map((receipt) => (
              <button className="maintenance-receipt-line" type="button" onClick={() => openReceipt(receipt.file_url)} key={receipt.id}>
                <ReceiptText size={16} />
                <span>
                  <strong>{receipt.vendor || receipt.file_name || 'Receipt'}</strong>
                  <small>
                    {receipt.amount ? `$${Number(receipt.amount).toFixed(2)}` : 'No amount'}
                    {receipt.created_at ? ` · ${new Date(receipt.created_at).toLocaleDateString()}` : ''}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
