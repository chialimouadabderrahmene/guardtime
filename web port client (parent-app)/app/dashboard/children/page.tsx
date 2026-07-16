'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { childrenApi } from '@/lib/api'
import { Users, Plus, Edit2, Trash2, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChildrenPage() {
  const { data: childrenRes, isLoading, refetch } = useQuery({
    queryKey: ['children'],
    queryFn: childrenApi.list
  })

  const children = childrenRes?.data || []
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', age: '', defaultLimit: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await childrenApi.create({
        name: formData.name,
        age: formData.age ? parseInt(formData.age) : undefined,
        defaultLimit: formData.defaultLimit ? parseInt(formData.defaultLimit) : undefined
      })
      toast.success('Enfant ajouté avec succès')
      setIsModalOpen(false)
      setFormData({ name: '', age: '', defaultLimit: '' })
      refetch()
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Erreur lors de l'ajout")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce profil ?')) return
    try {
      await childrenApi.delete(id)
      toast.success('Profil supprimé')
      refetch()
    } catch (error) {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-at-green" />
            Enfants
          </h1>
          <p className="text-gray-500 mt-1">Gérez les profils et les limites de vos enfants</p>
        </div>
        <motion.button
          onClick={() => setIsModalOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium shadow-lg shadow-at-green/25 hover:bg-at-green-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Ajouter un enfant</span>
        </motion.button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="w-8 h-8 text-at-green animate-spin" />
        </div>
      ) : children.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun enfant trouvé</h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
            Commencez par ajouter un profil pour votre enfant afin de configurer ses appareils et ses limites de temps.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-at-green text-white rounded-xl font-medium shadow-md shadow-at-green/20 hover:bg-at-green-dark transition-colors"
          >
            Ajouter le premier profil
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children.map((child: any, i: number) => (
            <motion.div
              key={child.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow relative"
            >
              <div className="h-24 bg-gradient-to-r from-at-green-light to-at-green" />
              <div className="px-6 pb-6 relative">
                <div className="w-16 h-16 bg-white rounded-full border-4 border-white flex items-center justify-center text-2xl font-bold text-at-green shadow-sm absolute -top-8 left-6">
                  {child.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex justify-end pt-3 gap-2">
                  <button className="p-2 text-gray-400 hover:text-blue-500 transition-colors bg-gray-50 rounded-lg hover:bg-blue-50">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(child.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <h3 className="text-xl font-bold text-gray-900">{child.name}</h3>
                  <p className="text-sm text-gray-500">{child.age ? `${child.age} ans` : 'Âge non spécifié'}</p>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-3">
                    <span className="text-gray-500">Limite par défaut</span>
                    <span className="font-medium text-gray-900">{child.defaultLimit ? `${child.defaultLimit} min / jour` : 'Illimité'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Appareils liés</span>
                    <span className="inline-flex items-center gap-1 font-medium px-2 py-1 bg-at-green-pale text-at-green-dark rounded-md">
                      {child.devices?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Child Modal */}
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
                <h2 className="text-xl font-bold text-gray-900">Ajouter un enfant</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom de l'enfant *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                    placeholder="Ex: Lucas"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Âge</label>
                    <input
                      type="number"
                      min="1"
                      max="18"
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Limite (min/jour)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.defaultLimit}
                      onChange={(e) => setFormData({...formData, defaultLimit: e.target.value})}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                      placeholder="Ex: 120"
                    />
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
                    disabled={isSubmitting || !formData.name}
                    className="flex-1 px-4 py-2.5 bg-at-green text-white rounded-xl font-medium hover:bg-at-green-dark transition-colors disabled:opacity-50 flex justify-center items-center"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ajouter'}
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
