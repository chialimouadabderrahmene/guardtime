'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { parentsApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Settings, Loader2, Crown, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Gratuit',
  PREMIUM: 'Premium',
  FAMILY: 'Famille',
}

export default function SettingsPage() {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)

  const { data: profileRes, isLoading: loadingProfile, isError: profileError } = useQuery({
    queryKey: ['parent-profile'],
    queryFn: parentsApi.profile,
  })
  const { data: subRes, isLoading: loadingSub } = useQuery({
    queryKey: ['subscription'],
    queryFn: parentsApi.subscription,
    retry: false,
  })

  const profile = profileRes?.data
  const subscription = subRes?.data

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '')
      setLastName(profile.lastName || '')
    }
  }, [profile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await parentsApi.updateProfile({ firstName, lastName })
      toast.success('Profil mis à jour')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur lors de la mise à jour')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      await parentsApi.deleteAccount()
      toast.success('Compte supprimé')
      logout()
      router.push('/')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur lors de la suppression du compte')
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-at-green" />
          Paramètres
        </h1>
        <p className="text-gray-500 mt-1">Configurez votre compte et vos préférences</p>
      </div>

      {loadingProfile ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="w-8 h-8 text-at-green animate-spin" />
        </div>
      ) : profileError || !profile ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Profil indisponible</h3>
          <p className="text-gray-500">Impossible de charger votre profil pour le moment. Réessayez dans un instant.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profil</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-at-green/30 focus:border-at-green outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">L'adresse email ne peut pas être modifiée ici.</p>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-at-green text-white rounded-xl font-medium hover:bg-at-green-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enregistrer
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5 text-at-green" /> Abonnement
            </h2>
            {loadingSub ? (
              <Loader2 className="w-5 h-5 text-at-green animate-spin" />
            ) : subscription ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{PLAN_LABELS[subscription.plan] || subscription.plan}</p>
                  <p className="text-sm text-gray-500">
                    {subscription.active ? 'Actif' : 'Inactif'}
                    {subscription.currentPeriodEnd
                      ? ` · renouvellement le ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                      : ''}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Plan Gratuit — aucun abonnement actif.</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Zone de danger</h2>
            <p className="text-sm text-gray-500 mb-4">
              La suppression de votre compte efface définitivement votre profil, vos enfants, appareils et sessions.
              Cette action est irréversible.
            </p>
            <button
              onClick={() => setIsDeleteOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Supprimer mon compte
            </button>
          </div>
        </>
      )}

      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Supprimer le compte ?</h2>
              <button onClick={() => setIsDeleteOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Toutes vos données seront définitivement supprimées. Cette action ne peut pas être annulée.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex justify-center items-center"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Supprimer définitivement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
