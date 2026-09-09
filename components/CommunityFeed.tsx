'use client'

import { Bell, Camera, Check, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, RefreshCw, Send, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [tab, setTab] = useState<'all' | 'official' | 'mine'>('all')
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [official, setOfficial] = useState(adminMode)
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
    setPreferences(result.preferences || null)
    setReports(result.reports || [])
    setLoading(false)
    const unreadIds = (result.posts || []).filter((post: any) => !post.read_by_me && post.status === 'published').map((post: any) => post.id)
    if (unreadIds.length || result.directCount) {
      fetch('/api/community-feed', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'mark_read', postIds: unreadIds }) }).catch(() => {})
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
      await communityAction({ action: 'create_post', requestId: postRequestId.current, body: draft, photoPath, isOfficial: adminMode && official, commentsEnabled })
      setDraft('')
      postRequestId.current = ''
      choosePhoto()
      setShowComposer(false)
      setNotice(adminMode && official ? 'The official Community post is live.' : 'Your post is now in the Community.')
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

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (tab === 'official') return post.is_official
    if (tab === 'mine') return String(post.camper_id) === String(viewer?.id)
    return true
  }), [posts, tab, viewer])

  return (
    <main className={`campground-community-page${adminMode ? ' admin-community-page' : ''}`}>
      <section className="campground-community-hero">
        <div className="campground-community-hero-icon"><UsersRound size={30} /></div>
        <div>
          <span>{adminMode ? 'COMMUNITY MODERATION' : 'BUR OAKS COMMUNITY'}</span>
          <h1>{adminMode ? 'Keep campground conversation friendly and useful.' : 'The campground conversation, all in one calm place.'}</h1>
          <p>{adminMode ? 'Post official news, join conversations, and review anything campers report.' : 'Share updates, photos, questions, and friendly conversation with your Bur Oaks neighbors.'}</p>
        </div>
        <button className="campground-community-settings" type="button" onClick={() => setShowSettings(true)}><Bell size={18} /> Alerts</button>
      </section>

      <section className="campground-community-calm"><ShieldCheck size={18} /><div><strong>No constant community texts.</strong><span>Conversation uses portal badges and your email choices. Emergency text alerts stay separate.</span></div></section>
      {notice && <p className="campground-community-notice" role="status">{notice}</p>}

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
            <strong>{adminMode ? 'Share an official update or join the conversation…' : 'Share something with the campground…'}</strong>
            <Camera size={19} />
          </button>

          {loading ? <div className="campground-community-empty">Opening the Community…</div> : visiblePosts.length === 0 ? (
            <div className="campground-community-empty"><UsersRound size={28} /><strong>No posts in this view yet.</strong><span>Start the conversation with a friendly update or question.</span></div>
          ) : visiblePosts.map((post) => (
            <article className={`campground-community-post${post.is_official ? ' official' : ''}${post.status === 'hidden' ? ' hidden' : ''}`} id={`community-post-${post.id}`} key={post.id}>
              <header>
                <span className="campground-community-avatar">{String(post.author_name || 'BO').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
                <div><strong>{post.author_name}</strong>{post.is_official && <b>OFFICIAL</b>}<small>{post.lot_number ? `Lot ${post.lot_number} · ` : ''}{formatDate(post.created_at)}</small></div>
                {adminMode ? <button type="button" className="campground-community-menu" onClick={() => moderate('post', post.id, post.status === 'hidden' ? 'published' : 'hidden')} disabled={working === `moderate:${post.id}`}>{post.status === 'hidden' ? 'Restore' : 'Hide'}</button> : <button type="button" className="campground-community-menu" onClick={() => reportPost(post.id)} aria-label="Report post"><MoreHorizontal size={19} /></button>}
              </header>
              {post.status === 'hidden' && <em className="campground-community-hidden-label">Hidden from campers</em>}
              <p>{post.body}</p>
              {post.photo_url && <img className="campground-community-photo" src={post.photo_url} alt={`Shared by ${post.author_name}`} />}
              <div className="campground-community-actions">
                <button type="button" className={post.liked_by_me ? 'liked' : ''} onClick={() => toggleLike(post)}><Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /> {post.liked_by_me ? 'Liked' : 'Like'} <span>{post.reaction_count || ''}</span></button>
                <span><MessageCircle size={17} /> {(post.comments || []).filter((comment: any) => comment.status !== 'hidden').length} comment{(post.comments || []).filter((comment: any) => comment.status !== 'hidden').length === 1 ? '' : 's'}</span>
              </div>
              {(post.comments || []).map((comment: any) => (
                <div className={`campground-community-comment${comment.status === 'hidden' ? ' hidden' : ''}`} key={comment.id}>
                  <span>{String(comment.author_name || 'BO').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2)}</span>
                  <div><strong>{comment.author_name}</strong><small>{comment.lot_number ? `Lot ${comment.lot_number} · ` : ''}{formatDate(comment.created_at)}</small><p>{comment.body}</p></div>
                  {adminMode && <button type="button" onClick={() => moderate('comment', comment.id, comment.status === 'hidden' ? 'published' : 'hidden')}>{comment.status === 'hidden' ? 'Restore' : 'Hide'}</button>}
                </div>
              ))}
              {post.comments_enabled && post.status !== 'hidden' && (
                <div className="campground-community-comment-box">
                  <input value={commentDrafts[post.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addComment(post) }} placeholder="Write a friendly comment…" aria-label={`Comment on ${post.author_name}'s post`} />
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
            <header><div><small>{adminMode ? 'COMMUNITY OR OFFICIAL' : 'NEW COMMUNITY POST'}</small><h2>Create a post</h2></div><button type="button" onClick={() => setShowComposer(false)} aria-label="Close"><X size={19} /></button></header>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} maxLength={2000} placeholder="What would you like the campground to know?" autoFocus />
            {photoPreview && <div className="campground-community-photo-preview"><img src={photoPreview} alt="Selected upload preview" /><button type="button" onClick={() => choosePhoto()}><X size={16} /> Remove</button></div>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
            <div className="campground-community-compose-options">
              <button type="button" onClick={() => fileRef.current?.click()}><ImageIcon size={17} /> Add photo</button>
              <label><input type="checkbox" checked={commentsEnabled} onChange={(event) => setCommentsEnabled(event.target.checked)} /> Allow comments</label>
              {adminMode && <label><input type="checkbox" checked={official} onChange={(event) => setOfficial(event.target.checked)} /> Official office post</label>}
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
