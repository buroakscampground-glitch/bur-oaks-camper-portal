import { notFound, redirect } from 'next/navigation'

export default async function CommunityPostShortcut({ params }: { params: Promise<{ post: string }> }) {
  const { post } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(post)) notFound()
  redirect(`/campground-community?post=${encodeURIComponent(post)}`)
}
