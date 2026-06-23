'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Rocket,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type LaunchItem = {
  id: string
  label: string
  status: 'ready' | 'warning' | 'action'
  detail: string
  href?: string
}

type LaunchGroup = {
  id: string
  title: string
  items: LaunchItem[]
}

type LaunchChecklist = {
  generatedAt: string
  counts: {
    ready: number
    warning: number
    action: number
    total: number
  }
  alerts: {
    maintenance: number
    payments: number
    rsvps: number
    total: number
  }
  groups: LaunchGroup[]
}

const statusConfig = {
  ready: {
    label: 'Ready',
    icon: CheckCircle2,
  },
  warning: {
    label: 'Watch',
    icon: AlertTriangle,
  },
  action: {
    label: 'Needs action',
    icon: ShieldAlert,
  },
}

export default function AdminLaunchPage() {
  const [checklist, setChecklist] = useState<LaunchChecklist | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadChecklist()
  }, [])

  async function loadChecklist() {
    setLoading(true)
    setMessage('')

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/launch-checklist', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setMessage(result?.error || 'Unable to load launch checklist.')
      setLoading(false)
      return
    }

    setChecklist(result)
    setLoading(false)
  }

  const launchScore = useMemo(() => {
    if (!checklist?.counts.total) return 0
    return Math.round((checklist.counts.ready / checklist.counts.total) * 100)
  }, [checklist])

  const topActions = useMemo(() => {
    return (checklist?.groups || [])
      .flatMap((group) => group.items)
      .filter((item) => item.status === 'action')
      .slice(0, 4)
  }, [checklist])

  if (loading) {
    return (
      <main className="admin-launch-page">
        <section className="admin-launch-loading">
          <LoaderCircle className="admin-spin" size={28} />
          <p>Checking launch readiness…</p>
        </section>
      </main>
    )
  }

  if (!checklist) {
    return (
      <main className="admin-launch-page">
        <section className="admin-launch-empty">
          <AlertTriangle size={30} />
          <h2>Checklist unavailable</h2>
          <p>{message || 'Try refreshing this page.'}</p>
          <button type="button" onClick={loadChecklist}>Try again</button>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-launch-page">
      <section className="admin-launch-hero">
        <div>
          <span><Rocket size={17} /> GO-LIVE READINESS</span>
          <h1>Your launch checklist, all in one place.</h1>
          <p>
            A quick command view of payments, email, campers, documents,
            maintenance, events, and the items that need attention before launch.
          </p>
        </div>

        <article>
          <small>Launch score</small>
          <strong>{launchScore}%</strong>
          <span>{checklist.counts.ready} of {checklist.counts.total} checks ready</span>
          <button type="button" onClick={loadChecklist}>
            Refresh checklist
          </button>
        </article>
      </section>

      <section className="admin-launch-stats">
        <article className="ready"><small>Ready</small><strong>{checklist.counts.ready}</strong></article>
        <article className="warning"><small>Watch</small><strong>{checklist.counts.warning}</strong></article>
        <article className="action"><small>Needs action</small><strong>{checklist.counts.action}</strong></article>
        <article><small>Unread alerts</small><strong>{checklist.alerts.total}</strong></article>
      </section>

      <section className="admin-launch-priorities">
        <div>
          <span><Sparkles size={15} /> TOP PRIORITIES</span>
          <h2>{topActions.length ? 'Handle these first' : 'Nothing critical is blocking launch'}</h2>
          <p>
            {topActions.length
              ? 'These are the checks most likely to slow down launch if they are ignored.'
              : 'You still may have watch items, but the hard blockers look clear.'}
          </p>
        </div>

        <div>
          {topActions.length ? (
            topActions.map((action) => (
              <a href={action.href || '/admin'} key={action.id}>
                <ShieldAlert size={18} />
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
                <ArrowRight size={17} />
              </a>
            ))
          ) : (
            <article>
              <ClipboardCheck size={22} />
              <strong>Critical items are clear</strong>
              <small>Use the grouped checklist below for final polish.</small>
            </article>
          )}
        </div>
      </section>

      <section className="admin-launch-groups">
        {checklist.groups.map((group) => (
          <div className="admin-launch-group" key={group.id}>
            <div className="admin-launch-group-heading">
              <span><ClipboardCheck size={15} /> {group.title}</span>
              <em>{group.items.filter((item) => item.status === 'ready').length}/{group.items.length} ready</em>
            </div>

            <div className="admin-launch-list">
              {group.items.map((check) => {
                const config = statusConfig[check.status]
                const Icon = config.icon

                const content = (
                  <>
                    <span className={`admin-launch-status ${check.status}`}><Icon size={18} /></span>
                    <span>
                      <small>{config.label}</small>
                      <strong>{check.label}</strong>
                      <p>{check.detail}</p>
                    </span>
                    {check.href && <ArrowRight size={17} />}
                  </>
                )

                return check.href ? (
                  <a className="admin-launch-item" href={check.href} key={check.id}>
                    {content}
                  </a>
                ) : (
                  <article className="admin-launch-item" key={check.id}>
                    {content}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <p className="admin-launch-generated">
        Last checked {new Date(checklist.generatedAt).toLocaleString()}.
      </p>
    </main>
  )
}
