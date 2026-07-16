'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { devicesApi, childrenApi } from '@/lib/api'
import { 
  Smartphone, 
  Gamepad2, 
  Monitor, 
  Tv, 
  Wifi, 
  WifiOff, 
  ShieldAlert,
  ShieldCheck,
  Plus,
  Loader2,
  Lock,
  Unlock,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'PLAYSTATION':
    case 'XBOX':
    case 'NINTENDO':
      return <Gamepad2 className="w-5 h-5" />
    case 'PC':
      return <Monitor className="w-5 h-5" />
    case 'SMART_TV':
      return <Tv className="w-5 h-5" />
    default:
      return <Smartphone className="w-5 h-5" />
  }
}

export default function DevicesPage() {
  const { data: devicesRes, isLoading, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list
  })

  // We need children to assign the device
  const { data: childrenRes } = useQuery({
    queryKey: ['children'],
    queryFn: childrenApi.list
  })

  const devices = devicesRes?.data || []
  const children = childrenRes?.data || []

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', type: 'SMARTPHONE', childId: '' })

  const toggleInternet = async (deviceId: string, isLocked: boolean) => {
    try {
      if (isLocked) {
        await devicesApi.update(deviceId, { internetLocked: false })
      } else {
        await devicesApi.update(deviceId, { internetLocked: true })
      }
      refetch()
      toast.success(isLocked ? 'Internet débloqué' : 'Internet bloqué')
    } catch (e) {
      toast.error('Erreur lors de la modification')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await devicesApi.create({
        name: formData.name,
        type: formData.type,
        childId: formData.childId || undefined // Optional
      })
      toast.success('Appareil ajouté')
      setIsModalOpen(false)
      setFormData({ name: '', type: 'SMARTPHONE', childId: '' })
      refetch()
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Erreur lors de l'ajout")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-at-green" />
            Appareils
          </h1>
          <p className="text-gray-500 mt-1">Gérez l'accès internet des appareils connectés</p>
        </div>
        <motion.button
          onClick={() => setIsModalOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium shadow-lg shadow-at-green/25 hover:bg-at-green-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Ajouter un appareil</span>
        </motion.button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="w-8 h-8 text-at-green animate-spin" />
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun appareil trouvé</h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
            Vous n'avez pas encore configuré d'appareils à protéger pour vos enfants.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-at-green text-white rounded-xl font-medium shadow-md shadow-at-green/20 hover:bg-at-green-dark transition-colors"
          >
            Connecter un appareil
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device: any, i: number) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                    device.status === 'ONLINE' ? 'bg-at-green-pale text-at-green' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <DeviceIcon type={device.type} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{device.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                      {device.status === 'ONLINE' ? (
                        <><Wifi className="w-3 h-3 text-at-green" /> En ligne</>
                      ) : (
                        <><WifiOff className="w-3 h-3" /> Hors ligne</>
                      )}
                    </div>
                  </div>
                </div>
                {device.protectionStatus === 'COMPROMISED' ? (
                  <div className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-medium flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Vulnérable
                  </div>
                ) : (
                  <div className="px-2 py-1 bg-at-green-pale text-at-green-dark rounded-lg text-xs font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Protégé
                  </div>
                )}
              </div>

              <div className="space-y-3 mt-auto pt-4 border-t border-gray-50">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Plateforme</span>
                  <span className="font-medium text-gray-700">{device.type.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Propriétaire</span>
                  <span className="font-medium text-gray-700">{device.child?.name || 'Non assigné'}</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleInternet(device.id, device.internetLocked)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    device.internetLocked
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {device.internetLocked ? (
                    <><Unlock className="w-4 h-4" /> Débloquer Internet</>
                  ) : (
                    <><Lock className="w-4 h-4" /> Bloquer Internet</>
                  )}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Device Modal */}
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
                <h2 className="text-xl font-bold text-gray-900">Ajouter un appareil</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'appareil *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                    placeholder="Ex: iPad de Lucas"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type d'appareil</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none appearance-none"
                  >
                    <option value="SMARTPHONE">Smartphone</option>
                    <option value="TABLET">Tablette</option>
                    <option value="PC">PC / Ordinateur</option>
                    <option value="PLAYSTATION">PlayStation</option>
                    <option value="XBOX">Xbox</option>
                    <option value="NINTENDO">Nintendo</option>
                    <option value="SMART_TV">Smart TV</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigner à (Optionnel)</label>
                  <select
                    value={formData.childId}
                    onChange={(e) => setFormData({...formData, childId: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none appearance-none"
                  >
                    <option value="">Aucun enfant</option>
                    {children.map((child: any) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </select>
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
                    disabled={isSubmitting || !formData.name}
                    className="flex-1 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium hover:bg-at-green-dark transition-colors disabled:opacity-50 flex justify-center items-center"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connecter'}
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
