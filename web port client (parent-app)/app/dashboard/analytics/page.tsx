'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, childrenApi } from '@/lib/api'
import { BarChart3, Loader2, ShieldCheck, Gamepad2, Clock, Users } from 'lucide-react'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export default function AnalyticsPage() {
  const [childId, setChildId] = useState('')
  const [period, setPeriod] = useState<'week' | 'month'>('week')

  const { data: childrenRes } = useQuery({
    queryKey: ['children'],
    queryFn: childrenApi.list,
  })
  const children = childrenRes?.data || []

  const { data: reportRes, isLoading, isError } = useQuery({
    queryKey: ['report', period, childId],
    queryFn: () =>
      period === 'week'
        ? reportsApi.weekly({ childId: childId || undefined })
        : reportsApi.monthly({ childId: childId || undefined }),
  })
  const report = reportRes?.data

  const maxDaily = report ? Math.max(1, ...report.dailyMinutes) : 1

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-at-green" />
            Statistiques
          </h1>
          <p className="text-gray-500 mt-1">Temps de jeu et d'utilisation de vos enfants</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
          >
            <option value="">Tous les enfants</option>
            {children.map((child: any) => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === 'week' ? 'bg-white text-at-green shadow-sm' : 'text-gray-500'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === 'month' ? 'bg-white text-at-green shadow-sm' : 'text-gray-500'
              }`}
            >
              Mois
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="w-8 h-8 text-at-green animate-spin" />
        </div>
      ) : isError || !report ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Statistiques indisponibles</h3>
          <p className="text-gray-500">Impossible de charger les statistiques pour le moment. Réessayez dans un instant.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-at-green-pale text-at-green flex items-center justify-center mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatMinutes(report.screenMinutes)}</p>
              <p className="text-sm text-gray-500">Temps d'écran total</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{report.sessionsCount}</p>
              <p className="text-sm text-gray-500">Sessions</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatMinutes(report.gamingMinutes)}</p>
              <p className="text-sm text-gray-500">Temps de jeu</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{report.protectedDevices} / {report.totalDevices}</p>
              <p className="text-sm text-gray-500">Appareils protégés</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Activité par jour</h2>
            <div className="flex items-end justify-between gap-2 h-40">
              {report.dailyMinutes.map((minutes: number, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center h-32">
                    <div
                      className="w-full max-w-8 bg-at-green rounded-t-md transition-all"
                      style={{ height: `${Math.max(4, (minutes / maxDaily) * 100)}%` }}
                      title={formatMinutes(minutes)}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {report.period === 'week' ? WEEKDAY_LABELS[i % 7] : i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Applications les plus utilisées</h2>
              {report.topApps.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune activité enregistrée sur cette période.</p>
              ) : (
                <div className="space-y-3">
                  {report.topApps.map((app: any) => (
                    <div key={app.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">{app.name}</span>
                      <span className="text-gray-500">{formatMinutes(app.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-at-green" /> Par enfant
              </h2>
              {report.byChild.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune session enregistrée sur cette période.</p>
              ) : (
                <div className="space-y-3">
                  {report.byChild.map((child: any) => (
                    <div key={child.childId} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">{child.name}</span>
                      <span className="text-gray-500">{formatMinutes(child.screenMinutes)} · {child.sessions} session{child.sessions > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
