'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, LoaderCircle, Mail, Sparkles, TentTree, UserPlus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isOperationalCamper } from '../../../lib/camper-records'
import { canConvertWaitlistStatus, NEW_CAMPER_ANNUAL_RENT, NEW_CAMPER_ASSOCIATION_FEE, NEW_CAMPER_INSTALLMENT, TEMPORARY_SITE_OPTION, waitlistWelcomeCopy } from '../../../lib/waitlist-conversion'

const siteKey = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function WaitlistPage() {
  const [people, setPeople] = useState<any[]>([])
  const [vacantSites, setVacantSites] = useState<string[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [desiredSite, setDesiredSite] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('Waiting')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [conversionPerson, setConversionPerson] = useState<any | null>(null)
  const [conversionForm, setConversionForm] = useState({ firstName: '', lastName: '', phone: '', email: '', lotNumber: '', contractStartDate: today() })
  const [recordFirstPayment, setRecordFirstPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ method: 'Check', receivedOn: today(), reference: '' })
  const [sendWelcome, setSendWelcome] = useState(true)
  const [converting, setConverting] = useState(false)
  const [conversionError, setConversionError] = useState('')
  const [conversionResult, setConversionResult] = useState<any | null>(null)
  const router = useRouter()

  useEffect(() => { loadWaitlist() }, [])

  async function loadWaitlist() {
    const [waitlistResult, lotResult, camperResult] = await Promise.all([
      supabase.from('waitlist').select('*').order('created_at', { ascending: false }),
      supabase.from('lots').select('lot_number').order('lot_number', { ascending: true }),
      supabase.from('campers').select('lot_number,role,active').eq('active', true),
    ])

    setPeople(waitlistResult.data || [])
    const occupied = new Set((camperResult.data || [])
      .filter(isOperationalCamper)
      .map((camper) => siteKey(camper.lot_number))
      .filter(Boolean))
    setVacantSites((lotResult.data || [])
      .map((lot) => String(lot.lot_number || '').trim())
      .filter((lotNumber) => lotNumber && !occupied.has(siteKey(lotNumber))))
  }

  async function addPerson() {
    if (!firstName || !lastName) {
      setMessage('Please add a first and last name.')
      return
    }

    const { error } = await supabase.from('waitlist').insert({
      first_name: firstName, last_name: lastName, phone, email, desired_site: desiredSite, notes, status,
      last_check_in_at: new Date().toISOString(),
    })
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Added to waitlist!')
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setDesiredSite(''); setNotes(''); setStatus('Waiting')
    loadWaitlist()
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase.from('waitlist').update({
      status: newStatus,
      removed_at: newStatus === 'Removed' ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Status updated.')
    loadWaitlist()
  }

  async function deletePerson(id: string) {
    if (!confirm('Delete this waitlist entry?')) return
    const { error } = await supabase.from('waitlist').delete().eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Waitlist entry deleted.')
    loadWaitlist()
  }

  function openConversion(person: any) {
    setConversionPerson(person)
    setConversionForm({ firstName: String(person.first_name || ''), lastName: String(person.last_name || ''), phone: String(person.phone || ''), email: String(person.email || ''), lotNumber: '', contractStartDate: today() })
    setRecordFirstPayment(false)
    setPaymentForm({ method: 'Check', receivedOn: today(), reference: '' })
    setSendWelcome(true)
    setConversionError('')
    setConversionResult(null)
  }

  function closeConversion() {
    if (converting) return
    setConversionPerson(null)
    setConversionResult(null)
    setConversionError('')
  }

  async function convertToCamper() {
    if (!conversionPerson) return
    if (!conversionForm.lotNumber) {
      setConversionError('Choose an open campsite or Temporary portal spot.')
      return
    }
    if (!conversionForm.email.trim()) {
      setConversionError('Add their email so the portal can be prepared.')
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setConversionError('Your admin login expired. Sign in again and retry.')
      return
    }

    setConverting(true)
    setConversionError('')
    try {
      const response = await fetch('/api/admin-waitlist-convert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waitlistId: conversionPerson.id,
          ...conversionForm,
          temporarySpot: conversionForm.lotNumber === TEMPORARY_SITE_OPTION,
          lotNumber: conversionForm.lotNumber === TEMPORARY_SITE_OPTION ? '' : conversionForm.lotNumber,
          recordFirstPayment,
          paymentMethod: paymentForm.method,
          paymentReceivedOn: paymentForm.receivedOn,
          paymentReference: paymentForm.reference,
          sendWelcome,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setConversionError(result.error || 'This camper could not be converted.')
        if (result.camperId) setConversionResult({ camperId: result.camperId, existing: true })
        return
      }

      setConversionResult(result)
      setMessage(result.temporarySpot ? `${result.camperName} now has temporary portal access while a permanent site is pending.` : `${result.camperName} is now assigned to Site ${result.lotNumber}.`)
      await loadWaitlist()
    } catch {
      setConversionError('The conversion could not be completed. Nothing was sent—please try again.')
    } finally {
      setConverting(false)
    }
  }

  const counts = useMemo(() => ({
    Waiting: people.filter((person) => person.status === 'Waiting').length,
    Contacted: people.filter((person) => person.status === 'Contacted').length,
    Accepted: people.filter((person) => person.status === 'Accepted').length,
    Converted: people.filter((person) => person.status === 'Converted').length,
    Declined: people.filter((person) => person.status === 'Declined').length,
    Removed: people.filter((person) => person.status === 'Removed').length,
  }), [people])

  const visiblePeople = people.filter((person) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [person.first_name, person.last_name, person.phone, person.email].join(' ').toLowerCase().includes(term)
    return matchesSearch && (statusFilter === 'All' || person.status === statusFilter)
  })
  const temporaryConversion = conversionForm.lotNumber === TEMPORARY_SITE_OPTION
  const welcomePreview = waitlistWelcomeCopy(conversionForm.firstName, conversionForm.lotNumber, temporaryConversion)

  return (
    <main className="admin-waitlist-page">
      <section className="admin-waitlist-hero">
        <div><small>NEW CAMPER PIPELINE</small><h1>Waitlist Manager</h1><p>Track interested families, assign an open site, and transition them into the camper portal without retyping their information.</p></div>
        <button type="button" onClick={() => router.push('/admin/site-availability')}><TentTree size={17} /> View open sites</button>
      </section>

      <section className="admin-waitlist-counts" aria-label="Waitlist status totals">
        {Object.entries(counts).map(([label, count]) => <article key={label}><small>{label}</small><strong>{count}</strong></article>)}
      </section>
      {message && <p className="admin-waitlist-message">{message}</p>}

      <div className="admin-waitlist-layout">
        <aside className="admin-waitlist-add">
          <div><small>MANUAL ENTRY</small><h2>Add to waitlist</h2></div>
          <label><span>First name</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
          <label><span>Last name</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
          <label><span>Phone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></label>
          <label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
          <label><span>Desired site or site notes</span><input value={desiredSite} onChange={(event) => setDesiredSite(event.target.value)} /></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Waiting</option><option>Contacted</option><option>Accepted</option><option>Declined</option></select></label>
          <label><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} /></label>
          <button type="button" onClick={addPerson}>Add to Waitlist</button>
        </aside>

        <section className="admin-waitlist-directory">
          <header><div><small>APPLICANTS</small><h2>Current waitlist</h2></div><div><input placeholder="Search name, phone, email…" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Waiting</option><option>Contacted</option><option>Accepted</option><option>Converted</option><option>Declined</option><option>Removed</option></select></div></header>

          {visiblePeople.length === 0 ? <p className="admin-waitlist-empty">No matching waitlist entries.</p> : (
            <div className="admin-waitlist-list">
              {visiblePeople.map((person) => (
                <article key={person.id}>
                  <header><div><span>{person.first_name?.[0] || '?'}{person.last_name?.[0] || ''}</span><div><h3>{person.first_name} {person.last_name}</h3><small>{person.phone || 'No phone'} · {person.email || 'No email'}</small></div></div><em>{person.status}</em></header>
                  <dl><div><dt>Site preference</dt><dd>{person.desired_site || 'Not provided'}</dd></div><div><dt>Last waitlist email</dt><dd>{person.last_check_in_at ? new Date(person.last_check_in_at).toLocaleDateString() : 'Not sent'}</dd></div>{person.notes && <div className="wide"><dt>Notes</dt><dd>{person.notes}</dd></div>}</dl>
                  <footer>
                    {canConvertWaitlistStatus(person.status) && <button className="convert" type="button" onClick={() => openConversion(person)}><UserPlus size={16} /> Convert to Camper</button>}
                    <select aria-label={`Change status for ${person.first_name} ${person.last_name}`} value={person.status} onChange={(event) => updateStatus(person.id, event.target.value)}><option>Waiting</option><option>Contacted</option><option>Accepted</option><option>Declined</option><option>Removed</option>{person.status === 'Converted' && <option>Converted</option>}</select>
                    <button className="delete" type="button" onClick={() => deletePerson(person.id)}>Delete</button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {conversionPerson && (
        <div className="admin-waitlist-modal-backdrop" role="dialog" aria-modal="true" aria-label="Convert waitlist applicant to camper">
          <section className="admin-waitlist-modal">
            <header><div><small>WELCOME WORKFLOW</small><h2>{conversionResult?.camperId && !conversionResult.existing ? 'Camper created' : `Convert ${conversionPerson.first_name} ${conversionPerson.last_name}`}</h2></div><button type="button" onClick={closeConversion} aria-label="Close"><X size={20} /></button></header>

            {conversionResult?.camperId && !conversionResult.existing ? (
              <div className="admin-waitlist-success">
                <span><CheckCircle2 size={30} /></span><h3>Welcome to the Bur Oaks family!</h3><p>{conversionResult.temporarySpot ? `${conversionResult.camperName} has portal access now, with a permanent campsite still pending.` : `${conversionResult.camperName} is assigned to Site ${conversionResult.lotNumber}.`} Their camper profile and two-payment rent schedule are ready.</p>
                {conversionResult.firstPaymentRecorded && <strong>First ${NEW_CAMPER_INSTALLMENT.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment recorded.</strong>}
                <strong>{conversionResult.welcomeDelivery === 'sent' ? `Welcome and portal setup email sent to ${conversionForm.email}.` : conversionResult.welcomeDelivery === 'manual' ? 'The profile is ready, but the welcome email needs to be sent manually.' : 'No welcome email was requested.'}</strong>
                {conversionResult.warning && <p className="error">{conversionResult.warning}</p>}
                {conversionResult.setupUrl && <label><span>Private one-time setup link</span><textarea readOnly value={conversionResult.setupUrl} rows={3} onFocus={(event) => event.currentTarget.select()} /></label>}
                <div><a href={`/admin/campers/${conversionResult.camperId}`}>Open camper profile <ArrowRight size={16} /></a><button type="button" onClick={closeConversion}>Done</button></div>
              </div>
            ) : (
              <>
                <div className="admin-waitlist-conversion-grid">
                  <label><span>Site or portal access</span><select value={conversionForm.lotNumber} onChange={(event) => setConversionForm((current) => ({ ...current, lotNumber: event.target.value }))}><option value="">Choose one…</option><option value={TEMPORARY_SITE_OPTION}>Temporary spot — portal access now</option>{vacantSites.map((site) => <option key={site} value={site}>Permanent Site {site}</option>)}</select><small>{temporaryConversion ? 'Does not claim an occupied physical site. Assign the permanent site later.' : `${vacantSites.length} currently vacant site${vacantSites.length === 1 ? '' : 's'} shown`}</small></label>
                  <label><span>First name</span><input value={conversionForm.firstName} onChange={(event) => setConversionForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
                  <label><span>Last name</span><input value={conversionForm.lastName} onChange={(event) => setConversionForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
                  <label><span>Phone</span><input value={conversionForm.phone} onChange={(event) => setConversionForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label className="wide"><span>Email for portal access</span><input type="email" value={conversionForm.email} onChange={(event) => setConversionForm((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label className="wide"><span>12-month contract start date</span><input type="date" value={conversionForm.contractStartDate} onChange={(event) => setConversionForm((current) => ({ ...current, contractStartDate: event.target.value }))} /><small>Creates two ${NEW_CAMPER_INSTALLMENT.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} lot-rent payments, six months apart.</small></label>
                </div>

                <section className="admin-waitlist-first-payment">
                  <label><input type="checkbox" checked={recordFirstPayment} onChange={(event) => setRecordFirstPayment(event.target.checked)} /><span><strong>Record the first ${NEW_CAMPER_INSTALLMENT.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment now</strong><small>Optional. This marks payment 1 of 2 paid as part of the conversion.</small></span></label>
                  {recordFirstPayment && <div><label><span>Payment method</span><select value={paymentForm.method} onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}><option>Check</option><option>Cash</option><option>Credit</option><option>Debit</option><option>Other</option></select></label><label><span>Date received</span><input type="date" value={paymentForm.receivedOn} onChange={(event) => setPaymentForm((current) => ({ ...current, receivedOn: event.target.value }))} /></label><label className="wide"><span>Check number or reference (optional)</span><input value={paymentForm.reference} onChange={(event) => setPaymentForm((current) => ({ ...current, reference: event.target.value }))} /></label></div>}
                </section>

                <article className="admin-waitlist-welcome-preview"><span><Sparkles size={20} /></span><div><small>WELCOME NOTE PREVIEW</small><h3>{welcomePreview.heading}</h3><p>{welcomePreview.message}</p><em>The secure portal setup button and 24-hour link instructions are added automatically.</em></div></article>
                <label className="admin-waitlist-send-welcome"><input type="checkbox" checked={sendWelcome} onChange={(event) => setSendWelcome(event.target.checked)} /><span><strong>Send the welcome and portal setup email after conversion</strong><small>You are approving this email by completing the conversion.</small></span></label>
                <div className="admin-waitlist-transition-list"><p><CheckCircle2 size={16} /> Creates the camper profile with the waitlist contact information</p><p><CheckCircle2 size={16} /> {temporaryConversion ? 'Provides portal access without claiming an occupied campsite' : 'Assigns the selected site only if it is still vacant'}</p><p><CheckCircle2 size={16} /> Creates ${NEW_CAMPER_ANNUAL_RENT.toLocaleString('en-US')} annual rent as 2 payments of ${NEW_CAMPER_INSTALLMENT.toLocaleString('en-US')}</p><p><CheckCircle2 size={16} /> Notes the ${NEW_CAMPER_ASSOCIATION_FEE} association fee due at signing</p><p><CheckCircle2 size={16} /> Preserves the waitlist notes inside the private camper record</p></div>
                {conversionError && <p className="admin-waitlist-conversion-error">{conversionError}{conversionResult?.camperId && <a href={`/admin/campers/${conversionResult.camperId}`}> Open existing camper record.</a>}</p>}
                <footer><button type="button" onClick={closeConversion}>Cancel</button><button className="primary" type="button" onClick={convertToCamper} disabled={converting}>{converting ? <LoaderCircle className="admin-spin" size={17} /> : <Mail size={17} />}{converting ? 'Creating camper…' : sendWelcome ? 'Create Camper & Send Welcome' : 'Create Camper'}</button></footer>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
