'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Eye, Leaf, Search, Send, Sparkles, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isOperationalCamper } from '../../../lib/camper-records'
import { enforceableSiteCareTemplates, isAutomaticSiteCareTemplate, storedSiteCareChargeAmount } from '../../../lib/site-care-enforcement'

const templates = [
  { key: 'weed-eat', title: 'Weed eat around site', message: 'Please weed eat around your camper, shed, deck, and other site edges so the lot stays neat.' },
  { key: 'spray-weeds', title: 'Spray weeds', message: 'Please spray or remove the weeds around your site, including the camper, shed, deck, and gravel areas.' },
  { key: 'trash-pickup', title: 'Pick up trash around site', message: 'Please remove loose trash from the ground around your site and place it in the proper campground trash container.' },
  { key: 'under-camper', title: 'Clear storage under camper', message: 'Please remove stored items from underneath your camper so the site stays neat and follows campground appearance rules.' },
  { key: 'mower-in-shed', title: 'No lawn mower outside', message: 'Lawn mowers cannot be stored outside. Please move your mower into the shed when it is not being used.' },
  { key: 'outside-fridge', title: 'No refrigerator outside', message: 'Refrigerators cannot be kept outside at the site. Please remove the outside refrigerator or move it into an approved enclosed area.' },
  { key: 'propane-limit', title: 'Only one propane tank', message: 'Only one propane tank may be stored outside at your site. Please remove or properly store any additional tanks.' },
  { key: 'pressure-wash', title: 'Pressure wash camper', message: 'The outside of your camper needs to be pressure washed or cleaned to remove dirt, mildew, or buildup.' },
  { key: 'bike-storage', title: 'Store bikes neatly', message: 'Please organize and store bicycles neatly beside the camper or in the shed so they are not scattered around the site.' },
  { key: 'secure-trash', title: 'Secure trash from raccoons', message: 'Raccoons have gotten into the trash at your site. Please clean up the area and keep all trash in a securely closed container.' },
  { key: 'loose-clutter', title: 'Remove loose clutter', message: 'Please tidy and store loose items around your site so the area stays neat and follows campground appearance rules.' },
]

