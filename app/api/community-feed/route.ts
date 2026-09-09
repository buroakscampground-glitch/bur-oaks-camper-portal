import { after, NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canAdministerCommunity, canManageCommunity } from '../../../lib/staff-roles'
import { isOperationalCamper } from '../../../lib/camper-records'
import { canParticipateInCommunity, canViewCommunity, communityAccessLabel, normalizeCommunityAccess } from '../../../lib/community-access'
import {
  camperCommunityEmails,
  defaultCommunityPreferences,
  normalizeCommunityMode,
  sendCommunityEmail,
} from '../../../lib/community-notifications'

export const dynamic = 'force-dynamic'

function camperName(camper: any) {
  return [camper?.first_name, camper?.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || 'Bur Oaks Camper'
}

function published(value: any) {
  return String(value?.status || 'published') === 'published'
}

async function authenticated(request: Request) {
  const context = await getAuthenticatedContext(request)
  return context && String(context.camper.role || '').toLowerCase() !== 'maintenance' ? context : null
}

async function signedPhotoUrl(admin: any, path: unknown) {
  const photoPath = String(path || '').trim()
  if (!photoPath) return null
  const { data } = await admin.storage.from('community-media').createSignedUrl(photoPath, 60 * 60)
  return data?.signedUrl || null
}

export async function GET(request: Request) {
  const context = await authenticated(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const url = new URL(request.url)
  const isManager = canManageCommunity(context.camper.role)
  const summaryOnly = url.searchParams.get('mode') === 'summary'
  const camperId = String(context.camper.id)
  const isCommunityAdmin = canAdministerCommunity(context.camper.role)
  const { data: memberControl, error: controlError } = await context.admin
    .from('community_member_controls')
    .select('access_level,reason')
    .eq('camper_id', camperId)
    .maybeSingle()
  if (controlError) return NextResponse.json({ error: controlError.message }, { status: 500 })
  const accessLevel = isManager ? 'active' : normalizeCommunityAccess(memberControl?.access_level)

  if (!isManager && !canViewCommunity(accessLevel)) {
    return NextResponse.json({
      blocked: true,
      unreadCount: 0,
      directCount: 0,
      reason: memberControl?.reason || 'The office has paused this account’s Community access.',
      viewer: { id: camperId, name: camperName(context.camper), lotNumber: context.camper.lot_number || '', canManage: false, canDelete: false, accessLevel },
    })
  }

  let postQuery = context.admin
    .from('community_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(summaryOnly ? 200 : 60)
  if (!isManager) postQuery = postQuery.eq('status', 'published')

  const { data: posts, error: postError } = await postQuery
  if (postError) return NextResponse.json({ error: postError.message }, { status: 500 })

  const postIds = (posts || []).map((post: any) => post.id)
  const { data: readRows, error: readError } = postIds.length
    ? await context.admin.from('community_reads').select('post_id').eq('camper_id', camperId).in('post_id', postIds)
    : { data: [], error: null }
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  const readIds = new Set((readRows || []).map((row: any) => String(row.post_id)))

  const { count: directCount, error: directError } = await context.admin
    .from('community_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('camper_id', camperId)
    .is('read_at', null)
  if (directError) return NextResponse.json({ error: directError.message }, { status: 500 })

  const unreadPostCount = (posts || []).filter((post: any) => published(post) && !readIds.has(String(post.id))).length
  if (summaryOnly) {
    return NextResponse.json({ unreadCount: unreadPostCount, directCount: directCount || 0 })
  }

  const [{ data: comments, error: commentError }, { data: reactions, error: reactionError }, { data: preferences, error: preferenceError }] = await Promise.all([
    postIds.length
      ? context.admin.from('community_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    postIds.length
      ? context.admin.from('community_reactions').select('post_id,camper_id').in('post_id', postIds)
      : Promise.resolve({ data: [], error: null }),
    context.admin.from('community_notification_preferences').select('*').eq('camper_id', camperId).maybeSingle(),
  ])
  if (commentError || reactionError || preferenceError) {
    return NextResponse.json({ error: commentError?.message || reactionError?.message || preferenceError?.message }, { status: 500 })
  }

  const reportResult = isManager
    ? await context.admin.from('community_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100)
    : { data: [], error: null }
  if (reportResult.error) return NextResponse.json({ error: reportResult.error.message }, { status: 500 })

  const memberResult = isCommunityAdmin
    ? await context.admin.from('campers').select('id,first_name,last_name,lot_number,active,role').eq('active', true).order('lot_number', { ascending: true })
    : { data: [], error: null }
  const controlsResult = isCommunityAdmin
    ? await context.admin.from('community_member_controls').select('*').order('updated_at', { ascending: false })
    : { data: [], error: null }
  if (memberResult.error || controlsResult.error) return NextResponse.json({ error: memberResult.error?.message || controlsResult.error?.message }, { status: 500 })
  const members = (memberResult.data || []).filter(isOperationalCamper).map((camper: any) => {
    const control = (controlsResult.data || []).find((item: any) => String(item.camper_id) === String(camper.id))
    return { id: camper.id, name: camperName(camper), lotNumber: camper.lot_number || '', accessLevel: normalizeCommunityAccess(control?.access_level), reason: control?.reason || '', updatedAt: control?.updated_at || null }
  })

  const visibleComments = (comments || []).filter((comment: any) => isManager || published(comment))
  const enrichedPosts = await Promise.all((posts || []).map(async (post: any) => ({
    ...post,
    photo_url: await signedPhotoUrl(context.admin, post.photo_path),
    comments: visibleComments.filter((comment: any) => String(comment.post_id) === String(post.id)),
    reaction_count: (reactions || []).filter((reaction: any) => String(reaction.post_id) === String(post.id)).length,
    liked_by_me: (reactions || []).some((reaction: any) => String(reaction.post_id) === String(post.id) && String(reaction.camper_id) === camperId),
    read_by_me: readIds.has(String(post.id)),
  })))

  return NextResponse.json({
    posts: enrichedPosts,
    preferences: { ...defaultCommunityPreferences, ...(preferences || {}) },
    unreadCount: unreadPostCount,
    directCount: directCount || 0,
    reports: reportResult.data || [],
    members,
    viewer: {
      id: camperId,
      name: camperName(context.camper),
      lotNumber: context.camper.lot_number || '',
      canManage: isManager,
      canDelete: isCommunityAdmin,
      accessLevel,
      canParticipate: canParticipateInCommunity(accessLevel),
    },
  })
}

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, 'community-feed', 60, 10 * 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many community changes. Please wait and try again.' }, { status: 429 })
  const context = await authenticated(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const camperId = String(context.camper.id)
  const isManager = canManageCommunity(context.camper.role)
  const isCommunityAdmin = canAdministerCommunity(context.camper.role)
  const { data: memberControl, error: controlError } = await context.admin.from('community_member_controls').select('access_level,reason').eq('camper_id', camperId).maybeSingle()
  if (controlError) return NextResponse.json({ error: controlError.message }, { status: 500 })
  const accessLevel = isManager ? 'active' : normalizeCommunityAccess(memberControl?.access_level)
  if (!isManager && !canViewCommunity(accessLevel)) return NextResponse.json({ error: memberControl?.reason || 'The office has paused this account’s Community access.' }, { status: 403 })

  if (action === 'create_post') {
    if (!canParticipateInCommunity(accessLevel)) return NextResponse.json({ error: `Your Community access is ${communityAccessLabel(accessLevel).toLowerCase()}. Contact the office if you have questions.` }, { status: 403 })
    const text = String(body.body || '').trim().slice(0, 2000)
    const requestedPhotoPath = String(body.photoPath || '').trim()
    const photoPath = requestedPhotoPath.startsWith(`${camperId}/`) ? requestedPhotoPath : null
    if (!text && !photoPath) return NextResponse.json({ error: 'Write a message or add a photo first.' }, { status: 400 })
    const requestId = String(body.requestId || '').trim().slice(0, 100) || null
    if (requestId) {
      const { data: existing } = await context.admin.from('community_posts').select('*').eq('request_id', requestId).maybeSingle()
      if (existing) return NextResponse.json({ success: true, duplicate: true, post: existing })
    }
    const { data: post, error } = await context.admin.from('community_posts').insert({
      camper_id: camperId,
      author_name: isCommunityAdmin ? 'Bur Oaks Campground' : camperName(context.camper),
      lot_number: isCommunityAdmin ? null : context.camper.lot_number || null,
      body: text || 'Shared a campground photo.',
      photo_path: photoPath,
      is_official: isCommunityAdmin || (isManager && body.isOfficial === true),
      comments_enabled: body.commentsEnabled !== false,
      request_id: requestId,
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (post.is_official) {
      const { data: campers } = await context.admin.from('campers').select('id,lot_number,role').eq('active', true)
      const notifications = (campers || [])
        .filter((camper: any) => isOperationalCamper(camper) && String(camper.id) !== camperId)
        .map((camper: any) => ({ camper_id: camper.id, post_id: post.id, kind: 'official', message: `New official Community post: ${text.slice(0, 120)}` }))
      if (notifications.length) {
        const { data: createdNotifications } = await context.admin.from('community_notifications').insert(notifications).select('id,camper_id')
        after(async () => {
          const rows = createdNotifications || []
          const notifiedEmails = new Set<string>()
          const camperIds = rows.map((row: any) => row.camper_id)
          if (!camperIds.length) return
          const [{ data: recipients }, { data: preferences }] = await Promise.all([
            context.admin.from('campers').select('id,first_name,last_name,email,secondary_email').in('id', camperIds),
            context.admin.from('community_notification_preferences').select('camper_id,official_mode').in('camper_id', camperIds),
          ])
          for (let index = 0; index < rows.length; index += 8) {
            await Promise.all(rows.slice(index, index + 8).map(async (notification: any) => {
              const owner = (recipients || []).find((camper: any) => String(camper.id) === String(notification.camper_id))
              const preference = (preferences || []).find((item: any) => String(item.camper_id) === String(notification.camper_id))
              const email = camperCommunityEmails(owner).find((value) => !notifiedEmails.has(value))
              if (!owner || !email || normalizeCommunityMode(preference?.official_mode || 'right_away') !== 'right_away') {
                await context.admin.from('community_notifications').update({ email_status: 'skipped' }).eq('id', notification.id)
                return
              }
              notifiedEmails.add(email)
              try {
                const result: any = await sendCommunityEmail({
                  to: [email],
                  camperName: camperName(owner),
                  subject: 'New official post from Bur Oaks',
                  heading: 'New official Community post',
                  message: text.slice(0, 500),
                  actionUrl: `${new URL(request.url).origin}/campground-community?post=${encodeURIComponent(post.id)}`,
                })
                await context.admin.from('community_notifications').update({ email_status: result?.skipped ? 'skipped' : 'sent', email_provider_id: result?.id || null, email_sent_at: result?.skipped ? null : new Date().toISOString(), email_error: result?.reason || null }).eq('id', notification.id)
              } catch (emailError: any) {
                await context.admin.from('community_notifications').update({ email_status: 'failed', email_error: String(emailError?.message || emailError).slice(0, 500) }).eq('id', notification.id)
              }
            }))
          }
        })
      }
    }
    return NextResponse.json({ success: true, post })
  }

  if (action === 'create_comment') {
    if (!canParticipateInCommunity(accessLevel)) return NextResponse.json({ error: `Your Community access is ${communityAccessLabel(accessLevel).toLowerCase()}. Contact the office if you have questions.` }, { status: 403 })
    const postId = String(body.postId || '')
    const text = String(body.body || '').trim().slice(0, 800)
    if (!postId || !text) return NextResponse.json({ error: 'Write a comment first.' }, { status: 400 })
    const { data: post, error: postError } = await context.admin.from('community_posts').select('*').eq('id', postId).maybeSingle()
    if (postError || !post || !published(post) || !post.comments_enabled) return NextResponse.json({ error: 'Comments are not available on this post.' }, { status: 400 })
    const replyAuthor = isCommunityAdmin ? 'Bur Oaks Campground' : camperName(context.camper)
    const { data: comment, error } = await context.admin.from('community_comments').insert({
      post_id: postId,
      camper_id: camperId,
      author_name: replyAuthor,
      lot_number: isCommunityAdmin ? null : context.camper.lot_number || null,
      body: text,
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (String(post.camper_id) !== camperId) {
      const { data: replyNotification } = await context.admin.from('community_notifications').insert({
        camper_id: post.camper_id,
        post_id: postId,
        comment_id: comment.id,
        kind: 'reply',
        message: `${replyAuthor} replied to your Community post.`,
      }).select('id').single()

      const [{ data: owner }, { data: preference }] = await Promise.all([
        context.admin.from('campers').select('first_name,last_name,email,secondary_email').eq('id', post.camper_id).maybeSingle(),
        context.admin.from('community_notification_preferences').select('replies_mode').eq('camper_id', post.camper_id).maybeSingle(),
      ])
      if (owner && normalizeCommunityMode(preference?.replies_mode || 'right_away') === 'right_away') {
        const origin = new URL(request.url).origin
        after(async () => {
          try {
            const result: any = await sendCommunityEmail({
              to: camperCommunityEmails(owner).slice(0, 1),
              camperName: camperName(owner),
              subject: `${replyAuthor} replied to your Bur Oaks post`,
              heading: 'Someone replied to you',
              message: `${replyAuthor} commented: “${text.slice(0, 240)}”`,
              actionUrl: `${origin}/campground-community?post=${encodeURIComponent(postId)}`,
            })
            if (replyNotification?.id) await context.admin.from('community_notifications').update({ email_status: result?.skipped ? 'skipped' : 'sent', email_provider_id: result?.id || null, email_sent_at: result?.skipped ? null : new Date().toISOString(), email_error: result?.reason || null }).eq('id', replyNotification.id)
          } catch (emailError: any) {
            console.error('Community reply email failed:', emailError)
            if (replyNotification?.id) await context.admin.from('community_notifications').update({ email_status: 'failed', email_error: String(emailError?.message || emailError).slice(0, 500) }).eq('id', replyNotification.id)
          }
        })
      } else if (replyNotification?.id) {
        await context.admin.from('community_notifications').update({ email_status: 'skipped' }).eq('id', replyNotification.id)
      }
    }
    return NextResponse.json({ success: true, comment })
  }

  if (action === 'toggle_reaction') {
    const postId = String(body.postId || '')
    if (!postId) return NextResponse.json({ error: 'Choose a post.' }, { status: 400 })
    const { data: existing, error: lookupError } = await context.admin.from('community_reactions').select('id').eq('post_id', postId).eq('camper_id', camperId).maybeSingle()
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    const result = existing
      ? await context.admin.from('community_reactions').delete().eq('id', existing.id)
      : await context.admin.from('community_reactions').insert({ post_id: postId, camper_id: camperId })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
    return NextResponse.json({ success: true, liked: !existing })
  }

  if (action === 'mark_read') {
    const postIds = Array.from(new Set((Array.isArray(body.postIds) ? body.postIds : []).map((id: unknown) => String(id || '')).filter(Boolean))).slice(0, 100)
    if (postIds.length) {
      const { error } = await context.admin.from('community_reads').upsert(postIds.map((postId) => ({ post_id: postId, camper_id: camperId, read_at: new Date().toISOString() })), { onConflict: 'post_id,camper_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await context.admin.from('community_notifications').update({ read_at: new Date().toISOString() }).eq('camper_id', camperId).is('read_at', null)
    return NextResponse.json({ success: true })
  }

  if (action === 'save_preferences') {
    const preferences = {
      camper_id: camperId,
      community_mode: normalizeCommunityMode(body.communityMode),
      replies_mode: normalizeCommunityMode(body.repliesMode),
      official_mode: normalizeCommunityMode(body.officialMode),
      quiet_hours_enabled: body.quietHoursEnabled !== false,
      updated_at: new Date().toISOString(),
    }
    const { error } = await context.admin.from('community_notification_preferences').upsert(preferences, { onConflict: 'camper_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, preferences })
  }

  if (action === 'report') {
    const postId = String(body.postId || '') || null
    const commentId = String(body.commentId || '') || null
    if (!postId && !commentId) return NextResponse.json({ error: 'Choose something to report.' }, { status: 400 })
    const { error } = await context.admin.from('community_reports').insert({
      reporter_camper_id: camperId,
      post_id: postId,
      comment_id: commentId,
      reason: String(body.reason || 'Please review this content.').trim().slice(0, 300),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'delete_content' && isCommunityAdmin) {
    const contentType = body.contentType === 'comment' ? 'comment' : 'post'
    const table = contentType === 'comment' ? 'community_comments' : 'community_posts'
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Choose content to delete.' }, { status: 400 })
    const { data: content, error: lookupError } = await context.admin.from(table).select('*').eq('id', id).maybeSingle()
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (!content) return NextResponse.json({ success: true, alreadyDeleted: true })
    const { error: logError } = await context.admin.from('community_moderation_log').insert({
      admin_camper_id: camperId,
      action: contentType === 'comment' ? 'delete_comment' : 'delete_post',
      target_camper_id: content.camper_id || null,
      post_id: contentType === 'post' ? id : content.post_id || null,
      comment_id: contentType === 'comment' ? id : null,
      reason: String(body.reason || 'Deleted by campground administrator.').trim().slice(0, 300),
      content_snapshot: content,
    })
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })
    const { error } = await context.admin.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'set_member_access' && isCommunityAdmin) {
    const targetCamperId = String(body.camperId || '')
    const nextAccess = normalizeCommunityAccess(body.accessLevel)
    const reason = String(body.reason || '').trim().slice(0, 300) || null
    if (!targetCamperId || targetCamperId === camperId) return NextResponse.json({ error: 'Choose a camper account other than your administrator account.' }, { status: 400 })
    const { data: target } = await context.admin.from('campers').select('id,role,lot_number').eq('id', targetCamperId).maybeSingle()
    if (!target || !isOperationalCamper(target)) return NextResponse.json({ error: 'That camper account cannot be changed here.' }, { status: 400 })
    const { error } = await context.admin.from('community_member_controls').upsert({ camper_id: targetCamperId, access_level: nextAccess, reason, controlled_by: camperId, updated_at: new Date().toISOString() }, { onConflict: 'camper_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await context.admin.from('community_moderation_log').insert({ admin_camper_id: camperId, action: nextAccess === 'blocked' ? 'set_blocked' : nextAccess === 'read_only' ? 'set_read_only' : 'set_active', target_camper_id: targetCamperId, reason })
    return NextResponse.json({ success: true, accessLevel: nextAccess })
  }

  if (action === 'moderate' && isManager) {
    const contentType = body.contentType === 'comment' ? 'community_comments' : 'community_posts'
    const id = String(body.id || '')
    const status = body.status === 'published' ? 'published' : 'hidden'
    if (!id) return NextResponse.json({ error: 'Choose content to update.' }, { status: 400 })
    const { error } = await context.admin.from(contentType).update({ status }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await context.admin.from('community_moderation_log').insert({ admin_camper_id: camperId, action: status === 'published' ? 'restore' : 'hide', post_id: contentType === 'community_posts' ? id : null, comment_id: contentType === 'community_comments' ? id : null, reason: String(body.reason || '').trim().slice(0, 300) || null })
    if (body.reportId) await context.admin.from('community_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', body.reportId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'That Community action is not available.' }, { status: 400 })
}
