'use client'

import { BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-at-green" />
            Statistiques
          </h1>
          <p className="text-gray-500 mt-1">Analysez le temps de jeu et d'utilisation de vos enfants</p>
        </div>
      </div>
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Bientôt disponible</h3>
        <p className="text-gray-500">Cette fonctionnalité est en cours de développement.</p>
      </div>
    </div>
  )
}
