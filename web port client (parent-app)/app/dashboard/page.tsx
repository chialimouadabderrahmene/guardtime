'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import DashboardLayout from '@/components/dashboard-layout'
import DashboardHome from '@/components/dashboard-home'

export default function Dashboard() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  return (
    <DashboardLayout>
      <DashboardHome />
    </DashboardLayout>
  )
}
