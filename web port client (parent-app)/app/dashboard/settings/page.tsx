'use client'

import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-at-green" />
            Paramètres
          </h1>
          <p className="text-gray-500 mt-1">Configurez votre compte et vos préférences</p>
        </div>
      </div>
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Bientôt disponible</h3>
        <p className="text-gray-500">Cette fonctionnalité est en cours de développement.</p>
      </div>
    </div>
  )
}
