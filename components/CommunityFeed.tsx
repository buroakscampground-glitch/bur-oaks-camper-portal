'use client'

import { Ban, Bell, Camera, Check, CheckCircle2, Clock, Edit3, ExternalLink, Eye, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Pin, RefreshCw, Send, ShieldCheck, Trash2, UserCheck, UsersRound, X, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { communityActionHref, communityActionLabel } from '../lib/community-actions'
import { communityPostAuthor, communityPostLocation } from '../lib/community-branding'
import { supabase } from '../lib/supabase'

type FeedProps = { adminMode?: boolean }

const categories = [
  { value: 'all', label: 'Latest' },
  { value: 'office', label: 'Office' },
  { value: 'event', label: 'Events' },
  { value: 'dinner', label: 'Dinners' },
  { value: 'lost_found', label: 'Lost & Found' },
  { value: 'marketplace', label: 'For Sale / Free' },
  { value: 'general', label: 'General Talk' },
]

function localDateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function scheduledDate(value: string) {
  return value ? new Date(`${value}T08:00:00`).toISOString() : null
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function modeLabel(value: string) {
  if (value === 'right_away') return 'Right away by email'
  if (value === 'portal_only') return 'Portal only'
  return 'One daily email summary'
}

export default function CommunityFeed({ adminMode = false }: FeedProps) {
  const [posts, setPosts] = useState<any[]>([])
  const [viewer, setViewer] = useState<any>(null)
  const [preferences, setPreferences] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [activityNotifications, setActivityNotifications] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [adminSection, setAdminSection] = useState<'feed' | 'activity' | 'members'>('feed')
  const [blocked, setBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [tab, setTab] = useState<'all' | 'official' | 'mine'>('all')
  const [category, setCategory] = useState('all')
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [postCategory, setPostCategory] = useState('general')
  const [actionType, setActionType] = useState('')
  const [actionUrl, setActionUrl] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [pinned, setPinned] = useState(false)
  const [pinnedUntil, setPinnedUntil] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [sendText, setSendText] = useState(true)
  const [sendCorrectionText, setSendCorrectionText] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [editingPost, setEditingPost] = useState<any>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [showComposer, setShowComposer] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [expandedPhoto, setExpandedPhoto] = useState<{ url: string; alt: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState('')
  const [linkedPostId, setLinkedPostId] = useState('')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const postRequestId = useRef('')
  const reactionRequests = useRef(new Set<string>())
  const observedPosts = useRef(new Map<string, HTMLElement>())
  const markedPosts = useRef(new Set<string>())
  const linkedPostHandled = useRef(false)

  useEffect(() => { loadFeed() }, [])
  useEffect(() => {
    const postId = new URLSearchParams(window.location.search).get('post') || ''
    if (postId) {
      setLinkedPostId(postId)
      setTab('all')
      setCategory('all')
    }
  }, [])
  useEffect(() => {
    if (loading || !linkedPostId || linkedPostHandled.current) return
    const linkedPost = posts.find((post) => String(post.id) === linkedPostId)
    if (!linkedPost) {
      setNotice('That Campground Messenger post is no longer available. The newest posts are shown below.')
      linkedPostHandled.current = true
      return
    }
    const frame = window.requestAnimationFrame(() => {
      setExpandedThreads((current) => new Set(current).add(linkedPostId))
      const element = document.getElementById(`community-post-${linkedPostId}`)
      if (!element) return
      linkedPostHandled.current = true
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, linkedPostId, posts])
  useEffect(() => {
    const saved = window.localStorage.getItem('bur-oaks-community-draft')
    if (saved) setDraft(saved)
  }, [])
  useEffect(() => {
    if (!editingPost) window.localStorage.setItem('bur-oaks-community-draft', draft)
  }, [draft, editingPost])
  useEffect(() => {
    if (!posts.length) return
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= .55).map((entry) => entry.target.getAttribute('data-post-id') || '').filter(Boolean).filter((id) => !markedPosts.current.has(id))
      if (!seen.length) return
      seen.forEach((id) => markedPosts.current.add(id))
      communityAction({ action: 'mark_read', postIds: seen }).then(() => {
        setPosts((current) => current.map((post) => seen.includes(String(post.id)) ? { ...post, read_by_me: true } : post))
        window.dispatchEvent(new Event('community-unread-changed'))
      }).catch(() => seen.forEach((id) => markedPosts.current.delete(id)))
    }, { threshold: [.55] })
    observedPosts.current.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [posts.length, tab, category])
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])
  useEffect(() => {
    if (!expandedPhoto) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedPhoto(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [expandedPhoto])

  async function authHeaders(json = true): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    }
  }

  async function loadFeed(silent = false) {
    if (!silent) setLoading(true)
    setNotice('')
    const response = await fetch('/api/community-feed', { headers: await authHeaders(false) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(result.error || 'Campground Messenger could not be opened.')
      setLoading(false)
      return
    }
    setPosts(result.posts || [])
    setViewer(result.viewer || null)
    setBlocked(Boolean(result.blocked))
    setBlockReason(result.reason || '')
    setPreferences(result.preferences || null)
    setReports(result.reports || [])
    setActivityNotifications(result.activityNotifications || [])
    setMembers(result.members || [])
    setLoading(false)
    if (result.viewer?.canManage && Number(result.directCount || 0) > 0) {
      try {
        await communityAction({ action: 'mark_staff_activity_read' })
        setActivityNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
        window.dispatchEvent(new Event('community-unread-changed'))
        window.dispatchEvent(new Event('community-workspace-changed'))
        window.dispatchEvent(new Event('admin-attention-changed'))
      } catch (error) {
        console.error('Community staff alerts could not be acknowledged:', error)
      }
    }
  }

  async function communityAction(payload: any) {
    const response = await fetch('/api/community-feed', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'That change could not be saved.')
    return result
  }

  function choosePhoto(file?: File) {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file || null)
    setPhotoPreview(file ? URL.createObjectURL(file) : '')
  }

  async function publishPost() {
    if (!draft.trim() && !photo) return
    if (adminMode && actionType === 'custom' && !communityActionHref('custom', actionUrl)) {
      setNotice('Add a secure https:// link or a portal path beginning with / before publishing this button.')
      return
    }
    setWorking('post')
    setNotice('')
    try {
      if (!postRequestId.current) postRequestId.current = crypto.randomUUID()
      let photoPath = ''
      if (photo) {
        const form = new FormData()
        form.append('photo', photo)
        const response = await fetch('/api/community-feed/upload', { method: 'POST', headers: await authHeaders(false), body: form })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'The photo could not be uploaded.')
        photoPath = result.path
      }
      const recentTime = viewer?.recentStaffPostAt ? new Date(viewer.recentStaffPostAt).getTime() : 0
      const minutesSince = Math.floor((Date.now() - recentTime) / 60_000)
      if (adminMode && (editingPost ? sendCorrectionText : sendText) && recentTime && minutesSince >= 0 && minutesSince < 10 && !window.confirm(`A campground post text went out ${minutesSince || 'less than one'} minute${minutesSince === 1 ? '' : 's'} ago. Post this and send another text anyway?`)) {
        setWorking('')
        return
      }
      if (editingPost) {
        await communityAction({ action: 'update_post', postId: editingPost.id, body: draft, commentsEnabled, category: postCategory, actionType, actionUrl, pinned, pinnedUntil: pinnedUntil ? new Date(pinnedUntil).toISOString() : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, sendCorrectionText })
      } else {
        await communityAction({ action: 'create_post', requestId: postRequestId.current, body: draft, photoPath, commentsEnabled, category: postCategory, actionType, actionUrl, publishAt: scheduledDate(publishAt), pinned, pinnedUntil: pinnedUntil ? new Date(pinnedUntil).toISOString() : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, sendText })
      }
      setDraft('')
      window.localStorage.removeItem('bur-oaks-community-draft')
      postRequestId.current = ''
      choosePhoto()
      setShowComposer(false)
      setPreviewing(false)
      setEditingPost(null)
      setNotice(editingPost ? 'The Campground Messenger post was updated.' : publishAt && new Date(`${publishAt}T08:00:00`).getTime() > Date.now() ? 'The Campground Messenger post is scheduled for about 8 AM Central.' : viewer?.canPostOfficial ? 'The official Bur Oaks message is live.' : `${viewer?.postingName || 'Your'} post is now in Campground Messenger.`)
      await loadFeed(true)
    } catch (error: any) {
      setNotice(error.message)
    }
    setWorking('')
  }

  function resetComposer() {
    setDraft(window.localStorage.getItem('bur-oaks-community-draft') || '')
    setEditingPost(null)
    setPostCategory('general')
    setActionType('')
    setActionUrl('')
    setPublishAt('')
    setPinned(false)
    setPinnedUntil('')
    setExpiresAt('')
    setSendText(true)
    setSendCorrectionText(false)
    setCommentsEnabled(true)
    setPreviewing(false)
  }

  function openComposer() {
    resetComposer()
    setShowComposer(true)
  }

  function editPost(post: any) {
    setEditingPost(post)
    setDraft(post.body || '')
    setPostCategory(post.category || 'general')
    setActionType(post.action_type || '')
    setActionUrl(post.action_type === 'custom' ? post.action_url || '' : '')
    setPublishAt(localDateInput(post.publish_at))
    setPinned(Boolean(post.pinned_until && new Date(post.pinned_until).getTime() > Date.now()))
    setPinnedUntil(post.pinned_until ? localDateInput(post.pinned_until) + 'T23:59' : '')
    setExpiresAt(post.expires_at ? localDateInput(post.expires_at) + 'T23:59' : '')
    setCommentsEnabled(post.comments_enabled !== false)
    setSendCorrectionText(false)
    setPreviewing(false)
    setShowComposer(true)
  }

  async function markAllSeen() {
    setWorking('mark-all')
    try {
      await communityAction({ action: 'mark_all_read' })
      setPosts((current) => current.map((post) => ({ ...post, read_by_me: true })))
      window.dispatchEvent(new Event('community-unread-changed'))
    } catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  async function toggleLike(post: any) {
    const postId = String(post.id || '')
    if (!postId || reactionRequests.current.has(postId)) return
    reactionRequests.current.add(postId)
    const liked = !post.liked_by_me
    setPosts((current) => current.map((item) => item.id === postId ? { ...item, liked_by_me: liked, reaction_count: Math.max(0, Number(item.reaction_count || 0) + (liked ? 1 : -1)), reaction_pending: true } : item))
    try {
      const result = await communityAction({ action: 'toggle_reaction', postId })
      setPosts((current) => current.map((item) => item.id === postId ? { ...item, liked_by_me: Boolean(result.liked), reaction_count: Number(result.reactionCount || 0), reaction_pending: false } : item))
    } catch {
      setPosts((current) => current.map((item) => item.id === postId ? { ...post, reaction_pending: false } : item))
    } finally {
      reactionRequests.current.delete(postId)
    }
  }

  async function addComment(post: any) {
    const text = String(commentDrafts[post.id] || '').trim()
    if (!text) return
    setWorking(`comment:${post.id}`)
    try {
      const result = await communityAction({ action: 'create_comment', postId: post.id, body: text })
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: [...(item.comments || []), result.comment] } : item))
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }))
    } catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  async function savePreferences() {
    setWorking('preferences')
    try {
      await communityAction({
        action: 'save_preferences',
        communityMode: preferences.community_mode,
        repliesMode: preferences.replies_mode,
        officialMode: preferences.official_mode,
        quietHoursEnabled: preferences.quiet_hours_enabled,
      })
      setShowSettings(false)
      setNotice('Your Campground Messenger notification choices are saved.')
    } catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  async function reportPost(postId: string) {
    if (!window.confirm('Send this post to the office for review?')) return
    try { await communityAction({ action: 'report', postId }); setNotice('The office will review this post.') }
    catch (error: any) { setNotice(error.message) }
  }

  async function moderate(contentType: 'post' | 'comment', id: string, status: 'published' | 'hidden', reportId?: string) {
    setWorking(`moderate:${id}`)
    try { await communityAction({ action: 'moderate', contentType, id, status, reportId }); await loadFeed(true) }
    catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  async function deleteContent(contentType: 'post' | 'comment', id: string) {
    const label = contentType === 'post' ? 'post and all of its comments' : 'comment'
    if (!window.confirm(`Permanently delete this ${label}? This cannot be undone.`)) return
    setWorking(`delete:${id}`)
    try {
      await communityAction({ action: 'delete_content', contentType, id, reason: 'Deleted by campground administrator.' })
      setNotice(`The ${contentType} was permanently deleted.`)
      await loadFeed(true)
    } catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  async function setMemberAccess(member: any, accessLevel: 'active' | 'read_only' | 'blocked') {
    const description = accessLevel === 'blocked' ? 'block all Community access' : accessLevel === 'read_only' ? 'make this camper read-only' : 'restore full Community access'
    if (!window.confirm(`${description[0].toUpperCase()}${description.slice(1)} for ${member.name} at Lot ${member.lotNumber}? Their billing, documents, payments, and the rest of their portal will not be affected.`)) return
    let reason = ''
    if (accessLevel !== 'active') {
      const enteredReason = window.prompt('Optional: enter the reason this camper will see. Leave blank for the standard office message.', '')
      if (enteredReason === null) return
      reason = enteredReason.trim().slice(0, 300)
    }
    setWorking(`member:${member.id}`)
    try {
      await communityAction({ action: 'set_member_access', camperId: member.id, accessLevel, reason: accessLevel === 'active' ? '' : reason || 'Community access changed by the campground administrator.' })
      setNotice(`${member.name} is now ${accessLevel === 'blocked' ? 'blocked from the Community' : accessLevel === 'read_only' ? 'read-only' : 'active in the Community'}.`)
      await loadFeed(true)
    } catch (error: any) { setNotice(error.message) }
    setWorking('')
  }

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (tab === 'official') return post.is_official
    if (tab === 'mine') return String(post.camper_id) === String(viewer?.id)
    return true
  }).filter((post) => category === 'all' || String(post.category || 'general') === category).sort((a, b) => {
    const aPinned = a.pinned_until && new Date(a.pinned_until).getTime() > Date.now() ? 1 : 0
    const bPinned = b.pinned_until && new Date(b.pinned_until).getTime() > Date.now() ? 1 : 0
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1
    if (b.status === 'scheduled' && a.status !== 'scheduled') return 1
    if (aPinned !== bPinned) return bPinned - aPinned
    return new Date(b.publish_at || b.created_at).getTime() - new Date(a.publish_at || a.created_at).getTime()
  }), [posts, tab, category, viewer])
  const unreadCount = visiblePosts.filter((post) => post.status === 'published' && !post.read_by_me).length
  const filteredMembers = useMemo(() => members.filter((member) => `${member.name} ${member.lotNumber}`.toLowerCase().includes(memberSearch.trim().toLowerCase())), [members, memberSearch])

  if (!loading && blocked) {
    return (
      <main className="campground-community-page">
        <section className="campground-community-blocked"><Ban size={34} /><small>MESSENGER ACCESS PAUSED</small><h1>Campground Messenger is not available for this account.</h1><p>{blockReason || 'Please contact the Bur Oaks office if you have questions.'}</p><a href="/portal">Return to Portal Home</a></section>
      </main>
    )
  }

  return (
    <main className={`campground-community-page${adminMode ? ' admin-community-page' : ''}`}>
      <section className={`campground-community-hero${adminMode ? ' compact' : ''}`}>
        <div className="campground-community-hero-icon"><UsersRound size={30} /></div>
        <div>
          <span>{adminMode ? 'MESSENGER ADMINISTRATION' : 'AROUND THE CAMPGROUND'}</span>
          <h1>Campground Messenger</h1>
          <p>{adminMode ? 'Post messages, follow discussions, review activity, or manage access from one clear workspace.' : 'Official updates and friendly conversations with your Bur Oaks neighbors—all in one easy feed.'}</p>
        </div>
        <button className="campground-community-settings" type="button" onClick={() => setShowSettings(true)}><Bell size={18} /> Alerts</button>
      </section>

      {!adminMode && <section className="campground-community-calm"><ShieldCheck size={18} /><div><strong>Official Bur Oaks messages stay easy to find.</strong><span>Staff may send one short text with a link. Replies and likes stay quietly inside Campground Messenger.</span></div></section>}
      {notice && <p className="campground-community-notice" role="status">{notice}</p>}

      {adminMode && <nav className="campground-community-admin-sections" aria-label="Campground Messenger administration sections">
        <button type="button" className={adminSection === 'feed' ? 'active' : ''} onClick={() => setAdminSection('feed')}><MessageCircle size={21} /><span><strong>Messenger & posting</strong><small>Read, post, and reply</small></span></button>
        <button type="button" className={adminSection === 'activity' ? 'active' : ''} onClick={() => setAdminSection('activity')}><Bell size={21} /><span><strong>Activity & reports</strong><small>Recent activity and moderation</small></span>{reports.length > 0 && <b>{reports.length}</b>}</button>
        {viewer?.canDelete && <button type="button" className={adminSection === 'members' ? 'active' : ''} onClick={() => setAdminSection('members')}><ShieldCheck size={21} /><span><strong>Member access</strong><small>Search, restrict, or restore</small></span>{members.some((member) => member.accessLevel !== 'active') && <b>{members.filter((member) => member.accessLevel !== 'active').length}</b>}</button>}
      </nav>}

      {adminMode && adminSection === 'activity' && reports.length > 0 && (
        <section className="campground-community-review">
          <header><div><small>NEEDS REVIEW</small><h2>{reports.length} reported item{reports.length === 1 ? '' : 's'}</h2></div></header>
          {reports.map((report) => (
            <article key={report.id}><span>{report.reason}</span><div><button type="button" onClick={() => moderate(report.comment_id ? 'comment' : 'post', report.comment_id || report.post_id, 'hidden', report.id)}>Hide item</button><button type="button" onClick={() => moderate(report.comment_id ? 'comment' : 'post', report.comment_id || report.post_id, 'published', report.id)}>Leave visible</button></div></article>
          ))}
        </section>
      )}

      {adminMode && adminSection === 'activity' && activityNotifications.length > 0 && (
        <section className="campground-community-staff-activity">
          <header><Bell size={19} /><div><small>STAFF ALERTS</small><h2>Recent Messenger activity</h2><p>Rachel and administrator accounts see activity here, with routine items collected into the daily email.</p></div></header>
          <div>{activityNotifications.slice(0, 10).map((item) => (
            <a href={item.post_id ? `#community-post-${item.post_id}` : undefined} key={item.id}>
              <span>{item.message}</span>
              <small>{formatDate(item.created_at)} · {item.email_status === 'sent' ? 'Email sent' : item.email_status === 'failed' ? 'Email needs attention' : 'Portal alert saved'}</small>
            </a>
          ))}</div>
        </section>
      )}

      {adminMode && adminSection === 'activity' && reports.length === 0 && activityNotifications.length === 0 && (
        <section className="campground-community-admin-empty"><CheckCircle2 size={30} /><strong>Nothing needs review.</strong><span>New camper posts, comments, and reports will appear here.</span></section>
      )}

      {adminMode && adminSection === 'members' && viewer?.canDelete && (
        <section className="campground-community-owner-controls">
          <div className="campground-community-members open">
              <header><div><small>MESSENGER MEMBERS</small><h2>Manage camper access</h2><p>Search by camper or lot. These controls affect only Campground Messenger—not billing or the rest of the portal.</p></div></header>
              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search camper or lot…" aria-label="Search Campground Messenger members" />
              <div className="campground-community-member-list">
                {filteredMembers.map((member) => (
                  <article className={member.accessLevel} key={member.id}><div><strong>{member.name}</strong><small>Lot {member.lotNumber} · {member.accessLevel === 'blocked' ? 'Blocked' : member.accessLevel === 'read_only' ? 'Read-only' : 'Active'}</small></div><div><button type="button" className={member.accessLevel === 'active' ? 'selected' : ''} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'active')}><UserCheck size={14} /> Active</button><button type="button" className={member.accessLevel === 'read_only' ? 'selected' : ''} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'read_only')}><Eye size={14} /> Read-only</button><button type="button" className={member.accessLevel === 'blocked' ? 'selected danger' : 'danger'} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'blocked')}><Ban size={14} /> Block</button></div></article>
                ))}
              </div>
          </div>
        </section>
      )}

      {(!adminMode || adminSection === 'feed') && <>
      <section className="campground-community-toolbar">
        <div role="tablist" aria-label="Campground Messenger views">
          <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Latest</button>
          <button type="button" className={tab === 'official' ? 'active' : ''} onClick={() => setTab('official')}>Official only</button>
          <button type="button" className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My posts</button>
        </div>
        <button type="button" className="campground-community-refresh" onClick={() => loadFeed(true)} aria-label="Refresh Campground Messenger"><RefreshCw size={17} /></button>
      </section>

      <section className="campground-community-categories" aria-label="Filter posts by topic">
        {categories.map((item) => <button type="button" key={item.value} className={category === item.value ? 'active' : ''} onClick={() => setCategory(item.value)}>{item.label}</button>)}
      </section>

      {unreadCount > 0 && <section className="campground-community-new-summary"><span><Bell size={18} /><strong>{unreadCount} new post{unreadCount === 1 ? '' : 's'} since your last visit</strong></span><button type="button" onClick={markAllSeen} disabled={working === 'mark-all'}><CheckCircle2 size={17} /> Mark all seen</button></section>}

      <section className="campground-community-layout">
        <div className="campground-community-feed">
          <button className="campground-community-compose-open" type="button" onClick={openComposer}>
            <span>{String(viewer?.name || 'You').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
            <strong>{adminMode ? viewer?.canPostOfficial ? 'Post an official message or join a discussion…' : `Post as ${viewer?.postingName || 'yourself'} or join a discussion…` : 'Start a post, share a photo, or ask a question…'}</strong>
            <Camera size={19} />
          </button>

          {loading ? <div className="campground-community-empty">Opening Campground Messenger…</div> : visiblePosts.length === 0 ? (
            <div className="campground-community-empty"><UsersRound size={28} /><strong>No posts in this view yet.</strong><span>Start the conversation with a friendly update or question.</span></div>
          ) : visiblePosts.map((post, index) => (
            <div key={post.id}>
            {post.status === 'published' && !post.read_by_me && !visiblePosts.slice(0, index).some((item) => item.status === 'published' && !item.read_by_me) && <div className="campground-community-divider new"><span>NEW SINCE YOUR LAST VISIT</span></div>}
            {post.read_by_me && index > 0 && !visiblePosts[index - 1]?.read_by_me && <div className="campground-community-divider"><span>EARLIER POSTS</span></div>}
            <article ref={(element) => { if (element) observedPosts.current.set(String(post.id), element); else observedPosts.current.delete(String(post.id)) }} data-post-id={post.id} tabIndex={linkedPostId === String(post.id) ? -1 : undefined} className={`campground-community-post${post.is_official ? ' official' : ''}${post.status === 'hidden' ? ' hidden' : ''}${post.status === 'scheduled' ? ' scheduled' : ''}${post.pinned_until && new Date(post.pinned_until).getTime() > Date.now() ? ' pinned' : ''}${linkedPostId === String(post.id) ? ' linked' : ''}`} id={`community-post-${post.id}`}>
              {linkedPostId === String(post.id) && <div className="campground-community-linked-label"><ExternalLink size={15} /> Opened from your text alert</div>}
              <header>
                {post.is_official ? <span className="campground-community-avatar official"><img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" /></span> : <span className="campground-community-avatar">{communityPostAuthor(post).split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>}
                <div><strong>{communityPostAuthor(post)}</strong>{post.is_official && <b>OFFICIAL BUR OAKS POST</b>}<small>{communityPostLocation(post) ? `${communityPostLocation(post)} · ` : ''}{formatDate(post.publish_at || post.created_at)}</small></div>
                {adminMode ? <div className="campground-community-admin-actions">{(String(post.camper_id) === String(viewer?.id) || post.is_official) && <button type="button" onClick={() => editPost(post)}><Edit3 size={14} /> Edit</button>}{post.status !== 'scheduled' && <button type="button" onClick={() => moderate('post', post.id, post.status === 'hidden' ? 'published' : 'hidden')} disabled={working === `moderate:${post.id}`}>{post.status === 'hidden' ? 'Restore' : 'Hide'}</button>}{viewer?.canDelete && <>{String(post.camper_id) !== String(viewer.id) && <button type="button" onClick={() => setMemberAccess({ id: post.camper_id, name: post.author_name, lotNumber: post.lot_number }, 'blocked')}><Ban size={14} /> Block</button>}<button className="danger" type="button" onClick={() => deleteContent('post', post.id)} disabled={working === `delete:${post.id}`}><Trash2 size={14} /> Delete</button></>}</div> : <button type="button" className="campground-community-menu" onClick={() => reportPost(post.id)} aria-label="Report post"><MoreHorizontal size={19} /></button>}
              </header>
              {post.status === 'hidden' && <em className="campground-community-hidden-label">Hidden from campers</em>}
              {post.status === 'scheduled' && <em className="campground-community-hidden-label"><Clock size={13} /> Scheduled for {formatDate(post.publish_at)}</em>}
              {post.pinned_until && new Date(post.pinned_until).getTime() > Date.now() && <em className="campground-community-pin-label"><Pin size={13} /> Pinned important post</em>}
              <div className="campground-community-post-meta"><span>{categories.find((item) => item.value === (post.category || 'general'))?.label || 'General Talk'}</span>{post.edited_at && <small>Edited</small>}{post.expires_at && adminMode && <small>Expires {formatDate(post.expires_at)}</small>}</div>
              <p>{post.body}</p>
              {post.photo_url && (() => {
                const alt = `Shared by ${communityPostAuthor(post)}`
                return <button className="campground-community-photo-button" type="button" onClick={() => setExpandedPhoto({ url: post.photo_url, alt })} aria-label={`Open full-size photo ${alt}`}><img className="campground-community-photo" src={post.photo_url} alt={alt} /><span><ZoomIn size={16} /> View full picture</span></button>
              })()}
              {(() => {
                const href = communityActionHref(post.action_type, post.action_url, adminMode ? 'admin' : 'camper')
                if (!href) return null
                const external = href.startsWith('https://')
                return <a className="campground-community-post-action" href={href} rel={external ? 'noreferrer' : undefined} target={external ? '_blank' : undefined}><span>{communityActionLabel(post.action_type)}</span><ExternalLink size={18} /></a>
              })()}
              {adminMode && post.status === 'published' && <div className="campground-community-delivery"><Eye size={15} /><span>{post.read_count || 0} viewed</span>{post.sms_delivery ? <><Send size={15} /><span>{post.sms_delivery.sent_count || 0} texts delivered{post.sms_delivery.failed_count ? ` · ${post.sms_delivery.failed_count} failed` : ''}</span></> : <span>No text delivery recorded</span>}</div>}
              {(() => {
                const discussionComments = (post.comments || []).filter((comment: any) => adminMode || comment.status !== 'hidden')
                const publicReplyCount = (post.comments || []).filter((comment: any) => comment.status !== 'hidden').length
                const isExpanded = expandedThreads.has(String(post.id))
                const shownComments = isExpanded ? discussionComments : discussionComments.slice(0, 3)
                const participantNames = Array.from(new Set(discussionComments.map((comment: any) => String(comment.author_name || 'Bur Oaks')))).slice(0, 5) as string[]

                return <>
                  <div className="campground-community-discussion-summary">
                    <div className="campground-community-participants" aria-label={`${participantNames.length} recent participants`}>
                      {participantNames.map((name) => <span key={name} title={name}>{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>)}
                    </div>
                    <div><strong>{publicReplyCount} {publicReplyCount === 1 ? 'reply' : 'replies'}</strong>{Number(post.read_count || 0) > 0 && <small>Seen by {post.read_count}</small>}</div>
                  </div>
                  <div className="campground-community-actions">
                    <button type="button" className={post.liked_by_me ? 'liked' : ''} disabled={Boolean(post.reaction_pending)} onClick={() => toggleLike(post)}><Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /> {post.liked_by_me ? 'Liked' : 'Like'} <span>{post.reaction_count || ''}</span></button>
                    <span><MessageCircle size={17} /> {publicReplyCount} {publicReplyCount === 1 ? 'reply' : 'replies'}</span>
                  </div>
                  {shownComments.map((comment: any) => (
                    <div className={`campground-community-comment${comment.status === 'hidden' ? ' hidden' : ''}`} key={comment.id}>
                      <span>{String(comment.author_name || 'BO').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
                      <div><strong>{comment.author_name}</strong><small>{comment.lot_number ? `Lot ${comment.lot_number} · ` : ''}{formatDate(comment.created_at)}</small><p>{comment.body}</p></div>
                      {adminMode && <div className="campground-community-comment-admin"><button type="button" onClick={() => moderate('comment', comment.id, comment.status === 'hidden' ? 'published' : 'hidden')}>{comment.status === 'hidden' ? 'Restore' : 'Hide'}</button>{viewer?.canDelete && <button className="danger" type="button" onClick={() => deleteContent('comment', comment.id)}><Trash2 size={12} /> Delete</button>}</div>}
                    </div>
                  ))}
                  {discussionComments.length > 3 && <button className="campground-community-thread-toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpandedThreads((current) => {
                    const next = new Set(current)
                    if (next.has(String(post.id))) next.delete(String(post.id)); else next.add(String(post.id))
                    return next
                  })}>{isExpanded ? 'Show fewer replies' : `Open full discussion · ${discussionComments.length} replies`}</button>}
                  {post.comments_enabled && post.status !== 'hidden' && (
                    <div className="campground-community-comment-box">
                      <textarea rows={2} value={commentDrafts[post.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Join this discussion…" aria-label={`Reply to ${communityPostAuthor(post)}'s post`} />
                      <button type="button" onClick={() => addComment(post)} disabled={working === `comment:${post.id}` || !String(commentDrafts[post.id] || '').trim()}><Send size={18} /><span>Reply</span></button>
                    </div>
                  )}
                </>
              })()}
            </article>
            </div>
          ))}
        </div>

        {!adminMode && <aside className="campground-community-guide">
          <small>HOW ALERTS WORK</small>
          <h2>Stay connected without the buzzing.</h2>
          <ul><li><Check size={16} /> New activity appears as an unread badge.</li><li><Check size={16} /> General posts become one daily email.</li><li><Check size={16} /> Replies to your post may email you right away.</li><li><Check size={16} /> Routine notices pause during quiet hours.</li><li><Check size={16} /> Emergency texts remain separate.</li></ul>
          <button type="button" onClick={() => setShowSettings(true)}><Bell size={16} /> Choose my alerts</button>
        </aside>}
      </section>
      </>}

      {expandedPhoto && (
        <div className="campground-community-photo-lightbox" role="dialog" aria-modal="true" aria-label="Full-size Campground Messenger photo" onClick={() => setExpandedPhoto(null)}>
          <button type="button" onClick={() => setExpandedPhoto(null)} aria-label="Close full-size photo"><X size={21} /> Close</button>
          <img src={expandedPhoto.url} alt={expandedPhoto.alt} onClick={(event) => event.stopPropagation()} />
        </div>
      )}

      {showComposer && (
        <div className="campground-community-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create Campground Messenger post">
          <section className="campground-community-modal">
            <header><div><small>{viewer?.canPostOfficial ? 'OFFICIAL BUR OAKS MESSAGE' : adminMode ? `${viewer?.postingName || 'STAFF'} MESSENGER POST` : 'NEW MESSENGER POST'}</small><h2>{editingPost ? 'Edit this post' : 'Create a post'}</h2></div><button type="button" onClick={() => setShowComposer(false)} aria-label="Close"><X size={19} /></button></header>
            {previewing ? <article className="campground-community-compose-preview"><small>PREVIEW — WHAT CAMPERS WILL SEE</small><strong>{viewer?.canPostOfficial ? 'Bur Oaks Campground' : viewer?.postingName || viewer?.name}</strong><span>{categories.find((item) => item.value === postCategory)?.label}</span><p>{draft || 'Your message will appear here.'}</p>{photoPreview && <img src={photoPreview} alt="Post preview" />}{actionType && <b>{communityActionLabel(actionType)} <ExternalLink size={15} /></b>}</article> : <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} maxLength={2000} placeholder="What would you like the campground to know?" autoFocus />}
            {photoPreview && !previewing && <div className="campground-community-photo-preview"><img src={photoPreview} alt="Selected upload preview" /><button type="button" onClick={() => choosePhoto()}><X size={16} /> Remove</button></div>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
            <div className="campground-community-compose-fields">
              <label><span>Topic</span><select value={postCategory} onChange={(event) => setPostCategory(event.target.value)}>{categories.filter((item) => item.value !== 'all').map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
              {adminMode && <label><span>Helpful button</span><select value={actionType} onChange={(event) => setActionType(event.target.value)}><option value="">No button</option><option value="events">View events and RSVP</option><option value="dinners">View dinner details</option><option value="contact">Contact the office</option><option value="custom">Custom link</option></select></label>}
              {adminMode && actionType === 'custom' && <label className="wide"><span>Custom link</span><input value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="https://… or /portal/page" /></label>}
            </div>
            {adminMode && <details className="campground-community-publishing-options"><summary><Clock size={17} /> Publishing and expiration options</summary><div>
              {!editingPost && <label><span>Publish on a future date around 8 AM (optional)</span><input type="date" value={publishAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setPublishAt(event.target.value)} /></label>}
              <label><span>Automatically remove after (optional)</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>Pin this important post to the top</span></label>
              {pinned && <label><span>Keep pinned until</span><input type="datetime-local" value={pinnedUntil} onChange={(event) => setPinnedUntil(event.target.value)} /></label>}
              {!editingPost && <label className="check"><input type="checkbox" checked={sendText} onChange={(event) => setSendText(event.target.checked)} /><span>Send campers one short text with the Campground Messenger link</span></label>}
              {editingPost && <label className="check"><input type="checkbox" checked={sendCorrectionText} onChange={(event) => setSendCorrectionText(event.target.checked)} /><span>Text campers that this post was corrected</span></label>}
            </div></details>}
            <div className="campground-community-compose-options">
              {!editingPost && <button type="button" onClick={() => fileRef.current?.click()}><ImageIcon size={17} /> Add photo</button>}
              <label><input type="checkbox" checked={commentsEnabled} onChange={(event) => setCommentsEnabled(event.target.checked)} /> Allow comments</label>
              {adminMode && <span className="campground-community-official-compose-note"><ShieldCheck size={17} /> Campers will see this from {viewer?.canPostOfficial ? 'Bur Oaks Campground as an official post' : viewer?.postingName || 'this staff account'}</span>}
            </div>
            <div className="campground-community-compose-submit"><button type="button" onClick={() => setPreviewing((value) => !value)}><Eye size={17} /> {previewing ? 'Keep editing' : 'Preview'}</button><button className="campground-community-primary" type="button" onClick={publishPost} disabled={working === 'post' || (!draft.trim() && !photo)}>{working === 'post' ? 'Saving…' : editingPost ? 'Save changes' : publishAt && new Date(`${publishAt}T08:00:00`).getTime() > Date.now() ? 'Schedule post' : 'Post to Messenger'}</button></div>
          </section>
        </div>
      )}

      {showSettings && preferences && (
        <div className="campground-community-modal-backdrop" role="dialog" aria-modal="true" aria-label="Campground Messenger notification settings">
          <section className="campground-community-modal campground-community-preferences">
            <header><div><small>YOUR CHOICES</small><h2>Notification settings</h2></div><button type="button" onClick={() => setShowSettings(false)} aria-label="Close"><X size={19} /></button></header>
            <p>Likes and comments do not send texts. Staff may send one short text for a new campground post. Choose when you want email, or keep everything else inside the portal.</p>
            {[
              ['community_mode', 'General Messenger posts', 'Questions, photos, and neighbor conversation'],
              ['replies_mode', 'Replies to my posts', 'When someone responds directly to you'],
              ['official_mode', 'Official Bur Oaks posts', 'Updates posted by the Bur Oaks office'],
            ].map(([key, label, note]) => (
              <label className="campground-community-preference" key={key}><span><strong>{label}</strong><small>{note}</small></span><select value={preferences[key]} onChange={(event) => setPreferences((current: any) => ({ ...current, [key]: event.target.value }))}><option value="daily_summary">One daily email</option><option value="right_away">Email right away</option><option value="portal_only">Portal only</option></select></label>
            ))}
            <label className="campground-community-preference"><span><strong>Quiet hours</strong><small>Hold routine email from 9 PM until 8 AM</small></span><input type="checkbox" checked={preferences.quiet_hours_enabled} onChange={(event) => setPreferences((current: any) => ({ ...current, quiet_hours_enabled: event.target.checked }))} /></label>
            <div className="campground-community-choice-summary"><Bell size={16} /><span>General posts: <strong>{modeLabel(preferences.community_mode)}</strong></span></div>
            <button className="campground-community-primary" type="button" onClick={savePreferences} disabled={working === 'preferences'}>{working === 'preferences' ? 'Saving…' : 'Save my choices'}</button>
          </section>
        </div>
      )}
    </main>
  )
}