function camperName(camper: any) {
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function formatDate(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminSiteCarePage() {
  const [campers, setCampers] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('Standard')
  const [autoEnforce, setAutoEnforce] = useState(true)
  const [view, setView] = useState<'Active' | 'History'>('Active')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [updating, setUpdating] = useState('')

  useEffect(() => { loadPage() }, [])

  async function loadPage() {
    const [camperResult, noticeResult] = await Promise.all([
      supabase.from('campers').select('id,first_name,last_name,lot_number,role').eq('active', true).order('lot_number', { ascending: true }),
      supabase.from('site_care_notices').select('*').order('created_at', { ascending: false }),
    ])

    if (camperResult.error || noticeResult.error) {
      setFeedback(camperResult.error?.message || noticeResult.error?.message || 'Unable to load site care.')
      return
    }

    setCampers((camperResult.data || []).filter(isOperationalCamper))
    setNotices(noticeResult.data || [])
  }

  function chooseTemplate(template: typeof templates[number]) {
    setTemplateKey(template.key)
    setTitle(template.title)
    setMessage(template.message)
    setAutoEnforce(enforceableSiteCareTemplates.has(template.key))
    setFeedback('')
  }

  async function sendNotice(event: React.FormEvent) {
    event.preventDefault()
    setFeedback('')
    if (!camperId || !title.trim() || !message.trim()) {
      setFeedback('Choose a camper and add the notice details first.')
      return
    }

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/site-care-notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ camperId, templateKey, title, message, dueDate, priority, autoEnforce: autoEnforce && enforceableSiteCareTemplates.has(templateKey) }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Unable to send this notice.')

      setNotices((current) => [result.notice, ...current])
      setTemplateKey('')
      setTitle('')
      setMessage('')
      setDueDate('')
      setPriority('Standard')
      setAutoEnforce(true)
      setFeedback(result.smsMessage || 'Site care notice sent. It is now showing in the camper portal.')
    } catch (error: any) {
      setFeedback(error?.message || 'Unable to send this notice.')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(notice: any, action: 'resolve' | 'reopen' | 'convert_and_charge') {
    if (action === 'convert_and_charge') {
      const amount = storedSiteCareChargeAmount(notice.template_key) || 0
      const confirmed = window.confirm(`You inspected Lot ${notice.lot_number || '—'} and the work is NOT done. Create an approved maintenance work order and add a $${amount.toFixed(2)} charge to the next electric bill?`)
      if (!confirmed) return
    }
    setUpdating(notice.id)
    setFeedback('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/site-care-notices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ id: notice.id, action }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Unable to update this notice.')
      setNotices((current) => current.map((item) => item.id === notice.id ? result.notice : item))
      setFeedback(action === 'resolve'
        ? 'Resolved and moved to history.'
        : action === 'convert_and_charge'
          ? `Converted to an approved maintenance work order. The $${Number(result.converted?.chargeAmount || 0).toFixed(2)} charge is waiting for the next electric bill.`
          : 'Notice moved back to the active list.')
    } catch (error: any) {
      setFeedback(error?.message || 'Unable to update this notice.')
    } finally {
      setUpdating('')
    }
  }

  const activeNotices = notices.filter((notice) => notice.status !== 'Resolved')
  const visibleNotices = useMemo(() => notices.filter((notice) => {
    if (view === 'Active' && notice.status === 'Resolved') return false
    if (view === 'History' && notice.status !== 'Resolved') return false
    const camper = campers.find((item) => item.id === notice.camper_id)
    const haystack = `${notice.lot_number || ''} ${notice.title} ${notice.message} ${camper ? camperName(camper) : ''}`.toLowerCase()
    return !search.trim() || haystack.includes(search.trim().toLowerCase())
  }), [campers, notices, search, view])

  return (
    <main className="admin-site-care-page">
      <style>{`
        .admin-site-care-page{display:grid;gap:18px;color:#263b2e}.site-care-hero{padding:30px;border-radius:28px;background:radial-gradient(circle at 84% 15%,rgba(236,199,111,.28),transparent 29%),linear-gradient(135deg,#173722,#386747);color:#fff;box-shadow:0 22px 56px rgba(34,54,38,.16)}.site-care-hero span,.site-care-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#efd288;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.site-care-hero h1{margin:10px 0 0;color:#fff;font:500 clamp(38px,5vw,60px)/1.02 Georgia,serif}.site-care-hero p{max-width:780px;margin:13px 0 0;color:rgba(255,255,255,.84);line-height:1.55}
        .site-care-layout{display:grid;grid-template-columns:minmax(340px,.9fr) minmax(430px,1.1fr);gap:18px;align-items:start}.site-care-compose,.site-care-queue{padding:22px;border:1px solid #deddd4;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(34,54,38,.07)}.site-care-compose h2,.site-care-queue h2{margin:6px 0 4px;font:500 30px Georgia,serif}.site-care-compose>p,.site-care-queue-head p{margin:0;color:#68746c;font-size:13px;line-height:1.5}
        .site-care-form{display:grid;gap:13px;margin-top:20px}.site-care-form label{display:grid;gap:6px;color:#425548;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.site-care-form select,.site-care-form input,.site-care-form textarea{width:100%;border:1px solid #d8ddd5!important;border-radius:13px!important;background:#fbfcfa!important;color:#263b2e!important;box-shadow:none!important}.site-care-form textarea{min-height:105px;resize:vertical}.site-care-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.site-care-templates{display:flex;flex-wrap:wrap;gap:7px}.site-care-templates button{min-height:36px;padding:7px 10px!important;border:1px solid #d9dfd7!important;background:#f7faf6!important;color:#365c41!important;font-size:11px!important}.site-care-templates button.selected{border-color:#315f3d!important;background:#315f3d!important;color:#fff!important}.site-care-auto{display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:10px!important;padding:13px;border:1px solid #d6e2d3;border-radius:14px;background:#f3f8f1;color:#315f3d!important;letter-spacing:0!important;text-transform:none!important}.site-care-auto input{width:19px!important;height:19px;margin-top:2px}.site-care-auto span{display:grid;gap:3px}.site-care-auto strong{font-size:13px}.site-care-auto small{font-size:11px;font-weight:600;line-height:1.45;color:#667568}.site-care-send{display:flex!important;align-items:center;justify-content:center;gap:8px;min-height:48px;background:#315f3d!important;color:#fff!important}.site-care-feedback{margin:0;padding:11px 14px;border-radius:12px;background:#eef5eb;color:#315f3d;font-size:12px;font-weight:800}
        .site-care-queue-head{display:flex;align-items:end;justify-content:space-between;gap:12px}.site-care-count{display:grid;min-width:82px;padding:10px 14px;border-radius:15px;background:#f0f5ed;text-align:center}.site-care-count strong{font:600 26px Georgia,serif}.site-care-count small{font-size:9px;font-weight:900;text-transform:uppercase}.site-care-tools{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin:18px 0 12px}.site-care-search{display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #d8ddd5;border-radius:12px;background:#fafbf9}.site-care-search input{border:0!important;background:transparent!important;box-shadow:none!important}.site-care-tools>button{background:#fff!important;color:#315f3d!important}.site-care-tools>button.selected{background:#315f3d!important;color:#fff!important}
        .site-care-list{display:grid;gap:10px}.site-care-item{padding:16px;border:1px solid #e3e2da;border-radius:17px;background:#fbfcfa}.site-care-item.important{border-color:#e6b8a6;background:#fff7f2}.site-care-item.ready{border-color:#bad5b8;background:#f3f9f1}.site-care-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.site-care-item small{color:#98742e;font-size:9px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.site-care-item h3{margin:5px 0 0;font-size:18px}.site-care-item p{margin:7px 0;color:#66736a;font-size:13px;line-height:1.5}.site-care-status{flex:none;padding:7px 9px;border-radius:999px;background:#efe9d9;color:#735d29;font-size:9px;font-weight:900;text-transform:uppercase}.site-care-item-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid #e6e5dd}.site-care-item-actions span{color:#778179;font-size:11px}.site-care-action-buttons{display:flex;flex-wrap:wrap;gap:7px}.site-care-item-actions button{display:inline-flex;align-items:center;gap:6px;background:#315f3d!important;color:#fff!important}.site-care-item-actions button.convert{background:#a5412f!important}.site-care-empty{padding:38px 14px;text-align:center;color:#758079}.site-care-empty h3{margin:8px 0 4px;color:#315f3d}
        @media(max-width:900px){.site-care-layout{grid-template-columns:1fr}.site-care-compose,.site-care-queue{padding:18px}}@media(max-width:560px){.site-care-hero{padding:24px 20px}.site-care-form-row{grid-template-columns:1fr}.site-care-queue-head{align-items:flex-start}.site-care-tools{grid-template-columns:1fr 1fr}.site-care-search{grid-column:1/-1}.site-care-item-top,.site-care-item-actions{align-items:flex-start;flex-direction:column}.site-care-item-actions button{width:100%;justify-content:center}}
      `}</style>

      <section className="site-care-hero">
        <span><Leaf size={18} /> SITE CARE</span>
        <h1>Keep every site looking its best.</h1>
        <p>Send a clear, friendly notice in a few taps. Campers can acknowledge it and let the office know when it is ready for review—without another round of texts.</p>
      </section>

      {feedback && <p className="site-care-feedback">{feedback}</p>}

      <div className="site-care-layout">
        <section className="site-care-compose">
          <span className="site-care-eyebrow"><Send size={15} /> QUICK NOTICE</span>
          <h2>Send to a camper</h2>
          <p>Choose a common item, adjust the wording if needed, and send.</p>
          <form className="site-care-form" onSubmit={sendNotice}>
            <label>Camper / lot
              <select value={camperId} onChange={(event) => setCamperId(event.target.value)} required>
                <option value="">Choose a camper…</option>
                {campers.map((camper) => <option value={camper.id} key={camper.id}>Lot {camper.lot_number || '—'} · {camperName(camper)}</option>)}
              </select>
            </label>
            <label>Tap a common issue
              <div className="site-care-templates">
                {templates.map((template) => <button type="button" className={templateKey === template.key ? 'selected' : ''} onClick={() => chooseTemplate(template)} key={template.key}>{template.title}</button>)}
                <button type="button" className={templateKey === 'custom' ? 'selected' : ''} onClick={() => { setTemplateKey('custom'); setTitle(''); setMessage(''); setAutoEnforce(false) }}>Custom notice</button>
              </div>
            </label>
            <label>Headline<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs attention?" maxLength={160} required /></label>
            <label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Friendly details for the camper…" maxLength={1200} required /></label>
            <div className="site-care-form-row">
              <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Standard</option><option>Important</option></select></label>
              <label>Requested by date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            </div>
            {enforceableSiteCareTemplates.has(templateKey) && (
              <label className="site-care-auto">
                <input type="checkbox" checked={autoEnforce} onChange={(event) => setAutoEnforce(event.target.checked)} />
                <span>
                  <strong>Automatically send to maintenance and charge the site</strong>
                  <small>Just after midnight on the selected date, only a notice still completely Open will convert. Acknowledged or Ready for Review notices will not create a work order or charge.</small>
                </span>
              </label>
            )}
            <button className="site-care-send" type="submit" disabled={saving}><Send size={17} /> {saving ? 'Sending…' : 'Send Site Care Notice'}</button>
          </form>
        </section>

        <section className="site-care-queue">
          <div className="site-care-queue-head">
            <div><span className="site-care-eyebrow"><ClipboardCheck size={15} /> NOTICE BOARD</span><h2>{view === 'Active' ? 'Active site items' : 'Resolved history'}</h2><p>Ready for Review means the camper says the item is taken care of.</p></div>
            <span className="site-care-count"><strong>{activeNotices.length}</strong><small>active</small></span>
          </div>
          <div className="site-care-tools">
            <label className="site-care-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot or issue…" /></label>
            <button type="button" className={view === 'Active' ? 'selected' : ''} onClick={() => setView('Active')}>Active</button>
            <button type="button" className={view === 'History' ? 'selected' : ''} onClick={() => setView('History')}>History</button>
          </div>

          <div className="site-care-list">
            {visibleNotices.map((notice) => {
              const camper = campers.find((item) => item.id === notice.camper_id)
              return <article className={`site-care-item ${notice.priority === 'Important' ? 'important' : ''} ${notice.status === 'Ready for Review' ? 'ready' : ''}`} key={notice.id}>
                <div className="site-care-item-top"><div><small>{notice.priority} · LOT {notice.lot_number || '—'} · {camper ? camperName(camper) : 'Camper'}</small><h3>{notice.title}</h3>{isAutomaticSiteCareTemplate(notice.template_key) && <small><Wrench size={12} /> AUTO WORK ORDER · ${(storedSiteCareChargeAmount(notice.template_key) || 45).toFixed(2)}</small>}</div><span className="site-care-status">{notice.status}</span></div>
                <p>{notice.message}</p>
                <div className="site-care-item-actions"><span>{notice.due_date ? `Requested by ${formatDate(`${notice.due_date}T12:00:00`)}` : `Sent ${formatDate(notice.created_at)}`}</span><div className="site-care-action-buttons">{notice.status === 'Resolved' ? <button type="button" disabled={updating === notice.id} onClick={() => changeStatus(notice, 'reopen')}><Eye size={15} /> Reopen</button> : <>{isAutomaticSiteCareTemplate(notice.template_key) && ['Acknowledged', 'Ready for Review'].includes(notice.status) && <button className="convert" type="button" disabled={updating === notice.id} onClick={() => changeStatus(notice, 'convert_and_charge')}><Wrench size={15} /> Not Done — Convert & Charge</button>}<button type="button" disabled={updating === notice.id} onClick={() => changeStatus(notice, 'resolve')}><CheckCircle2 size={15} /> Mark Resolved</button></>}</div></div>
              </article>
            })}
            {!visibleNotices.length && <div className="site-care-empty">{view === 'Active' ? <CheckCircle2 size={32} /> : <Sparkles size={32} />}<h3>{view === 'Active' ? 'Every site is caught up' : 'No resolved notices yet'}</h3><p>{view === 'Active' ? 'New notices will stay here until the office resolves them.' : 'Completed items will be saved here for reference.'}</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}
