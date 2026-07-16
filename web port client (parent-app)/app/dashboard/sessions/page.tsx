'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi, childrenApi, devicesApi } from '@/lib/api'
import { Gamepad2, Clock, History, Loader2, Play, Pause, Square, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SessionsPage() {
  const { data: sessionsRes, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list()
  })

  // We need children and devices to start a session
  const { data: childrenRes } = useQuery({
    queryKey: ['children'],
    queryFn: childrenApi.list
  })
  
  const { data: devicesRes } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list
  })

  const sessions = sessionsRes?.data || []
  const children = childrenRes?.data || []
  const devices = devicesRes?.data || []
  
  const activeSessions = sessions.filter((s: any) => s.status === 'ACTIVE' || s.status === 'PAUSED')
  const pastSessions = sessions.filter((s: any) => s.status !== 'ACTIVE' && s.status !== 'PAUSED')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ childId: '', deviceId: '', durationMinutes: '60' })

  const stopSession = async (id: string) => {
    try {
      await sessionsApi.stop(id)
      toast.success('Session arrêtée')
      refetch()
    } catch (e) {
      toast.error('Erreur lors de l\'arrêt')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await sessionsApi.start({
        childId: formData.childId,
        deviceId: formData.deviceId,
        durationMinutes: parseInt(formData.durationMinutes)
      })
      toast.success('Session démarrée avec succès')
      setIsModalOpen(false)
      setFormData({ childId: '', deviceId: '', durationMinutes: '60' })
      refetch()
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Erreur lors du démarrage")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-at-green" />
            Sessions de jeu
          </h1>
          <p className="text-gray-500 mt-1">Supervisez le temps de jeu et les sessions en cours</p>
        </div>
        <motion.button
          onClick={() => setIsModalOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium shadow-lg shadow-at-green/25 hover:bg-at-green-dark transition-colors"
        >
          <Play className="w-4 h-4" />
          <span className="hidden sm:inline">Démarrer une session</span>
        </motion.button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="w-8 h-8 text-at-green animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Sessions */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-at-green" />
              En cours
            </h2>
            
            {activeSessions.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl border border-gray-100 shadow-sm text-center">
                <Gamepad2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Aucune session active actuellement.</p>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-at-green-pale text-at-green-dark rounded-xl font-medium hover:bg-at-green/20 transition-colors"
                >
                  Démarrer maintenant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeSessions.map((session: any, i: number) => {
                  const progress = session.durationMinutes > 0 ? ((session.durationMinutes - session.remainingMinutes) / session.durationMinutes) * 100 : 0
                  
                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-white rounded-2xl border border-at-green/20 shadow-sm p-5 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gray-100">
                        <div 
                          className="h-full bg-at-green transition-all duration-1000 ease-linear"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between items-start mb-4 mt-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-at-green-pale rounded-full flex items-center justify-center">
                            <Gamepad2 className="w-5 h-5 text-at-green" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">{session.child?.name || 'Enfant'}</h3>
                            <p className="text-sm text-gray-500">{session.device?.name || 'Appareil'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-at-green">{session.remainingMinutes} min</div>
                          <div className="text-xs text-gray-500 font-medium">Restantes</div>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-6">
                        <button className="flex-1 py-2 bg-gray-50 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors">
                          <Plus className="w-4 h-4" /> +15 min
                        </button>
                        <button 
                          className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl font-medium text-sm hover:bg-red-100 flex items-center justify-center gap-2 transition-colors"
                          onClick={() => stopSession(session.id)}
                        >
                          <Square className="w-4 h-4" /> Arrêter
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </section>

          {/* History */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              Historique récent
            </h2>
            
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {pastSessions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Aucun historique disponible.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pastSessions.slice(0, 10).map((session: any) => (
                    <div key={session.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                          <Gamepad2 className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{session.child?.name || 'Enfant'}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(session.startedAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                          session.status === 'EXPIRED' ? 'bg-orange-50 text-orange-600' : 
                          session.status === 'VIOLATED' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {session.status === 'EXPIRED' ? 'Terminé (Temps écoulé)' : session.status === 'STOPPED' ? 'Arrêté manuellement' : session.status}
                        </span>
                        <p className="text-sm font-medium text-gray-900 mt-1">{session.durationMinutes} min total</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Start Session Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Démarrer une session</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enfant *</label>
                  <select
                    required
                    value={formData.childId}
                    onChange={(e) => setFormData({...formData, childId: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none appearance-none"
                  >
                    <option value="" disabled>Sélectionner un enfant</option>
                    {children.map((child: any) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appareil *</label>
                  <select
                    required
                    value={formData.deviceId}
                    onChange={(e) => setFormData({...formData, deviceId: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none appearance-none"
                  >
                    <option value="" disabled>Sélectionner un appareil</option>
                    {devices
                      .filter((d: any) => !formData.childId || d.childId === formData.childId)
                      .map((device: any) => (
                        <option key={device.id} value={device.id}>{device.name} ({device.type})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée (minutes) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({...formData, durationMinutes: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                  />
                  <div className="flex gap-2 mt-2">
                    {[15, 30, 60, 120].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setFormData({...formData, durationMinutes: min.toString()})}
                        className="px-3 py-1 bg-gray-100 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-200"
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.childId || !formData.deviceId}
                    className="flex-1 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium hover:bg-at-green-dark transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-4 h-4"/> Démarrer</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
