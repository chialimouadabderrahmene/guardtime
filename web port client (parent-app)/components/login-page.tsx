'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import toast from 'react-hot-toast'
import { Shield, Mail, Lock, User, Eye, EyeOff, Wifi, Gamepad2, Clock } from 'lucide-react'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const login = useAuthStore((state) => state.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        const { data } = await authApi.login(email, password)
        login(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken })
        toast.success('Connexion réussie!')
        router.push('/dashboard')
      } else {
        const { data } = await authApi.register({ name, email, password })
        login(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken })
        toast.success('Compte créé avec succès!')
        router.push('/dashboard')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-at-green-pale to-white flex items-center justify-center p-4">
      {/* Animated background shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-20 w-72 h-72 bg-at-green/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-96 h-96 bg-at-green-light/5 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Brand */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <motion.div
              className="w-16 h-16 bg-at-green rounded-2xl flex items-center justify-center shadow-lg shadow-at-green/30"
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Shield className="w-8 h-8 text-white" />
            </motion.div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-gray-900">GuardTime</h1>
              <p className="text-sm text-at-green font-medium">Contrôle Parental</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <span className="text-sm">Propulsé par</span>
            <span className="text-at-green font-semibold">Algérie Télécom</span>
          </div>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex gap-3 mb-8"
        >
          {[
            { icon: Clock, label: 'Limites de temps' },
            { icon: Gamepad2, label: 'Contrôle jeux' },
            { icon: Wifi, label: 'Filtrage web' },
          ].map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex-1 bg-white/80 backdrop-blur-sm rounded-xl p-3 text-center shadow-sm border border-at-green/10"
            >
              <feature.icon className="w-5 h-5 text-at-green mx-auto mb-1" />
              <span className="text-xs text-gray-600">{feature.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden"
        >
          {/* Toggle */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-4 text-sm font-medium transition-all ${
                isLogin
                  ? 'text-at-green border-b-2 border-at-green bg-at-green-pale/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-4 text-sm font-medium transition-all ${
                !isLogin
                  ? 'text-at-green border-b-2 border-at-green bg-at-green-pale/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Inscription
            </button>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.form
                key={isLogin ? 'login' : 'register'}
                initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nom complet
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-at-green/30 focus:border-at-green transition-all"
                        placeholder="Votre nom"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-at-green/30 focus:border-at-green transition-all"
                      placeholder="vous@exemple.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-at-green/30 focus:border-at-green transition-all"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 bg-at-green text-white rounded-xl font-semibold shadow-lg shadow-at-green/25 hover:bg-at-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <motion.div
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : isLogin ? (
                    'Se connecter'
                  ) : (
                    'Créer un compte'
                  )}
                </motion.button>
              </motion.form>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-gray-400 mt-6"
        >
          En continuant, vous acceptez les Conditions d'utilisation et la Politique de confidentialité
        </motion.p>
      </div>
    </div>
  )
}
