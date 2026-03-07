'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { MoodType } from '@/lib/constants'
import { getTodayIST, getISTDate } from '@/lib/utils'

import { sendNotification } from '@/lib/actions/notifications'

// ...

export async function submitMood(mood: MoodType, note?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Get couple and partner info correctly
  const { data: profile } = await supabase
    .from('profiles')
    .select('couple_id, display_name')
    .eq('id', user.id)
    .single()

  if (!profile?.couple_id) {
    return { error: 'You need to be paired with a partner first' }
  }

  /*
   * FIX: Use IST time to calculate mood_date
   */
  const todayStr = getTodayIST()

  const { error } = await supabase
    .from('moods')
    .insert({
      user_id: user.id,
      couple_id: profile.couple_id,
      emoji: mood,
      mood_text: note || null,
      mood_date: todayStr
    })

  if (error) {
    return { error: error.message }
  }

  // Surgical Cache Invalidation
  revalidateTag(`dashboard-${user.id}`, 'default')

  // Calculate Partner ID from Couples Table
  const { data: couple } = await supabase
    .from('couples')
    .select('user1_id, user2_id')
    .eq('id', profile.couple_id)
    .single()

  if (couple) {
    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id

    if (partnerId) {
      revalidateTag(`dashboard-${partnerId}`, 'default')
      await sendNotification({
        recipientId: partnerId,
        actorId: user.id,
        type: 'mood',
        title: 'New Mood Log',
        message: `${profile.display_name || 'Your partner'} is feeling ${mood} ${note ? 'with a note' : ''}`,
        actionUrl: '/dashboard'
      })
    }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function getTodayMoods() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', user.id)
    .single()

  if (!profile?.couple_id) return null

  /* 
   * We need to find what "today" means in India.
   */
  const istDate = getISTDate()

  // Set to beginning of the day in IST (Nominal 00:00)
  const todayStart = new Date(istDate)
  todayStart.setHours(0, 0, 0, 0)

  // Convert Nominal IST 00:00 to True UTC Timestamp
  // 00:00 IST is 18:30 UTC previous day (minus 5.5 hours)
  // Since todayStart is a Date object representing 00:00 UTC (because server is UTC),
  // we just need to subtract 5.5 hours to get the UTC timestamp that equals IST Midnight.
  todayStart.setHours(todayStart.getHours() - 5)
  todayStart.setMinutes(todayStart.getMinutes() - 30)

  const { data: moods } = await supabase
    .from('moods')
    .select('*, mood:emoji, note:mood_text, profiles(display_name, avatar_url)')
    .eq('couple_id', profile.couple_id)
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })

  return moods
}

export async function getMoodHistory(days: number = 7) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', user.id)
    .single()

  if (!profile?.couple_id) return null

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data: moods } = await supabase
    .from('moods')
    .select('*, mood:emoji, note:mood_text, profiles(display_name, avatar_url)')
    .eq('couple_id', profile.couple_id)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })

  return moods
}
