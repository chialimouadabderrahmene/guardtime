'use client'

import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { childrenApi, devicesApi, sessionsApi } from '@/lib/api'
import {
  Users,
  Smartphone,
  Gamepad2,
  Clock,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
  Plus,
  Loader2
} from 'lucide-react'

interface ActivityEvent {
  at: string
  child: string
  action: string
  icon: typeof Play
  color: string
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(0, Math.round(diffMs / 60000))
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}

export default function DashboardHome() {
  const user = useAuthStore((state) => state.user)

  // Fetch real data
  const { data: childrenRes, isLoading: loadingChildren } = useQuery({
    queryKey: ['children'],
    queryFn: childrenApi.list
  })
  
  const { data: devicesRes, isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list
  })
  
  const { data: sessionsRes, isLoading: loadingSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list() // assuming list returns all or active sessions
  })

  const children = childrenRes?.data || []
  const devices = devicesRes?.data || []
  const sessions = sessionsRes?.data || []
  
  const activeSessions = sessions.filter((s: any) => s.status === 'ACTIVE')

  const isLoading = loadingChildren || loadingDevices || loadingSessions

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-10 h-10 text-at-green animate-spin" />
      </div>
    )
  }

  const stats = [
    { label: 'Enfants', value: children.length.toString(), icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Appareils', value: devices.length.toString(), icon: Smartphone, color: 'bg-purple-50 text-purple-600' },
    { label: 'Sessions actives', value: activeSessions.length.toString(), icon: Gamepad2, color: 'bg-at-green-pale text-at-green' },
    { label: 'Alertes', value: '0', icon: AlertTriangle, color: 'bg-orange-50 text-orange-600' },
  ]

  // Built from real session data already fetched above — no separate
  // activity-feed endpoint exists, so this derives events from session
  // start/stop timestamps instead of showing placeholder data.
  const recentActivity: (ActivityEvent & { time: string })[] = sessions
    .flatMap((session: any): ActivityEvent[] => {
      const child = children.find((c: any) => c.id === session.childId)
      const device = devices.find((d: any) => d.id === session.deviceId)
      const label = `${child?.name || 'Enfant'} · ${device?.name || 'Appareil'}`
      const events: ActivityEvent[] = []
      if (session.startedAt) {
        events.push({ at: session.startedAt, child: label, action: 'Session démarrée', icon: Play, color: 'text-at-green' })
      }
      if (session.stoppedAt) {
        events.push({ at: session.stoppedAt, child: label, action: 'Session arrêtée', icon: Pause, color: 'text-gray-500' })
      }
      return events
    })
    .sort((a: ActivityEvent, b: ActivityEvent) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5)
    .map((event: ActivityEvent) => ({ ...event, time: formatRelativeTime(event.at) }))

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour, {user?.name || 'Parent'}!
          </h1>
          <p className="text-gray-500 mt-1">Voici un aperçu de l'activité de vos enfants</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium shadow-lg shadow-at-green/25 hover:bg-at-green-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nouvelle session</span>
        </motion.button>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Sessions actives</h2>
            <ShieldCheck className="w-5 h-5 text-at-green" />
          </div>
          <div className="space-y-4">
            {activeSessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Aucune session active en ce moment.
              </div>
            ) : (
              activeSessions.map((session: any, i: number) => {
                const child = children.find((c: any) => c.id === session.childId)
                const device = devices.find((d: any) => d.id === session.deviceId)
                const progress = session.durationMinutes > 0 ? ((session.durationMinutes - session.remainingMinutes) / session.durationMinutes) * 100 : 0
                
                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="w-10 h-10 bg-at-green-pale rounded-full flex items-center justify-center">
                      <Gamepad2 className="w-5 h-5 text-at-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{child?.name || 'Enfant inconnu'}</span>
                        <span className="text-sm text-gray-500">{device?.name || 'Appareil inconnu'}</span>
                      </div>
                      <p className="text-sm text-gray-500">{session.activeApp || 'Jeu / Navigation'}</p>
                      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className="h-full bg-at-green rounded-full"
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{session.remainingMinutes} min</p>
                      <p className="text-xs text-gray-500">sur {session.durationMinutes} min</p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      onClick={() => sessionsApi.stop(session.id)}
                    >
                      <Pause className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )
              })
            )}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Activité récente</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm">
                Aucune activité récente.
              </div>
            ) : recentActivity.map((activity, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-3"
              >
                <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center ${activity.color}`}>
                  <activity.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.child}</p>
                  <p className="text-xs text-gray-500">{activity.action}</p>
                </div>
                <span className="text-xs text-gray-400">{activity.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Children Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Aperçu des enfants</h2>
        </div>
        
        {children.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            Aucun enfant enregistré. Ajoutez-en un pour commencer.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((child: any) => (
              <motion.div
                key={child.id}
                whileHover={{ y: -2 }}
                className="p-4 border border-gray-100 rounded-xl hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-at-green-pale rounded-full flex items-center justify-center text-at-green font-semibold">
                    {child.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{child.name}</p>
                    <p className="text-xs text-gray-500">{child.age ? `${child.age} ans` : 'Âge non défini'}</p>
                  </div>
                  <div className={`ml-auto w-2 h-2 rounded-full ${
                    activeSessions.some((s: any) => s.childId === child.id) ? 'bg-at-green' : 'bg-gray-300'
                  }`} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Limite quotidienne</span>
                  <span className="text-gray-700">{child.defaultLimit ? `${child.defaultLimit} min` : 'Aucune'}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
