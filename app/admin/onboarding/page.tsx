'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardCheck, Clock3, LoaderCircle, RotateCcw, Search, ShieldCheck, UserRoundCheck, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type ManualKey = 'orientation_completed' | 'welcome_completed' | 'insurance_not_required' | 'gate_access_not_required'
type OnboardingTask = { key: string, label: string, detail: string, complete: boolean, automatic: boolean, href?: string, manualKey?: ManualKey, alternateManualKey?: ManualKey }
type OnboardingCamper = { camperId: string, name: string, lotNumber: string, email: string, camperSinceDate?: string | null, currentOnboarding: boolean, completed: number, total: number, percent: number, ready: boolean, tasks: OnboardingTask[] }
type OnboardingResponse = { generatedAt: string, counts: { current: number, needingAction: number, ready: number, allActive: number }, campers: OnboardingCamper[] }
type ManualEditor = { camper: OnboardingCamper, task: OnboardingTask, taskKey: ManualKey, completed: boolean }

export default function AdminOnboardingPage() {
  const [data, setData] = useState<OnboardingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'current' | 'needs' | 'ready' | 'all'>('current')
  const [expandedId, setExpandedId] = useState('')
  const [editor, setEditor] = useState<ManualEditor | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { void loadOnboarding() }, [])

  async function sessionToken() {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData.session?.access_token || ''
  }

  async function loadOnboarding() {
    setLoading(true)
    setLoadError('')
    try {
      const token = await sessionToken()
      if (!token) throw new Error('Your Admin login expired. Sign in again and retry.')
      const response = await fetch('/api/admin-onboarding', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.counts || !Array.isArray(result?.campers)) throw new Error(result.error || 'The onboarding checklist could not be loaded.')
      setData(result)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The onboarding checklist could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  function openEditor(camper: OnboardingCamper, task: OnboardingTask, taskKey: ManualKey, completed: boolean) {
    setEditor({ camper, task, taskKey, completed })
    setNote('')
  }

  async function saveManualTask() {
    if (!editor) return
    setSaving(true)
    try {
      const token = await sessionToken()
      if (!token) throw new Error('Your Admin login expired. Sign in again and retry.')
      const response = await fetch('/api/admin-onboarding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ camperId: editor.camper.camperId, taskKey: editor.taskKey, completed: editor.completed, note }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'The onboarding change could not be saved.')
      setMessage(editor.completed ? `Onboarding task confirmed for ${editor.camper.name}: ${editor.task.label}.` : `Onboarding task reopened for ${editor.camper.name}: ${editor.task.label}.`)
      setEditor(null)
      await loadOnboarding()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The onboarding change could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const visible = useMemo(() => (data?.campers || []).filter((camper) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || `${camper.name} ${camper.lotNumber} ${camper.email}`.toLowerCase().includes(term)
    const matchesFilter = filter === 'all' || (filter === 'current' && camper.currentOnboarding) || (filter === 'needs' && camper.currentOnboarding && !camper.ready) || (filter === 'ready' && camper.currentOnboarding && camper.ready)
    return matchesSearch && matchesFilter
  }), [data, filter, search])

  if (loading) return <main className="portal-loading"><LoaderCircle className="spin" /><h1>Verifying camper onboarding…</h1></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Onboarding is temporarily unavailable</h1><p>{loadError}</p><p>No incomplete item is being shown as complete.</p><button className="portal-loading-retry" type="button" onClick={loadOnboarding}>Try again</button></main>

  return (
    <main className="admin-onboarding-page">
      <section className="admin-onboarding-hero">
        <div><small>NEW CAMPER ARRIVAL</small><h1>Onboarding Center</h1><p>One verified handoff from accepted prospect to fully welcomed camper. Automatic checks come from the live source records; physical handoffs require a named staff confirmation.</p></div>
        <span><UserRoundCheck size={26} /><strong>{data?.counts.needingAction || 0}</strong><small>need action</small></span>
      </section>

      <section className="admin-onboarding-counts" aria-label="Onboarding totals">
        <article><small>Current onboarding</small><strong>{data?.counts.current || 0}</strong></article>
        <article><small>Need action</small><strong>{data?.counts.needingAction || 0}</strong></article>
        <article><small>Ready</small><strong>{data?.counts.ready || 0}</strong></article>
        <article><small>Active campers</small><strong>{data?.counts.allActive || 0}</strong></article>
      </section>
      {message && <p className="admin-onboarding-message" role="status">{message}</p>}

      <section className="admin-onboarding-toolbar">
        <label><Search size={16} /><input aria-label="Search onboarding" placeholder="Search camper, site, or email…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div role="group" aria-label="Filter onboarding"><button className={filter === 'current' ? 'active' : ''} onClick={() => setFilter('current')}>Current</button><button className={filter === 'needs' ? 'active' : ''} onClick={() => setFilter('needs')}>Needs action</button><button className={filter === 'ready' ? 'active' : ''} onClick={() => setFilter('ready')}>Ready</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All active</button></div>
      </section>

      <section className="admin-onboarding-list">
        {visible.length === 0 ? <div className="admin-onboarding-empty"><CheckCircle2 size={28} /><h2>No campers match this view</h2><p>Try another filter or search.</p></div> : visible.map((camper) => {
          const expanded = expandedId === camper.camperId
          return <article key={camper.camperId} className={camper.ready ? 'ready' : ''}>
            <header><div><span>{camper.ready ? <CheckCircle2 /> : <Clock3 />}</span><div><small>SITE {camper.lotNumber}</small><h2>{camper.name}</h2><p>{camper.completed} of {camper.total} onboarding checks complete</p></div></div><strong>{camper.percent}%</strong></header>
            <div className="admin-onboarding-progress" aria-label={`${camper.percent}% complete`}><i style={{ width: `${camper.percent}%` }} /></div>
            <div className="admin-onboarding-summary">{camper.tasks.map((task) => <span className={task.complete ? 'complete' : ''} key={task.key} title={task.label}>{task.complete ? <Check size={12} /> : null}</span>)}</div>
            <button className="admin-onboarding-expand" type="button" onClick={() => setExpandedId(expanded ? '' : camper.camperId)} aria-expanded={expanded}>{expanded ? 'Hide checklist' : 'Open checklist'} <ArrowRight size={15} /></button>
            {expanded && <div className="admin-onboarding-tasks">{camper.tasks.map((task) => {
              const alternateCompleted = task.complete && /not required/i.test(task.detail)
              return <div key={task.key} className={task.complete ? 'complete' : ''}><span>{task.complete ? <CheckCircle2 /> : <Clock3 />}</span><div><strong>{task.label}</strong><small>{task.detail}</small></div><aside>{task.href && <a href={task.href}>Open record</a>}{task.manualKey && <button type="button" onClick={() => openEditor(camper, task, task.manualKey!, !task.complete)}>{task.complete ? 'Reopen' : 'Confirm complete'}</button>}{task.alternateManualKey && !task.complete && <button type="button" onClick={() => openEditor(camper, task, task.alternateManualKey!, true)}>Mark not required</button>}{task.alternateManualKey && alternateCompleted && <button type="button" onClick={() => openEditor(camper, task, task.alternateManualKey!, false)}><RotateCcw size={13} /> Require again</button>}</aside></div>
            })}</div>}
          </article>
        })}
      </section>
      <p className="admin-onboarding-verified"><ShieldCheck size={15} /> Verified {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'just now'}. Payments, signatures, access, and portal status are read from their authoritative records.</p>

      {editor && <div className="admin-onboarding-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm onboarding task"><section className="admin-onboarding-modal"><header><div><small>STAFF CONFIRMATION</small><h2>{editor.completed ? 'Complete' : 'Reopen'} {editor.task.label}</h2><p>{editor.camper.name} · Site {editor.camper.lotNumber}</p></div><button type="button" aria-label="Close" onClick={() => setEditor(null)}><X /></button></header><label><span>Office note</span><textarea maxLength={1000} rows={4} placeholder="Who handled this, what was provided, or why it is not required…" value={note} onChange={(event) => setNote(event.target.value)} /></label><p><ClipboardCheck size={15} /> This saves the current checklist state and an append-only history event with your Admin identity.</p><footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button type="button" className="primary" onClick={saveManualTask} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <CheckCircle2 />}{saving ? 'Saving…' : editor.completed ? 'Confirm completion' : 'Reopen task'}</button></footer></section></div>}
    </main>
  )
}
