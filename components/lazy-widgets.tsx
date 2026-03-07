import dynamic from 'next/dynamic'

export const StackedPolaroids = dynamic(() => import('@/components/stacked-polaroids').then(mod => mod.StackedPolaroids))
export const SharedDoodle = dynamic(() => import('@/components/shared-doodle').then(mod => mod.SharedDoodle))
export const DistanceTimeWidget = dynamic(() => import('@/components/distance-time-widget').then(mod => mod.DistanceTimeWidget))
export const MoodCheckIn = dynamic(() => import('@/components/mood-check-in').then(mod => mod.MoodCheckIn))
export const PartnerMood = dynamic(() => import('@/components/partner-mood').then(mod => mod.PartnerMood))
export const PartnerAvatarHeartbeat = dynamic(() => import('@/components/partner-avatar-heartbeat').then(mod => mod.PartnerAvatarHeartbeat))
export const DashboardHeroEnhancements = dynamic(() => import('@/components/dashboard-hero-enhancements').then(mod => mod.DashboardHeroEnhancements))
