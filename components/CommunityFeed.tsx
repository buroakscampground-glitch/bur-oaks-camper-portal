'use client'

import { Ban, Bell, Camera, Check, Eye, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, RefreshCw, Send, ShieldCheck, Trash2, UserCheck, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { communityPostAuthor, communityPostLocation } from '../lib/community-branding'
import { supabase } from '../lib/supabase'

type FeedProps = { adminMode?: boolean }

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
  const [showMemberControls, setShowMemberControls] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [tab, setTab] = useState<'all' | 'official' | 'mine'>('all')
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [showComposer, setShowComposer] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const postRequestId = useRef('')

  useEffect(() => { loadFeed() }, [])
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

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
      setNotice(result.error || 'The Community could not be opened.')
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
    const unreadIds = (result.posts || []).filter((post: any) => !post.read_by_me && post.status === 'published').map((post: any) => post.id)
    if (unreadIds.length || result.directCount) {
      fetch('/api/community-feed', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'mark_read', postIds: unreadIds }) })
        .then(() => window.dispatchEvent(new Event('community-unread-changed')))
        .catch(() => {})
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
      await communityAction({ action: 'create_post', requestId: postRequestId.current, body: draft, photoPath, commentsEnabled })
      setDraft('')
      postRequestId.current = ''
      choosePhoto()
      setShowComposer(false)
      setNotice(viewer?.canPostOfficial ? 'The official Bur Oaks Community post is live.' : `${viewer?.postingName || 'Your'} post is now in the Community.`)
      await loadFeed(true)
    } catch (error: any) {
      setNotice(error.message)
    }
    setWorking('')
  }

  async function toggleLike(post: any) {
    const liked = !post.liked_by_me
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked_by_me: liked, reaction_count: Math.max(0, Number(item.reaction_count || 0) + (liked ? 1 : -1)) } : item))
    try { await communityAction({ action: 'toggle_reaction', postId: post.id }) }
    catch { setPosts((current) => current.map((item) => item.id === post.id ? post : item)) }
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
      setNotice('Your Community notification choices are saved.')
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
  }), [posts, tab, viewer])
  const filteredMembers = useMemo(() => members.filter((member) => `${member.name} ${member.lotNumber}`.toLowerCase().includes(memberSearch.trim().toLowerCase())), [members, memberSearch])

  if (!loading && blocked) {
    return (
      <main className="campground-community-page">
        <section className="campground-community-blocked"><Ban size={34} /><small>COMMUNITY ACCESS PAUSED</small><h1>The Community is not available for this account.</h1><p>{blockReason || 'Please contact the Bur Oaks office if you have questions.'}</p><a href="/portal">Return to Portal Home</a></section>
      </main>
    )
  }

  return (
    <main className={`campground-community-page${adminMode ? ' admin-community-page' : ''}`}>
      <section className="campground-community-hero">
        <div className="campground-community-hero-icon"><UsersRound size={30} /></div>
        <div>
          <span>{adminMode ? 'COMMUNITY MODERATION' : 'BUR OAKS COMMUNITY'}</span>
          <h1>{adminMode ? 'Keep campground conversation friendly and useful.' : 'The campground conversation, all in one calm place.'}</h1>
          <p>{adminMode ? viewer?.canPostOfficial ? 'Post official news, join conversations, and review anything campers report.' : `Post as ${viewer?.postingName || 'yourself'}, join conversations, and use the same Community moderation controls as the office.` : 'Share updates, photos, questions, and friendly conversation with your Bur Oaks neighbors.'}</p>
        </div>
        <button className="campground-community-settings" type="button" onClick={() => setShowSettings(true)}><Bell size={18} /> Alerts</button>
      </section>

      <section className="campground-community-calm"><ShieldCheck size={18} /><div><strong>No constant community texts.</strong><span>Conversation uses portal badges and your email choices. Emergency text alerts stay separate.</span></div></section>
      {notice && <p className="campground-community-notice" role="status">{notice}</p>}

      {adminMode && activityNotifications.length > 0 && (
        <section className="campground-community-staff-activity">
          <header><Bell size={19} /><div><small>STAFF ALERTS</small><h2>Recent Community activity</h2><p>Rachel and administrator accounts see activity here, with routine items collected into the daily email.</p></div></header>
          <div>{activityNotifications.slice(0, 10).map((item) => (
            <a href={item.post_id ? `#community-post-${item.post_id}` : undefined} key={item.id}>
              <span>{item.message}</span>
              <small>{formatDate(item.created_at)} · {item.email_status === 'sent' ? 'Email sent' : item.email_status === 'failed' ? 'Email needs attention' : 'Portal alert saved'}</small>
            </a>
          ))}</div>
        </section>
      )}

      {adminMode && viewer?.canDelete && (
        <section className="campground-community-owner-controls">
          <button type="button" onClick={() => setShowMemberControls((open) => !open)}><ShieldCheck size={18} /><span><small>OWNER CONTROL</small><strong>Manage camper access</strong></span><b>{members.filter((member) => member.accessLevel !== 'active').length} restricted</b></button>
          {showMemberControls && (
            <div className="campground-community-members">
              <header><div><small>COMMUNITY MEMBERS</small><h2>Block, restrict, or restore access</h2><p>These controls affect only Community posts and comments—not billing or the rest of the portal.</p></div><button type="button" onClick={() => setShowMemberControls(false)} aria-label="Close member controls"><X size={18} /></button></header>
              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search camper or lot…" aria-label="Search Community members" />
              <div className="campground-community-member-list">
                {filteredMembers.map((member) => (
                  <article className={member.accessLevel} key={member.id}><div><strong>{member.name}</strong><small>Lot {member.lotNumber} · {member.accessLevel === 'blocked' ? 'Blocked' : member.accessLevel === 'read_only' ? 'Read-only' : 'Active'}</small></div><div><button type="button" className={member.accessLevel === 'active' ? 'selected' : ''} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'active')}><UserCheck size={14} /> Active</button><button type="button" className={member.accessLevel === 'read_only' ? 'selected' : ''} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'read_only')}><Eye size={14} /> Read-only</button><button type="button" className={member.accessLevel === 'blocked' ? 'selected danger' : 'danger'} disabled={working === `member:${member.id}`} onClick={() => setMemberAccess(member, 'blocked')}><Ban size={14} /> Block</button></div></article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {adminMode && reports.length > 0 && (
        <section className="campground-community-review">
          <header><div><small>NEEDS REVIEW</small><h2>{reports.length} reported item{reports.length === 1 ? '' : 's'}</h2></div></header>
          {reports.map((report) => (
            <article key={report.id}><span>{report.reason}</span><div><button type="button" onClick={() => moderate(report.comment_id ? 'comment' : 'post', report.comment_id || report.post_id, 'hidden', report.id)}>Hide item</button><button type="button" onClick={() => moderate(report.comment_id ? 'comment' : 'post', report.comment_id || report.post_id, 'published', report.id)}>Leave visible</button></div></article>
          ))}
        </section>
      )}

      <section className="campground-community-toolbar">
        <div role="tablist" aria-label="Community feed views">
          <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Community</button>
          <button type="button" className={tab === 'official' ? 'active' : ''} onClick={() => setTab('official')}>Official only</button>
          <button type="button" className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My posts</button>
        </div>
        <button type="button" className="campground-community-refresh" onClick={() => loadFeed(true)} aria-label="Refresh Community"><RefreshCw size={17} /></button>
      </section>

      <section className="campground-community-layout">
        <div className="campground-community-feed">
          <button className="campground-community-compose-open" type="button" onClick={() => setShowComposer(true)}>
            <span>{String(viewer?.name || 'You').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
            <strong>{adminMode ? viewer?.canPostOfficial ? 'Share an official update or join the conversation…' : `Share as ${viewer?.postingName || 'yourself'} or join the conversation…` : 'Share something with the campground…'}</strong>
            <Camera size={19} />
          </button>

          {loading ? <div className="campground-community-empty">Opening the Community…</div> : visiblePosts.length === 0 ? (
            <div className="campground-community-empty"><UsersRound size={28} /><strong>No posts in this view yet.</strong><span>Start the conversation with a friendly update or question.</span></div>
          ) : visiblePosts.map((post) => (
            <article className={`campground-community-post${post.is_official ? ' official' : ''}${post.status === 'hidden' ? ' hidden' : ''}`} id={`community-post-${post.id}`} key={post.id}>
              <header>
                {post.is_official ? <span className="campground-community-avatar official"><img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" /></span> : <span className="campground-community-avatar">{communityPostAuthor(post).split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>}
                <div><strong>{communityPostAuthor(post)}</strong>{post.is_official && <b>OFFICIAL BUR OAKS POST</b>}<small>{communityPostLocation(post) ? `${communityPostLocation(post)} · ` : ''}{formatDate(post.created_at)}</small></div>
                {adminMode ? <div className="campground-community-admin-actions"><button type="button" onClick={() => moderate('post', post.id, post.status === 'hidden' ? 'published' : 'hidden')} disabled={working === `moderate:${post.id}`}>{post.status === 'hidden' ? 'Restore' : 'Hide'}</button>{viewer?.canDelete && <>{String(post.camper_id) !== String(viewer.id) && <button type="button" onClick={() => setMemberAccess({ id: post.camper_id, name: post.author_name, lotNumber: post.lot_number }, 'blocked')}><Ban size={14} /> Block</button>}<button className="danger" type="button" onClick={() => deleteContent('post', post.id)} disabled={working === `delete:${post.id}`}><Trash2 size={14} /> Delete</button></>}</div> : <button type="button" className="campground-community-menu" onClick={() => reportPost(post.id)} aria-label="Report post"><MoreHorizontal size={19} /></button>}
              </header>
              {post.status === 'hidden' && <em className="campground-community-hidden-label">Hidden from campers</em>}
              <p>{post.body}</p>
              {post.photo_url && <img className="campground-community-photo" src={post.photo_url} alt={`Shared by ${communityPostAuthor(post)}`} />}
              <div className="campground-community-actions">
                <button type="button" className={post.liked_by_me ? 'liked' : ''} onClick={() => toggleLike(post)}><Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /> {post.liked_by_me ? 'Liked' : 'Like'} <span>{post.reaction_count || ''}</span></button>
                <span><MessageCircle size={17} /> {(post.comments || []).filter((comment: any) => comment.status !== 'hidden').length} comment{(post.comments || []).filter((comment: any) => comment.status !== 'hidden').length === 1 ? '' : 's'}</span>
              </div>
              {(post.comments || []).map((comment: any) => (
                <div className={`campground-community-comment${comment.status === 'hidden' ? ' hidden' : ''}`} key={comment.id}>
                  <span>{String(comment.author_name || 'BO').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
                  <div><strong>{comment.author_name}</strong><small>{comment.lot_number ? `Lot ${comment.lot_number} · ` : ''}{formatDate(comment.created_at)}</small><p>{comment.body}</p></div>
                  {adminMode && <div className="campground-community-comment-admin"><button type="button" onClick={() => moderate('comment', comment.id, comment.status === 'hidden' ? 'published' : 'hidden')}>{comment.status === 'hidden' ? 'Restore' : 'Hide'}</button>{viewer?.canDelete && <button className="danger" type="button" onClick={() => deleteContent('comment', comment.id)}><Trash2 size={12} /> Delete</button>}</div>}
                </div>
              ))}
              {post.comments_enabled && post.status !== 'hidden' && (
                <div className="campground-community-comment-box">
                  <input value={commentDrafts[post.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addComment(post) }} placeholder="Write a friendly comment…" aria-label={`Comment on ${communityPostAuthor(post)}'s post`} />
                  <button type="button" onClick={() => addComment(post)} disabled={working === `comment:${post.id}` || !String(commentDrafts[post.id] || '').trim()}><Send size={17} /></button>
                </div>
              )}
            </article>
          ))}
        </div>

        <aside className="campground-community-guide">
          <small>HOW ALERTS WORK</small>
          <h2>Stay connected without the buzzing.</h2>
          <ul><li><Check size={16} /> New activity appears as an unread badge.</li><li><Check size={16} /> General posts become one daily email.</li><li><Check size={16} /> Replies to your post may email you right away.</li><li><Check size={16} /> Routine notices pause during quiet hours.</li><li><Check size={16} /> Emergency texts remain separate.</li></ul>
          <button type="button" onClick={() => setShowSettings(true)}><Bell size={16} /> Choose my alerts</button>
        </aside>
      </section>

      {showComposer && (
        <div className="campground-community-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create Community post">
          <section className="campground-community-modal">
            <header><div><small>{viewer?.canPostOfficial ? 'OFFICIAL BUR OAKS POST' : adminMode ? `${viewer?.postingName || 'STAFF'} COMMUNITY POST` : 'NEW COMMUNITY POST'}</small><h2>Create a post</h2></div><button type="button" onClick={() => setShowComposer(false)} aria-label="Close"><X size={19} /></button></header>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} maxLength={2000} placeholder="What would you like the campground to know?" autoFocus />
            {photoPreview && <div className="campground-community-photo-preview"><img src={photoPreview} alt="Selected upload preview" /><button type="button" onClick={() => choosePhoto()}><X size={16} /> Remove</button></div>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
            <div className="campground-community-compose-options">
              <button type="button" onClick={() => fileRef.current?.click()}><ImageIcon size={17} /> Add photo</button>
              <label><input type="checkbox" checked={commentsEnabled} onChange={(event) => setCommentsEnabled(event.target.checked)} /> Allow comments</label>
              {adminMode && <span className="campground-community-official-compose-note"><ShieldCheck size={17} /> Campers will see this from {viewer?.canPostOfficial ? 'Bur Oaks Campground as an official post' : viewer?.postingName || 'this staff account'}</span>}
            </div>
            <button className="campground-community-primary" type="button" onClick={publishPost} disabled={working === 'post' || (!draft.trim() && !photo)}>{working === 'post' ? 'Posting…' : 'Post to the Community'}</button>
          </section>
        </div>
      )}

      {showSettings && preferences && (
        <div className="campground-community-modal-backdrop" role="dialog" aria-modal="true" aria-label="Community notification settings">
          <section className="campground-community-modal campground-community-preferences">
            <header><div><small>YOUR CHOICES</small><h2>Notification settings</h2></div><button type="button" onClick={() => setShowSettings(false)} aria-label="Close"><X size={19} /></button></header>
            <p>Community conversations never trigger routine text messages. Choose when you want an email, or keep everything inside the portal.</p>
            {[
              ['community_mode', 'General community posts', 'Questions, photos, and neighbor conversation'],
              ['replies_mode', 'Replies to my posts', 'When someone responds directly to you'],
              ['official_mode', 'Official Community posts', 'Updates posted by the Bur Oaks office'],
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
