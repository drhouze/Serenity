'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetch } from './api'
import { Building2 } from 'lucide-react'
import {
  Download, Database, Code, Server, HardDrive, FileArchive,
  AlertTriangle, CheckCircle, Loader2, Terminal, Upload, RefreshCw,
  X, Check, XCircle, Info, Cloud, CloudUpload, CloudDownload, Link2, Unlink, ExternalLink,
  Users, Lock, Unlock, CircleCheck, Settings as SettingsIcon, Save, Trash2, Plus,
  ListChecks, Edit, Layers, ChevronUp, ChevronDown, FileText
} from 'lucide-react'
import { toast } from 'sonner'
import { BUSINESS_TYPES, BUSINESS_TYPE_PRESETS, ALL_CUSTOMER_FEATURES, getBusinessTypePreset, type BusinessType } from '@/lib/business-types'
import { fmtDateTime } from '@/lib/types'
import { bumpDataVersion } from './api'

interface LogEntry {
  timestamp: string
  step: string
  status: 'pending' | 'success' | 'error' | 'info'
  message: string
  data?: any
}

export function Developer() {
  const [downloading, setDownloading] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const logContainerRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const { data: me } = useFetch<any>('/api/auth/me')
  const { data: publicSettings } = useFetch<any>('/api/settings/public')
  // Hide SQLite-only features (raw .db backup) when running on PostgreSQL (Vercel + Supabase)
  const isSqlite = publicSettings?.dbProvider !== 'postgresql'
  const [devTab, setDevTab] = useState<'tools' | 'customers' | 'settings' | 'customization'>('tools')
  // Disk usage warning — fetched on mount, shows banner if > 80%
  const [diskInfo, setDiskInfo] = useState<any>(null)

  useEffect(() => {
    // Fetch disk usage on mount (lightweight — just the GET endpoint)
    fetch('/api/cleanup', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setDiskInfo(data))
      .catch(() => {})
  }, [])

  // Auto-scroll the activity log box to the bottom when a new entry is added.
  // IMPORTANT: We use the container's own scrollTop instead of scrollIntoView,
  // because scrollIntoView also scrolls the nearest scrollable ANCESTOR
  // (i.e. the whole page) — which causes the page to jump downward whenever
  // any button that adds a log entry is clicked.
  const logLengthRef = useRef(0)
  useEffect(() => {
    if (activityLog.length === logLengthRef.current) return // no new entries
    logLengthRef.current = activityLog.length
    const container = logContainerRef.current
    if (container) {
      // Defer until after the new entry renders
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight
      })
    }
  }, [activityLog])

  const addLog = (step: string, status: LogEntry['status'], message: string, data?: any) => {
    setActivityLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      step,
      status,
      message,
      data,
    }])
  }

  const clearLog = () => setActivityLog([])

  const handleDownloadProject = async () => {
    setDownloading(true)
    addLog('Download App', 'info', 'Starting project archive download...')
    try {
      addLog('Download App', 'pending', 'Fetching /api/download-project...')
      const response = await fetch('/api/download-project')
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      addLog('Download App', 'success', `Response received: ${response.status} ${response.headers.get('content-type')}`)
      const blob = await response.blob()
      addLog('Download App', 'info', `Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
      if (blob.size < 10000) {
        throw new Error(`File too small (${blob.size} bytes)`)
      }
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nursing-home-app-${new Date().toISOString().slice(0, 10)}.tar.gz`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => window.URL.revokeObjectURL(url), 10000)
      addLog('Download App', 'success', `Download complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB`)
      toast.success(`Project downloaded (${(blob.size / 1024 / 1024).toFixed(1)} MB)`)
    } catch (e: any) {
      addLog('Download App', 'error', e.message || 'Failed')
      toast.error(e.message || 'Failed to download project')
    }
    setDownloading(false)
  }

  const handleDatabaseBackup = async (format: 'json' | 'csv' | 'db' = 'json') => {
    setBackupLoading(true)
    addLog('Backup DB', 'info', `Starting ${format.toUpperCase()} database backup download...`)
    try {
      const response = await fetch(`/api/backup?format=${format}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const sizeStr = blob.size > 1024 * 1024
        ? `${(blob.size / 1024 / 1024).toFixed(2)} MB`
        : `${(blob.size / 1024).toFixed(1)} KB`
      addLog('Backup DB', 'success', `${format.toUpperCase()} backup downloaded: ${sizeStr}`)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = response.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const defaultExt = format === 'json' ? 'json' : format === 'csv' ? 'zip' : 'db'
      a.download = match ? match[1] : `backup-${new Date().toISOString().slice(0, 10)}.${defaultExt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} backup downloaded`)
    } catch (e: any) {
      addLog('Backup DB', 'error', e.message || 'Failed')
      toast.error(e.message || 'Failed to download backup')
    }
    setBackupLoading(false)
  }

  const handleDatabaseRestore = async () => {
    if (!selectedFile) {
      toast.error('Please select a backup file first')
      return
    }

    clearLog()
    addLog('Restore DB', 'info', `Starting restore from: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`)

    // Step 1: Validate file
    addLog('Restore DB', 'pending', 'Step 1: Validating file...')
    const fileName = selectedFile.name.toLowerCase()
    if (!fileName.endsWith('.json') && !fileName.endsWith('.zip')) {
      addLog('Restore DB', 'error', 'File must be a .json or .zip backup file exported from this system')
      toast.error('Invalid file type — must be .json or .zip')
      return
    }
    if (selectedFile.size < 100) {
      addLog('Restore DB', 'error', 'File too small (< 100 bytes)')
      toast.error('File too small')
      return
    }
    const fileFormat = fileName.endsWith('.zip') ? 'CSV ZIP' : 'JSON'
    addLog('Restore DB', 'success', `File valid: ${selectedFile.name}, ${(selectedFile.size / 1024).toFixed(1)} KB (${fileFormat} format)`)

    // Step 2: Confirm
    addLog('Restore DB', 'pending', 'Step 2: Waiting for confirmation...')
    if (!confirm(
      `Restore database from "${selectedFile.name}" (${fileFormat} format)?\n\nThis will REPLACE ALL current data with the contents of this backup.\nThis action CANNOT be undone.`
    )) {
      addLog('Restore DB', 'info', 'User cancelled restore')
      return
    }
    addLog('Restore DB', 'success', 'User confirmed')

    // Step 3: Upload
    setRestoring(true)
    addLog('Restore DB', 'pending', 'Step 3: Uploading file to /api/restore...')
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const uploadStart = Date.now()
      const response = await fetch('/api/restore', {
        method: 'POST',
        body: formData,
      })
      const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2)
      addLog('Restore DB', 'success', `Upload complete in ${uploadTime}s — HTTP ${response.status}`)

      // Step 4: Parse response
      addLog('Restore DB', 'pending', 'Step 4: Parsing server response...')
      // Handle non-JSON responses (Vercel timeout returns HTML, server errors return plain text)
      const responseText = await response.text()
      let result: any
      try {
        result = JSON.parse(responseText)
      } catch {
        // Response is not JSON — likely a Vercel error page or timeout
        const preview = responseText.slice(0, 200)
        // Vercel returns various error codes for serverless function failures:
        //   504 = Gateway Timeout (function exceeded maxDuration)
        //   502 = Bad Gateway (function crashed or hit memory limit)
        //   503 = Service Unavailable (function too busy)
        // The body usually contains "An error occurred" or "FUNCTION_INVOCATION_TIMEOUT"
        const isTimeout =
          response.status === 504 ||
          response.status === 502 ||
          /timeout|timed out|FUNCTION_INVOCATION_TIMEOUT/i.test(responseText)
        if (isTimeout) {
          throw new Error(
            `Server timeout or crash (HTTP ${response.status}). ` +
            `The restore took longer than Vercel's serverless function limit ` +
            `(10s on Hobby plan, 60s on Pro, 120s with maxDuration override on Pro). ` +
            `Try one of: (1) upload a smaller JSON backup, (2) upgrade to Vercel Pro, ` +
            `(3) run the restore locally against your Supabase DB using 'npm run dev'. ` +
            `Server response preview: "${preview}"`
          )
        }
        throw new Error(`Server returned HTTP ${response.status} with non-JSON response: "${preview}"`)
      }

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`)
      }
      addLog('Restore DB', 'success', `Server: ${result.message || 'OK'}`)
      addLog('Restore DB', 'info', `Imported: ${result.imported || 0}, Errors: ${result.errors || 0}`)
      if (result.firstError) {
        addLog('Restore DB', 'info', `First error: ${result.firstError}`)
      }

      if (result.success !== false) {
        addLog('Restore DB', 'success', '✅ RESTORE CONFIRMED SUCCESSFUL')
        toast.success('Database restored successfully! Reloading...')
        setSelectedFile(null)
        const fileInput = document.getElementById('db-upload') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        bumpDataVersion()
        addLog('Restore DB', 'info', 'Performing full page reload in 2 seconds...')
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        addLog('Restore DB', 'error', '❌ RESTORE FAILED')
        toast.error('Restore failed — check log')
      }

    } catch (e: any) {
      addLog('Restore DB', 'error', `Failed: ${e.message || 'Unknown error'}`)
      toast.error(e.message || 'Failed to restore database')
    }
    setRestoring(false)
  }

  return (
    <div className="space-y-4">
      {/* Disk usage warning banner — shows when disk > 80% */}
      {diskInfo?.disk && (() => {
        const pct = parseInt(diskInfo.disk.usePercent?.replace('%', '') || '0')
        if (pct < 80) return null
        const isCritical = pct >= 90
        return (
          <div className={`rounded-md border p-3 flex items-start gap-3 ${isCritical ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isCritical ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="flex-1 text-sm">
              <div className={`font-medium ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
                {isCritical ? '⚠️ Critical: Disk almost full!' : '⚠️ Disk usage is high'}
              </div>
              <div className={`text-xs mt-0.5 ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                Disk is <strong>{diskInfo.disk.usePercent}</strong> used ({diskInfo.disk.used} of {diskInfo.disk.total}, only {diskInfo.disk.available} free).
                {isCritical
                  ? ' Deployments and backups may fail. Please clean up temporary files immediately.'
                  : ' Consider cleaning up temporary files to prevent deployment failures.'}
              </div>
              {diskInfo.autoCleaned && (
                <div className="text-xs mt-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-1.5">
                  ✅ Auto-cleaned {diskInfo.autoCleaned.count} old build directories ({diskInfo.autoCleaned.freedMB} MB freed). Refresh to see updated disk usage.
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={isCritical ? 'destructive' : 'outline'}
                  onClick={() => setDevTab('tools')}
                >
                  <HardDrive className="h-3 w-3 mr-1" /> Go to Cleanup
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b pb-px scrollbar-thin">
        <button onClick={() => setDevTab('tools')} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 flex-shrink-0 ${devTab === 'tools' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          Developer Tools
        </button>
        <button onClick={() => setDevTab('customers')} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 flex-shrink-0 ${devTab === 'customers' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          App Customers
        </button>
        <button onClick={() => setDevTab('settings')} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 flex-shrink-0 ${devTab === 'settings' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          App Settings
        </button>
        <button onClick={() => setDevTab('customization')} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 flex-shrink-0 ${devTab === 'customization' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          Customization
        </button>
      </div>

      {devTab === 'customers' && <AppCustomersTab />}

      {devTab === 'settings' && <AppSettingsTab />}

      {devTab === 'customization' && <CustomizationTab />}

      {devTab === 'tools' && (
      <>
      {/* Warning banner */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <div className="font-semibold mb-1">Developer Tools — Owner Access Only</div>
            <p>This module contains tools for backing up, downloading, and restoring the application database. Only the Owner account can access this page.</p>
          </div>
        </CardContent>
      </Card>

      {/* Download full project */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileArchive className="h-4 w-4" /> Download Full Application
          </CardTitle>
          <CardDescription>
            Download the entire project as a .tar.gz archive — includes source code, database, and configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownloadProject} disabled={downloading} className="w-full sm:w-auto">
            {downloading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Download Full App (.tar.gz)</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Database backup & restore */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" /> Database Backup & Restore
          </CardTitle>
          <CardDescription>Download a backup in JSON, CSV (ZIP), or raw SQLite (.db) format.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Download backup — 3 formats */}
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">Download Backup</div>
              <div className="text-xs text-muted-foreground">Choose the format that suits your need:</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* JSON format — recommended, works everywhere */}
              <Button
                onClick={() => handleDatabaseBackup('json')}
                disabled={backupLoading}
                variant="default"
                className="h-auto py-3 flex-col items-start gap-1"
                title="Recommended — single JSON file with all tables. Works on any deployment."
              >
                <div className="flex items-center gap-2 w-full">
                  <Download className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium text-sm">JSON</span>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Recommended</Badge>
                </div>
                <div className="text-[10px] text-left text-muted-foreground font-normal">
                  Single .json file, all tables. Restorable via Restore tab.
                </div>
              </Button>

              {/* CSV format — ZIP of CSV files, one per table */}
              <Button
                onClick={() => handleDatabaseBackup('csv')}
                disabled={backupLoading}
                variant="outline"
                className="h-auto py-3 flex-col items-start gap-1"
                title="ZIP archive with one CSV file per table. Good for opening in Excel/Google Sheets."
              >
                <div className="flex items-center gap-2 w-full">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium text-sm">CSV (ZIP)</span>
                </div>
                <div className="text-[10px] text-left text-muted-foreground font-normal">
                  One CSV per table. Open in Excel / Google Sheets.
                </div>
              </Button>

              {/* DB format — raw SQLite file (hidden on PostgreSQL / Vercel + Supabase) */}
              {isSqlite && (
              <Button
                onClick={() => handleDatabaseBackup('db')}
                disabled={backupLoading}
                variant="outline"
                className="h-auto py-3 flex-col items-start gap-1"
                title="Raw SQLite database file copy. Local-only (won't work on serverless platforms like Vercel)."
              >
                <div className="flex items-center gap-2 w-full">
                  <Database className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium text-sm">SQLite (.db)</span>
                </div>
                <div className="text-[10px] text-left text-muted-foreground font-normal">
                  Raw binary file. Local deployments only.
                </div>
              </Button>
              )}
            </div>

            {backupLoading && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Preparing backup...
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            {/* Restore */}
            <div className="text-sm">
              <div className="font-medium flex items-center gap-1">
                <Upload className="h-3.5 w-3.5" /> Restore from Backup
              </div>
              <div className="text-xs text-muted-foreground">Upload a .json or .zip (CSV) backup file to replace the current database</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="db-upload"
                type="file"
                accept=".json,application/json,.zip,application/zip"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const fn = file.name.toLowerCase()
                    if (!fn.endsWith('.json') && !fn.endsWith('.zip')) {
                      toast.error('Please select a .json or .zip backup file')
                      e.target.value = ''
                      return
                    }
                    setSelectedFile(file)
                    addLog('File Selected', 'info', `${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
                  }
                }}
                className="text-sm border rounded px-3 py-1.5 flex-1 cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <Button onClick={handleDatabaseRestore} disabled={restoring || !selectedFile}>
                {restoring ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restoring...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Restore</>
                )}
              </Button>
            </div>

            {selectedFile && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2.5 flex items-center gap-2">
                <Database className="h-3.5 w-3.5" />
                <span className="font-medium">{selectedFile.name}</span>
                <span>•</span>
                <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span className="text-primary">{selectedFile.name.toLowerCase().endsWith('.zip') ? 'CSV ZIP format' : 'JSON format'}</span>
                <button
                  onClick={() => { setSelectedFile(null); const fi = document.getElementById('db-upload') as HTMLInputElement; if (fi) fi.value = '' }}
                  className="ml-auto text-red-500 hover:text-red-700"
                >Remove</button>
              </div>
            )}

            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div><strong>Warning:</strong> Restoring replaces all current data. Current DB is backed up to /tmp. Only upload backup files downloaded from this app (JSON or CSV ZIP format).</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Activity Log
              {activityLog.length > 0 && <Badge variant="outline" className="text-xs">{activityLog.length} entries</Badge>}
            </CardTitle>
            {activityLog.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearLog}>Clear</Button>
            )}
          </div>
          <CardDescription>Tracks every step of backup, download, and restore operations — use this to diagnose failures.</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity yet. Perform a backup, download, or restore to see logs here.</p>
          ) : (
            <div ref={logContainerRef} className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
              {activityLog.map((log, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-slate-500 flex-shrink-0">{log.timestamp.slice(11, 23)}</span>
                  <span className="flex-shrink-0">
                    {log.status === 'success' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                    {log.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    {log.status === 'pending' && <Loader2 className="h-3.5 w-3.5 text-amber-400" />}
                    {log.status === 'info' && <Info className="h-3.5 w-3.5 text-sky-400" />}
                  </span>
                  <span className="text-slate-500 flex-shrink-0">[{log.step}]</span>
                  <span className={
                    log.status === 'success' ? 'text-emerald-300' :
                    log.status === 'error' ? 'text-red-300' :
                    log.status === 'pending' ? 'text-amber-300' :
                    'text-slate-300'
                  }>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disk Space & Cleanup */}
      <DiskSpaceCard />

      {/* System info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4" /> System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Application:</span>
            <span className="font-medium">Serenity Care Home Management System</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Framework:</span>
            <span className="font-medium">Next.js 16 + TypeScript + Prisma</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database:</span>
            <span className="font-medium">SQLite</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current User:</span>
            <span className="font-medium">{me?.user?.name || '—'} ({me?.user?.role})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Server Time:</span>
            <span className="font-medium">{fmtDateTime(new Date())}</span>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}

// ============ DEPLOY CARD ============
function DeployCard() {
  const [deploying, setDeploying] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [showSteps, setShowSteps] = useState(false)

  const handleDeploy = async () => {
    if (!confirm('Update and deploy now?\n\nThis will clear the build cache and force a recompile. You will need to refresh the page after it completes.')) return
    setDeploying(true)
    setResult(null)
    setShowSteps(true)
    try {
      const res = await fetch('/api/deploy', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (e: any) {
      setResult({ success: false, error: e.message })
    }
    setDeploying(false)
  }

  return (
    <Card className="border-emerald-300">
      <CardHeader className="bg-emerald-50/50 rounded-t-lg">
        <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
          <RefreshCw className="h-4 w-4" /> Update & Deploy
        </CardTitle>
        <CardDescription>
          Rebuild the app with the latest code changes and deploy to production. This clears the build cache, runs a fresh build, and reloads the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Button onClick={handleDeploy} disabled={deploying} className="bg-emerald-600 hover:bg-emerald-700">
            {deploying ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deploying... (this takes ~30s)</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Update & Deploy</>
            )}
          </Button>
          {!deploying && !result && (
            <span className="text-xs text-muted-foreground">
              Click to rebuild and deploy the latest code changes.
            </span>
          )}
        </div>

        {/* Deploy steps */}
        {showSteps && result?.steps && (
          <div className="border rounded-md divide-y">
            {result.steps.map((s: any, i: number) => (
              <div key={i} className="p-2 flex items-center gap-2 text-xs">
                {s.status === 'success' ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                ) : s.status === 'error' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin flex-shrink-0" />
                )}
                <span className="font-medium">{s.step}</span>
                <span className="text-muted-foreground flex-1">{s.message}</span>
                {s.duration && <span className="text-muted-foreground">{(s.duration / 1000).toFixed(1)}s</span>}
              </div>
            ))}
          </div>
        )}

        {/* Result message */}
        {result?.success && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2 space-y-2">
            <div>✅ {result.message} (Total: {result.duration})</div>
            <Button size="sm" className="h-6 text-[10px] bg-emerald-600" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh Page Now
            </Button>
          </div>
        )}
        {result && !result.success && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            ❌ Deploy failed: {result.error}
          </div>
        )}

        {/* Info */}
        <div className="text-[10px] text-muted-foreground border-t pt-2">
          <strong>What this does:</strong>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            <li>Clears the build cache (forces recompile on next page load)</li>
            <li>Cleans up temporary files in <code className="bg-muted px-1 rounded">/tmp</code></li>
            <li>Bumps data version (forces all clients to refetch)</li>
            <li>Click <strong>Refresh Page Now</strong> after deploy to load the new code</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ APP SETTINGS TAB ============
function AppSettingsTab() {
  const { data: settings, refetch } = useFetch<any>('/api/settings')
  const [appName, setAppName] = useState('')
  const [appTagline, setAppTagline] = useState('')
  const [appLogoUrl, setAppLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#e11d48')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [defaultPassword, setDefaultPassword] = useState('')
  const [sessionTimeout, setSessionTimeout] = useState('')

  useEffect(() => {
    if (settings) {
      setAppName(settings.appName || 'Serenity Care Home')
      setAppTagline(settings.appTagline || 'Resident & Operations Management')
      setAppLogoUrl(settings.appLogoUrl || settings.organizationLogoUrl || '')
      setPrimaryColor(settings.primaryColor || settings.appPrimaryColor || '#e11d48')
      setDefaultPassword(settings.defaultNewUserPassword || '')
      setSessionTimeout(String(settings.sessionTimeoutMinutes ?? 480))
    }
  }, [settings])

  const saveAll = async () => {
    setSaving(true)
    try {
      const keys: Record<string, any> = {
        appName,
        appTagline,
        appLogoUrl,
        primaryColor,
        defaultNewUserPassword: defaultPassword || undefined,
        sessionTimeoutMinutes: parseInt(sessionTimeout) || 480,
      }
      for (const [k, v] of Object.entries(keys)) {
        if (v !== undefined) {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: k, value: v }),
          })
        }
      }
      toast.success('App settings saved — reloading to apply changes...')
      setTimeout(() => window.location.reload(), 1000)
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* App Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" /> App Branding
          </CardTitle>
          <CardDescription>
            Customize the app name shown in the top-left of every page, the tagline below it, and the logo.
            These are app-wide defaults — facility names still appear when a specific facility is selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Preview */}
          <div className="border rounded-md p-3 bg-muted/30 flex items-center gap-2">
            {appLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appLogoUrl} alt={appName} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                <Cloud className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="font-bold text-sm sm:text-base leading-tight">{appName || 'Serenity Care Home'}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{appTagline || 'Resident & Operations Management'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">App Name *</label>
              <Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="e.g. Serenity Care Home" />
              <div className="text-[10px] text-muted-foreground mt-0.5">Shown as the bold title in the top-left header on every page.</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">App Tagline</label>
              <Input value={appTagline} onChange={e => setAppTagline(e.target.value)} placeholder="e.g. Resident & Operations Management" />
              <div className="text-[10px] text-muted-foreground mt-0.5">Small subtitle shown below the app name (when no facility is selected).</div>
            </div>
          </div>

          {/* Logo Upload */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">APP LOGO</div>
            <div className="flex items-start gap-4 flex-wrap">
              {appLogoUrl && (
                <div className="border rounded-lg p-2 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={appLogoUrl} alt="Logo" className="h-16 w-auto max-w-[200px] object-contain" />
                </div>
              )}
              <div className="flex-1 min-w-[200px] space-y-2">
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) { toast.error('File too large (max 2MB)'); return }
                      setUploadingLogo(true)
                      try {
                        const formData = new FormData()
                        formData.append('logo', file)
                        const res = await fetch('/api/upload-logo', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error)
                        setAppLogoUrl(data.url)
                        toast.success('Logo uploaded')
                      } catch (err: any) { toast.error(err.message) }
                      setUploadingLogo(false)
                    }}
                    className="text-xs border rounded px-2 py-1.5 cursor-pointer file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground"
                  />
                  {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex gap-2 items-center">
                  <Input value={appLogoUrl} onChange={e => setAppLogoUrl(e.target.value)} placeholder="Or paste URL manually" className="text-xs" />
                  {appLogoUrl && (
                    <Button size="sm" variant="ghost" className="text-red-500 h-7 px-2" onClick={() => setAppLogoUrl('')} title="Remove logo">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">PNG, JPEG, SVG, WebP, GIF. Max 2MB. Stored in /public/uploads/.</div>
              </div>
            </div>
          </div>

          {/* Theme color */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">PRIMARY THEME COLOR</div>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-8 w-12 border rounded" />
              <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="font-mono w-32" />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Used for buttons, links, and active tab indicators. Apply changes by saving and reloading.</div>
          </div>

          <Button size="sm" onClick={saveAll} disabled={saving}>
            {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</> : <><Save className="h-3 w-3 mr-1" /> Save App Branding</>}
          </Button>
        </CardContent>
      </Card>

      {/* App Security Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> App Security Defaults
          </CardTitle>
          <CardDescription>
            Default values applied when creating new user accounts or when a user logs in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default New User Password</label>
              <Input
                type="text"
                value={defaultPassword}
                onChange={e => setDefaultPassword(e.target.value)}
                placeholder="e.g. welcome123"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Pre-filled when creating a new user account. Users should change it after first login.
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Session Timeout (minutes)</label>
              <Input
                type="number"
                min="5"
                max="1440"
                value={sessionTimeout}
                onChange={e => setSessionTimeout(e.target.value)}
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                How long a user stays logged in before being asked to sign in again. Default: 480 (8 hours).
              </div>
            </div>
          </div>
          <Button size="sm" onClick={saveAll} disabled={saving}>
            {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</> : <><Save className="h-3 w-3 mr-1" /> Save Security Defaults</>}
          </Button>
        </CardContent>
      </Card>

      {/* Update & Deploy */}
      <DeployCard />

      {/* App Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" /> App Diagnostics
          </CardTitle>
          <CardDescription>Quick links and info for the developer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href="/api/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">View All Settings (JSON)</div>
                <div className="text-muted-foreground">Raw settings dump from /api/settings</div>
              </div>
            </a>
            <a
              href="/api/auth/me"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">Current Session (JSON)</div>
                <div className="text-muted-foreground">Your logged-in user info from /api/auth/me</div>
              </div>
            </a>
            <a
              href="/api/data-version"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <div>
                <div className="font-medium">Data Version</div>
                <div className="text-muted-foreground">Current cache-busting version</div>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ DEMO ACCOUNT ROW (editable credentials + org access) ============
function DemoAccountRow({ user, facilities, organizations, onSaved }: { user: any; facilities: any[]; organizations: any[]; onSaved: () => void }) {
  const [email, setEmail] = useState(user.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSaveCredentials = async () => {
    setSaving(true)
    try {
      const body: any = {}
      if (email.trim() && email.trim().toLowerCase() !== user.email) {
        body.email = email.trim().toLowerCase()
      }
      if (password.trim()) {
        if (password.length < 6) {
          toast.error('Password must be at least 6 characters')
          setSaving(false)
          return
        }
        body.password = password
      }
      if (Object.keys(body).length === 0) {
        toast.info('No changes to save')
        setSaving(false)
        return
      }
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`Credentials updated for ${user.name}`)
      setPassword('')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  // Toggle an entire organization's facilities for this demo user
  const toggleOrganization = async (org: any) => {
    const orgFacilityIds = (org.facilities || []).map((f: any) => f.id)
    const currentFids = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    const allChecked = orgFacilityIds.length > 0 && orgFacilityIds.every((fid: string) => currentFids.includes(fid))
    const next = allChecked
      ? currentFids.filter(id => !orgFacilityIds.includes(id))
      : [...new Set([...currentFids, ...orgFacilityIds])]
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityIds: next.join(',') }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // Toggle a single facility
  const toggleFacility = async (fid: string) => {
    const fids = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    const next = fids.includes(fid) ? fids.filter(id => id !== fid) : [...fids, fid]
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityIds: next.join(',') }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const userFids = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)

  return (
    <div className="p-2 space-y-2">
      {/* Header: role + name + status */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
        <span className="font-medium text-xs">{user.name}</span>
        <Badge variant={user.active ? 'outline' : 'secondary'} className={`text-[10px] ml-auto ${user.active ? 'text-emerald-600' : 'text-red-600'}`}>
          {user.active ? 'Active' : 'Disabled'}
        </Badge>
      </div>

      {/* Editable credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-1">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Username (Email)</label>
          <div className="flex gap-1">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="text-xs font-mono h-7"
              placeholder={user.email}
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Password (leave blank to keep current)</label>
          <div className="flex gap-1">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="text-xs font-mono h-7"
              placeholder="••••••••"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 flex-shrink-0"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <XCircle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Save credentials button */}
      <div className="pl-1">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleSaveCredentials} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
          Save Credentials
        </Button>
      </div>

      {/* Organization access — org-level checkboxes */}
      <div className="pl-1">
        <div className="text-[10px] text-muted-foreground mb-1">ORGANIZATION ACCESS</div>
        {organizations.length > 0 ? (
          <div className="space-y-1">
            {organizations.map(org => {
              const orgFacilityIds = (org.facilities || []).map((f: any) => f.id)
              const allChecked = orgFacilityIds.length > 0 && orgFacilityIds.every((fid: string) => userFids.includes(fid))
              const someChecked = orgFacilityIds.some((fid: string) => userFids.includes(fid))
              return (
                <div key={org.id} className="border rounded p-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                      onChange={() => toggleOrganization(org)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-medium">{org.name}</span>
                    <span className="text-[10px] text-muted-foreground">({orgFacilityIds.length} facilit{orgFacilityIds.length === 1 ? 'y' : 'ies'})</span>
                    {org.blocked && <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-700 ml-auto">Blocked</Badge>}
                  </label>
                  {/* Show individual facilities under this org (collapsible) */}
                  {someChecked && orgFacilityIds.length > 1 && (
                    <div className="ml-5 mt-1 flex flex-wrap gap-2">
                      {org.facilities.map((f: any) => (
                        <label key={f.id} className="flex items-center gap-0.5 cursor-pointer text-[10px]">
                          <input
                            type="checkbox"
                            checked={userFids.includes(f.id)}
                            onChange={() => toggleFacility(f.id)}
                            className="h-2.5 w-2.5"
                          />
                          <span>{f.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {facilities.map(f => (
              <label key={f.id} className="flex items-center gap-1 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={userFids.includes(f.id)}
                  onChange={() => toggleFacility(f.id)}
                  className="h-3 w-3"
                />
                <span>{f.name}</span>
              </label>
            ))}
            {facilities.length === 0 && <span className="text-[10px] text-muted-foreground">No organizations</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ ALL MODULES (shared) ============
const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'rounds', label: 'Care Rounds' },
  { id: 'residents', label: 'Customers' },
  { id: 'rooms', label: 'Rooms & Beds' },
  { id: 'staff', label: 'Staff & Shifts' },
  { id: 'clinical', label: 'Clinical' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'users', label: 'User Accounts' },
  { id: 'messages', label: 'Family Messages' },
  { id: 'products', label: 'Product Catalog' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'finance', label: 'Accounting' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'My Profile' },
]

// ============ ORG MODULE PICKER ============
function OrgModulePicker({ orgId, orgName, settings, businessType, onSaved }: { orgId: string; orgName: string; settings: any; businessType?: string; onSaved: () => void }) {
  // Key: orgModules:<orgId> — if not set, org has access to ALL modules
  const settingKey = `orgModules:${orgId}`
  const serverModules: string[] | undefined = settings?.[settingKey]

  // Local state for optimistic updates — checkboxes update instantly without waiting for refetch
  const [localModules, setLocalModules] = useState<string[] | undefined>(serverModules)

  // Sync local state when server data changes (e.g. after onSaved refetch)
  useEffect(() => {
    setLocalModules(serverModules)
  }, [serverModules])

  const currentModules = localModules
  const isEnabled = (moduleId: string) => {
    if (!Array.isArray(currentModules)) return true  // Not set = all modules enabled
    return currentModules.includes(moduleId)
  }

  const toggleModule = async (moduleId: string) => {
    const current = Array.isArray(currentModules) ? currentModules : ALL_MODULES.map(m => m.id)
    const next = current.includes(moduleId)
      ? current.filter(id => id !== moduleId)
      : [...current, moduleId]
    // Optimistic update — update local state immediately so the checkbox reflects instantly
    setLocalModules(next)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: next }),
      })
      toast.success(`Module access updated for ${orgName}`)
      onSaved()
    } catch (e: any) {
      // Revert on error
      setLocalModules(current)
      toast.error(e.message)
    }
  }

  const setAll = async (all: boolean) => {
    const value = all ? ALL_MODULES.map(m => m.id) : ['dashboard', 'profile']
    // Optimistic update
    setLocalModules(value)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value }),
      })
      toast.success(all ? `All modules enabled for ${orgName}` : `Minimal modules set for ${orgName}`)
      onSaved()
    } catch (e: any) {
      setLocalModules(serverModules)
      toast.error(e.message)
    }
  }

  const resetToDefault = async () => {
    // Reset to the business type preset modules.
    // Checks for Developer-customized module list (saved as businessTypeModules:<type>)
    // first — if the Developer has customized the preset via Org Type Management,
    // use that. Otherwise fall back to the static code preset.
    const overrideKey = `businessTypeModules:${businessType || 'nursing_home'}`
    const savedOverride = settings?.[overrideKey]
    const preset = getBusinessTypePreset(businessType)
    const presetModules = Array.isArray(savedOverride) ? savedOverride : preset.visibleModules
    // Optimistic update
    setLocalModules(presetModules)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: presetModules }),
      })
      const source = Array.isArray(savedOverride) ? `${preset.label} (customized)` : preset.label
      toast.success(`Reset to ${source} defaults (${presetModules.length} modules) for ${orgName}`)
      onSaved()
    } catch (e: any) {
      setLocalModules(serverModules)
      toast.error(e.message)
    }
  }

  const enabledCount = Array.isArray(currentModules) ? currentModules.length : ALL_MODULES.length

  // Compute the module count for the reset button — includes Developer overrides
  const resetOverrideKey = `businessTypeModules:${businessType || 'nursing_home'}`
  const resetSavedOverride = settings?.[resetOverrideKey]
  const resetPreset = getBusinessTypePreset(businessType)
  const resetModuleCount = Array.isArray(resetSavedOverride) ? resetSavedOverride.length : resetPreset.visibleModules.length
  const resetLabel = Array.isArray(resetSavedOverride) ? `${resetPreset.label} (customized)` : resetPreset.label

  return (
    <div className="mt-2 ml-8 p-2 border rounded bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-muted-foreground">MODULE ACCESS FOR {orgName.toUpperCase()}</div>
        <div className="text-[10px] text-muted-foreground">{enabledCount} / {ALL_MODULES.length} modules</div>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Select which modules this organization can access. Unchecked modules will be hidden from all users in this org.
        Click "Reset to {resetLabel}" to restore the default module set for this org's business type
        {Array.isArray(resetSavedOverride) ? ' (includes your customizations from Org Type Management)' : ''}.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {ALL_MODULES.map(m => {
          const checked = isEnabled(m.id)
          return (
            <label key={m.id} className="flex items-center gap-1.5 cursor-pointer p-1 rounded hover:bg-muted/50 text-xs">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleModule(m.id)}
                className="h-3 w-3"
              />
              <span className={checked ? 'font-medium' : 'text-muted-foreground'}>{m.label}</span>
            </label>
          )
        })}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setAll(true)}>Enable All</Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setAll(false)}>Minimal Only</Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600" onClick={resetToDefault}>
          Reset to {resetLabel} ({resetModuleCount} modules)
        </Button>
      </div>
    </div>
  )
}

// ============ APP CUSTOMERS TAB ============
function AppCustomersTab() {
  const { data: allUsers, loading, refetch } = useFetch<any[]>('/api/users?demoOnly=true')
  const { data: realUsers, loading: realLoading, refetch: refetchReal } = useFetch<any[]>('/api/users?allExceptDemo=true')
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const { data: settings } = useFetch<any>('/api/settings')
  const [demoMode, setDemoMode] = useState(false)
  const [demoFacilityIds, setDemoFacilityIds] = useState<string[]>([])

  // Add New Organization form state
  const [showAddOrg, setShowAddOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgAddress, setNewOrgAddress] = useState('')
  const [newOrgPhone, setNewOrgPhone] = useState('')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [newOrgDirector, setNewOrgDirector] = useState('')
  const [newOrgBusinessType, setNewOrgBusinessType] = useState('nursing_home')
  const [addingOrg, setAddingOrg] = useState(false)
  // Org Type Management — editable module lists per business type
  const [editingType, setEditingType] = useState<string | null>(null)
  const [typeModuleOverrides, setTypeModuleOverrides] = useState<Record<string, string[]>>({})
  const [typeFeatureOverrides, setTypeFeatureOverrides] = useState<Record<string, string[]>>({})
  const [typeLabelOverrides, setTypeLabelOverrides] = useState<Record<string, Record<string, string>>>({})
  // Business type definitions (label + description + modules — editable + custom types)
  const { data: businessTypesData, refetch: refetchBusinessTypes } = useFetch<any[]>('/api/business-types')
  const allBusinessTypes = businessTypesData || BUSINESS_TYPES
  // Fetch global custom tabs for the Org Type Management section
  const { data: globalTabsForType } = useFetch<any[]>('/api/global-custom-tabs')
  // Edit form state for the current type being edited
  const [editTypeLabel, setEditTypeLabel] = useState('')
  const [editTypeDesc, setEditTypeDesc] = useState('')
  const [showAddType, setShowAddType] = useState(false)
  const [newTypeId, setNewTypeId] = useState('')
  const [newTypeLabel, setNewTypeLabel] = useState('')
  // Feature label overrides — { [type]: { [featureId]: "custom label" } }
  const [typeFeatureLabelOverrides, setTypeFeatureLabelOverrides] = useState<Record<string, Record<string, string>>>({})

  // Organizations (top-level tenants that group facilities)
  const { data: organizations, refetch: refetchOrgs } = useFetch<any[]>('/api/organizations')

  // Add Facility form state (within an org)
  const [showAddFacilityForOrg, setShowAddFacilityForOrg] = useState<string | null>(null)
  const [showOrgModules, setShowOrgModules] = useState<string | null>(null)
  const [newFacName, setNewFacName] = useState('')
  const [newFacAddress, setNewFacAddress] = useState('')
  const [newFacPhone, setNewFacPhone] = useState('')
  const [newFacDirector, setNewFacDirector] = useState('')
  const [addingFac, setAddingFac] = useState(false)

  useEffect(() => {
    if (settings) {
      setDemoMode(settings.demoMode || false)
      setDemoFacilityIds(settings.demoFacilityIds || [])
    }
  }, [settings])

  const allFacilities = facilities || []
  const demoUsers = allUsers || []
  const facilityUsers = realUsers || []

  const saveSetting = async (key: string, value: any) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      toast.success('Setting saved')
    } catch (e: any) { toast.error(e.message) }
  }

  const toggleUserActive = async (userId: string, currentActive: boolean, userName: string) => {
    try {
      await fetch(`/api/users?id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      })
      toast.success(`${userName} ${!currentActive ? 'enabled' : 'disabled'}`)
      refetchReal()
    } catch (e: any) { toast.error(e.message) }
  }

  const updateUserFacilities = async (userId: string, facilityId: string, currentFids: string, userName: string) => {
    const fids = currentFids.split(',').map(s => s.trim()).filter(Boolean)
    const next = fids.includes(facilityId)
      ? fids.filter(id => id !== facilityId)
      : [...fids, facilityId]
    try {
      await fetch(`/api/users?id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityIds: next.join(',') }),
      })
      toast.success(`Facility access updated for ${userName}`)
      refetchReal()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Demo Mode Control */}
      <Card className={demoMode ? 'border-amber-300 bg-amber-50' : ''}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Demo Mode Control
          </CardTitle>
          <CardDescription>Toggle demo access and manage which facilities demo accounts can see.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={demoMode} onChange={async (e) => {
              setDemoMode(e.target.checked)
              await saveSetting('demoMode', e.target.checked)
            }} className="h-4 w-4" />
            <span className="font-medium">Enable demo mode (allow demo logins + show quick-login buttons)</span>
          </label>
          <div className="text-xs text-muted-foreground">
            When <strong>OFF</strong>: demo accounts cannot log in at all. Facility accounts below are unaffected.
          </div>

          {demoMode && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">DEMO ACCOUNTS — CREDENTIALS &amp; ORGANIZATION ACCESS</div>
              <div className="text-[10px] text-muted-foreground">Edit username (email) and password for each demo account, and tick organizations they can access</div>
              <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
                {demoUsers.map(du => (
                  <DemoAccountRow key={du.id} user={du} facilities={allFacilities} organizations={organizations || []} onSaved={refetch} />
                ))}
                {demoUsers.length === 0 && <div className="p-3 text-xs text-muted-foreground text-center">No demo accounts.</div>}
              </div>

              <div className="border-t pt-2 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">GLOBAL DEMO ORGANIZATION FILTER (fallback)</div>
                <div className="text-[10px] text-muted-foreground mb-1">Tick organizations that demo accounts can access by default (applies to all demo accounts)</div>
                <div className="flex flex-wrap gap-3">
                  {(organizations || []).map(org => {
                    // An org is "checked" if ALL its facilities are in demoFacilityIds
                    const orgFacilityIds = (org.facilities || []).map((f: any) => f.id)
                    const allChecked = orgFacilityIds.length > 0 && orgFacilityIds.every((fid: string) => demoFacilityIds.includes(fid))
                    const someChecked = orgFacilityIds.some((fid: string) => demoFacilityIds.includes(fid))
                    return (
                      <label key={org.id} className="flex items-center gap-1.5 cursor-pointer text-xs p-1.5 rounded border hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                          onChange={e => {
                            if (e.target.checked) {
                              // Add all facilities in this org
                              const next = [...new Set([...demoFacilityIds, ...orgFacilityIds])]
                              setDemoFacilityIds(next)
                            } else {
                              // Remove all facilities in this org
                              setDemoFacilityIds(demoFacilityIds.filter(id => !orgFacilityIds.includes(id)))
                            }
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-medium">{org.name}</span>
                        <span className="text-[10px] text-muted-foreground">({orgFacilityIds.length} facilit{orgFacilityIds.length === 1 ? 'y' : 'ies'})</span>
                        {org.blocked && <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-700">Blocked</Badge>}
                      </label>
                    )
                  })}
                  {(!organizations || organizations.length === 0) && (
                    <span className="text-[10px] text-muted-foreground">No organizations configured</span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={async () => await saveSetting('demoFacilityIds', demoFacilityIds)}>
                  <Check className="h-3 w-3 mr-1" /> Save Global Filter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Org Type Management — edit default modules, label, description per business type */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" /> Org Type Management
              </CardTitle>
              <CardDescription>
                Edit the name, description, and default module set for each business type. Changes become the new default for all orgs of this type. You can also add custom business types.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setShowAddType(true); setNewTypeId(''); setNewTypeLabel('') }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add New Type
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Add new type form */}
          {showAddType && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-2">
              <div className="text-[10px] font-semibold text-muted-foreground">NEW BUSINESS TYPE</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Type ID * (lowercase, no spaces)</label>
                  <Input value={newTypeId} onChange={e => setNewTypeId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g. dental_clinic" className="text-xs h-8 font-mono" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Display Name *</label>
                  <Input value={newTypeLabel} onChange={e => setNewTypeLabel(e.target.value)} placeholder="e.g. Dental Clinic" className="text-xs h-8" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!newTypeId.trim() || !newTypeLabel.trim()} onClick={async () => {
                  try {
                    const res = await fetch('/api/business-types', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: newTypeId.trim(),
                        label: newTypeLabel.trim(),
                        description: '',
                        visibleModules: ['dashboard', 'residents', 'staff', 'settings', 'users'],
                        visibleCustomerFeatures: ['overview', 'history'],
                        labels: {},
                        hiddenCustomerFields: [],
                      }),
                    })
                    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                    toast.success(`Created business type "${newTypeLabel}"`)
                    setShowAddType(false)
                    setNewTypeId('')
                    setNewTypeLabel('')
                    refetchBusinessTypes()
                    // Auto-open the new type for editing
                    setEditingType(newTypeId.trim())
                    setEditTypeLabel(newTypeLabel.trim())
                    setEditTypeDesc('')
                    setTypeModuleOverrides({ ...typeModuleOverrides, [newTypeId.trim()]: ['dashboard', 'residents', 'staff', 'settings', 'users'] })
                    setTypeFeatureOverrides({ ...typeFeatureOverrides, [newTypeId.trim()]: ['overview', 'history'] })
                    setTypeLabelOverrides({ ...typeLabelOverrides, [newTypeId.trim()]: {} })
                  } catch (e: any) { toast.error(e.message) }
                }}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Create Type
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddType(false); setNewTypeId(''); setNewTypeLabel('') }}>Cancel</Button>
              </div>
            </div>
          )}

          {allBusinessTypes.map(bt => {
            const isEditing = editingType === bt.type
            // Get current modules: from edit state if editing, otherwise from the type definition
            const currentModules = isEditing
              ? (typeModuleOverrides[bt.type] || bt.visibleModules)
              : bt.visibleModules

            return (
              <div key={bt.type} className="border rounded-md p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    {isEditing ? (
                      <div className="space-y-1">
                        <Input value={editTypeLabel} onChange={e => setEditTypeLabel(e.target.value)} className="text-sm h-7 font-medium" placeholder="Display name" />
                        <Input value={editTypeDesc} onChange={e => setEditTypeDesc(e.target.value)} className="text-xs h-7" placeholder="Short description" />
                        <div className="text-[10px] text-muted-foreground font-mono">ID: {bt.type} {bt.isBuiltin && '(built-in)'}</div>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {bt.label}
                          {bt.isCustom && !bt.isBuiltin && <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">Custom</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{bt.description}</div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{currentModules.length} modules</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (isEditing) {
                          setEditingType(null)
                        } else {
                          setTypeModuleOverrides({ ...typeModuleOverrides, [bt.type]: bt.visibleModules })
                          setTypeFeatureOverrides({ ...typeFeatureOverrides, [bt.type]: bt.visibleCustomerFeatures })
                          setTypeLabelOverrides({ ...typeLabelOverrides, [bt.type]: bt.labels || {} })
                          // Load feature label overrides from settings
                          const featureLabelKey = `businessTypeFeatureLabels:${bt.type}`
                          const savedFeatureLabels = settings?.[featureLabelKey]
                          setTypeFeatureLabelOverrides({ ...typeFeatureLabelOverrides, [bt.type]: (savedFeatureLabels && typeof savedFeatureLabels === 'object') ? savedFeatureLabels : {} })
                          setEditTypeLabel(bt.label)
                          setEditTypeDesc(bt.description)
                          setEditingType(bt.type)
                        }
                      }}
                    >
                      {isEditing ? 'Cancel' : 'Edit'}
                    </Button>
                    {!bt.isBuiltin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600"
                        onClick={async () => {
                          if (!confirm(`Delete custom type "${bt.label}"?\n\nOrganizations using this type will fall back to nursing_home defaults.`)) return
                          try {
                            const res = await fetch(`/api/business-types?type=${encodeURIComponent(bt.type)}`, { method: 'DELETE' })
                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                            toast.success(`Deleted type "${bt.label}"`)
                            refetchBusinessTypes()
                          } catch (e: any) { toast.error(e.message) }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
                      {ALL_MODULES.map(m => {
                        const checked = (typeModuleOverrides[bt.type] || bt.visibleModules).includes(m.id)
                        const labelOverride = typeLabelOverrides[bt.type]?.[m.id] || ''
                        return (
                          <div key={m.id} className="flex items-center gap-1.5 text-xs p-1 rounded hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const current = typeModuleOverrides[bt.type] || bt.visibleModules
                                const next = e.target.checked
                                  ? [...current, m.id]
                                  : current.filter(id => id !== m.id)
                                setTypeModuleOverrides({ ...typeModuleOverrides, [bt.type]: next })
                              }}
                              className="h-3.5 w-3.5 flex-shrink-0"
                            />
                            <span className={`flex-shrink-0 ${checked ? '' : 'text-muted-foreground'}`}>{m.label}</span>
                            {checked && (
                              <input
                                type="text"
                                value={labelOverride}
                                onChange={e => {
                                  const currentLabels = typeLabelOverrides[bt.type] || {}
                                  const newLabels = { ...currentLabels }
                                  if (e.target.value) {
                                    newLabels[m.id] = e.target.value
                                  } else {
                                    delete newLabels[m.id]
                                  }
                                  setTypeLabelOverrides({ ...typeLabelOverrides, [bt.type]: newLabels })
                                }}
                                placeholder={m.label}
                                className="flex-1 min-w-0 border rounded px-1 py-0.5 text-[10px] h-6"
                                title="Custom label (leave blank for default)"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Custom Tabs section — select which custom tabs to associate with this business type */}
                    <div className="text-[10px] font-semibold text-muted-foreground mt-3 mb-1">CUSTOM TABS (tabs associated with this business type)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
                      {(globalTabsForType || []).map((t: any) => {
                        const tabTypes = t.businessTypes ? (() => { try { return JSON.parse(t.businessTypes) } catch { return null } })() : null
                        const checked = !tabTypes || (Array.isArray(tabTypes) && tabTypes.includes(bt.type))
                        return (
                          <div key={t.id} className="flex items-center gap-1.5 text-xs p-1 rounded hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={async (e) => {
                                // Update the tab's businessTypes to include/exclude this type
                                const current = tabTypes || []
                                const next = e.target.checked
                                  ? [...new Set([...current, bt.type])]
                                  : current.filter((t: string) => t !== bt.type)
                                try {
                                  await fetch(`/api/global-custom-tabs?id=${t.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ businessTypes: next.length > 0 ? next : null }),
                                  })
                                  toast.success(`${t.label} ${e.target.checked ? 'associated with' : 'removed from'} ${bt.label}`)
                                  refetchBusinessTypes()
                                } catch (e: any) { toast.error(e.message) }
                              }}
                              className="h-3.5 w-3.5 flex-shrink-0"
                            />
                            <span className={`flex-shrink-0 ${checked ? '' : 'text-muted-foreground'}`}>{t.label}</span>
                            <Badge variant="outline" className="text-[9px] text-blue-700 border-blue-300">{t.module}</Badge>
                          </div>
                        )
                      })}
                      {(!globalTabsForType || globalTabsForType.length === 0) && (
                        <p className="text-[10px] text-muted-foreground col-span-2">No custom tabs available. Create tabs in the Customization tab.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            // Save the full type definition via /api/business-types
                            // This makes the changes the new DEFAULT (not a "customized" override)
                            const res = await fetch('/api/business-types', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                type: bt.type,
                                label: editTypeLabel.trim() || bt.label,
                                description: editTypeDesc.trim(),
                                visibleModules: typeModuleOverrides[bt.type] || bt.visibleModules,
                                visibleCustomerFeatures: typeFeatureOverrides[bt.type] || bt.visibleCustomerFeatures,
                                labels: typeLabelOverrides[bt.type] || {},
                                hiddenCustomerFields: bt.hiddenCustomerFields || [],
                              }),
                            })
                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                            // Save feature label overrides
                            const featureLabelKey = `businessTypeFeatureLabels:${bt.type}`
                            const featureLabels = typeFeatureLabelOverrides[bt.type] || {}
                            await fetch('/api/settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ key: featureLabelKey, value: featureLabels }),
                            })
                            toast.success(`Saved "${editTypeLabel || bt.label}" as default for ${bt.type}`)
                            setEditingType(null)
                            refetchBusinessTypes()
                            refetch()
                          } catch (e: any) { toast.error(e.message) }
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Save as Default
                      </Button>
                      {bt.isBuiltin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!confirm(`Reset "${bt.label}" to its original built-in default?`)) return
                            try {
                              // Delete the custom definition to restore the built-in preset
                              await fetch(`/api/settings?key=${encodeURIComponent(`businessTypeDefinition:${bt.type}`)}`, { method: 'DELETE' })
                              await fetch(`/api/settings?key=${encodeURIComponent(`businessTypeModules:${bt.type}`)}`, { method: 'DELETE' })
                              await fetch(`/api/settings?key=${encodeURIComponent(`businessTypeFeatures:${bt.type}`)}`, { method: 'DELETE' })
                              await fetch(`/api/settings?key=${encodeURIComponent(`businessTypeModuleLabels:${bt.type}`)}`, { method: 'DELETE' })
                              await fetch(`/api/settings?key=${encodeURIComponent(`businessTypeFeatureLabels:${bt.type}`)}`, { method: 'DELETE' })
                              toast.success(`Reset "${bt.label}" to built-in default`)
                              setEditingType(null)
                              refetchBusinessTypes()
                              refetch()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                        >
                          Reset to Built-in Default
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-muted-foreground mb-1">Modules:</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {currentModules.map(id => {
                        const mod = ALL_MODULES.find(m => m.id === id)
                        return mod ? (
                          <span key={id} className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/30 text-muted-foreground">
                            {mod.label}
                          </span>
                        ) : null
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-1">Customer features:</div>
                    <div className="flex flex-wrap gap-1">
                      {bt.visibleCustomerFeatures.map((id: string) => {
                        const feat = ALL_CUSTOMER_FEATURES.find(f => f.id === id)
                        return feat ? (
                          <span key={id} className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700">
                            {feat.label}
                          </span>
                        ) : null
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Organization Management */}
      <Card className="border-red-200">
        <CardHeader className="bg-red-50/50 rounded-t-lg">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <Building2 className="h-4 w-4" /> Organization Management
              </CardTitle>
              <CardDescription className="mt-1">
                Organizations are top-level tenants. Each organization can have multiple facilities (branches). <strong>Blocking an organization disables ALL user accounts across ALL its facilities</strong> — they cannot log in until unblocked.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddOrg(!showAddOrg)}
              className="whitespace-nowrap"
            >
              <Plus className="h-4 w-4 mr-1" /> {showAddOrg ? 'Cancel' : 'Add Organization'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Add New Organization form */}
          {showAddOrg && (
            <div className="p-3 border-b bg-muted/30 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">NEW ORGANIZATION</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Organization Name *</label>
                  <Input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="e.g. Serenity Care Group" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Director / Owner Name</label>
                  <Input value={newOrgDirector} onChange={e => setNewOrgDirector(e.target.value)} placeholder="e.g. Dr. James Lim" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Phone</label>
                  <Input value={newOrgPhone} onChange={e => setNewOrgPhone(e.target.value)} placeholder="+60-3-XXXX XXXX" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Email</label>
                  <Input type="email" value={newOrgEmail} onChange={e => setNewOrgEmail(e.target.value)} placeholder="info@org.com" className="text-sm h-8" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Address</label>
                  <Input value={newOrgAddress} onChange={e => setNewOrgAddress(e.target.value)} placeholder="Street, City, State, Postal Code" className="text-sm h-8" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Business Type (determines which modules are visible)</label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={newOrgBusinessType} onChange={e => setNewOrgBusinessType(e.target.value)}>
                    {BUSINESS_TYPES.map(bt => <option key={bt.type} value={bt.type}>{bt.label}</option>)}
                  </select>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{BUSINESS_TYPES.find(bt => bt.type === newOrgBusinessType)?.description}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!newOrgName.trim()) { toast.error('Organization name is required'); return }
                    setAddingOrg(true)
                    try {
                      const res = await fetch('/api/organizations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          name: newOrgName.trim(),
                          address: newOrgAddress || undefined,
                          phone: newOrgPhone || undefined,
                          email: newOrgEmail || undefined,
                          director: newOrgDirector || undefined,
                          businessType: newOrgBusinessType,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
                      // Also save the business type as a setting so the module filter can read it
                      await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: `businessType:${data.id}`, value: newOrgBusinessType }),
                      })
                      toast.success(`Organization created: ${data.name} (${BUSINESS_TYPES.find(bt => bt.type === newOrgBusinessType)?.label})`)
                      setNewOrgName(''); setNewOrgAddress(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgDirector(''); setNewOrgBusinessType('nursing_home')
                      setShowAddOrg(false)
                      refetchOrgs()
                    } catch (e: any) {
                      toast.error(e.message)
                    }
                    setAddingOrg(false)
                  }}
                  disabled={addingOrg || !newOrgName.trim()}
                >
                  {addingOrg ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Creating...</> : <><Check className="h-3.5 w-3.5 mr-1" /> Create Organization</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddOrg(false); setNewOrgName(''); setNewOrgAddress(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgDirector('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Organization list */}
          {(!organizations || organizations.length === 0) ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No organizations configured. Click "Add Organization" to create one.</div>
          ) : (
            <div className="divide-y">
              {organizations.map((org: any) => {
                const allBlocked = org.blocked
                return (
                  <div key={org.id} className={`p-3 ${allBlocked ? 'bg-red-50/40' : ''}`}>
                    {/* Org header — text on top, buttons below on mobile; side-by-side on desktop */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Building2 className={`h-5 w-5 flex-shrink-0 ${allBlocked ? 'text-red-500' : 'text-primary'}`} />
                        <div className="min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            {org.name}
                            {allBlocked && (
                              <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700">
                                <Lock className="h-3 w-3 mr-0.5" /> Blocked
                              </Badge>
                            )}
                            {!allBlocked && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                                <CircleCheck className="h-3 w-3 mr-0.5" /> Active
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-300">
                              {BUSINESS_TYPES.find(bt => bt.type === (org.businessType || 'nursing_home'))?.label || org.businessType || 'Nursing Home'}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {org.facilities?.length || 0} facilit{(org.facilities?.length || 0) === 1 ? 'y' : 'ies'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {org.userCount} account(s) — {org.activeUserCount} active, {org.blockedUserCount} blocked
                            {org.director && <span className="ml-2">• Director: {org.director}</span>}
                          </div>
                        </div>
                      </div>
                      {/* Action buttons — wrap on mobile, stay inline on desktop */}
                      <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                        {/* Module access for this org */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2"
                          title="Select which modules this organization can access"
                          onClick={() => setShowOrgModules(showOrgModules === org.id ? null : org.id)}
                        >
                          <SettingsIcon className="h-3.5 w-3.5" />
                        </Button>
                        {/* Add facility to this org */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2"
                          title="Add facility to this organization"
                          onClick={() => { setShowAddFacilityForOrg(showAddFacilityForOrg === org.id ? null : org.id); setNewFacName(''); setNewFacAddress(''); setNewFacPhone(''); setNewFacDirector('') }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {/* Edit org */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2"
                          title="Edit organization details"
                          onClick={() => {
                            const newName = prompt('Organization name:', org.name)
                            if (newName === null) return
                            const newDirector = prompt('Director:', org.director || '')
                            if (newDirector === null) return
                            const newPhone = prompt('Phone:', org.phone || '')
                            if (newPhone === null) return
                            const newEmail = prompt('Email:', org.email || '')
                            if (newEmail === null) return
                            const newAddress = prompt('Address:', org.address || '')
                            if (newAddress === null) return
                            fetch(`/api/organizations?id=${org.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: newName, director: newDirector, phone: newPhone, email: newEmail, address: newAddress }),
                            }).then(r => r.json()).then(() => {
                              toast.success('Organization updated')
                              refetchOrgs()
                            }).catch(e => toast.error(e.message))
                          }}
                        >
                          <SettingsIcon className="h-3.5 w-3.5" />
                        </Button>
                        {/* Delete org */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2 text-red-600"
                          title="Delete organization"
                          onClick={async () => {
                            if (!confirm(`Delete "${org.name}"?\n\nThis can only be done if the organization has NO facilities assigned.`)) return
                            try {
                              const res = await fetch(`/api/organizations?id=${org.id}`, { method: 'DELETE' })
                              const data = await res.json()
                              if (!res.ok) throw new Error(data.error)
                              toast.success(`Deleted: ${org.name}`)
                              refetchOrgs()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {/* Block / Unblock entire org */}
                        <Button
                          size="sm"
                          variant={allBlocked ? 'outline' : 'destructive'}
                          className="h-8 text-xs font-medium"
                          disabled={org.userCount === 0}
                          onClick={async () => {
                            const verb = allBlocked ? 'Unblock' : 'Block'
                            if (!confirm(`⚠️ ${verb} organization "${org.name}"?\n\n${allBlocked ? 'All users across all facilities will regain login access.' : `ALL ${org.userCount} user(s) across ALL ${org.facilities?.length || 0} facilities will be unable to log in.`}`)) return
                            // When blocking, ask for a reason (for audit trail)
                            let blockedReason = null
                            if (!allBlocked) {
                              blockedReason = prompt(`Reason for blocking "${org.name}" (optional but recommended):\ne.g. "Non-payment", "Subscription cancelled", "Security concern"`)
                              // prompt returns null if user clicks Cancel — but we already confirmed above
                              if (blockedReason === null) blockedReason = ''
                            }
                            try {
                              const res = await fetch(`/api/organizations?id=${org.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ blocked: !allBlocked, blockedReason }),
                              })
                              if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                              toast.success(`${org.name} ${allBlocked ? 'unblocked' : 'blocked'} — ${org.userCount} account(s) ${allBlocked ? 'enabled' : 'disabled'}`)
                              refetchOrgs()
                              refetchReal()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                        >
                          {allBlocked ? (
                            <><Unlock className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">Unblock</span></>
                          ) : (
                            <><Lock className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">Block</span></>
                          )}
                        </Button>
                      </div>
                    </div>
                    {/* Drive Folder ID (per org) + Business Type (per org) — both inline-editable */}
                    <div className="ml-8 mt-1 flex items-center gap-3 text-xs flex-wrap">
                      {/* Business Type — inline dropdown, saves on change */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground whitespace-nowrap">Type:</span>
                        <select
                          value={org.businessType || 'nursing_home'}
                          className="font-mono text-[10px] border rounded px-1.5 py-0.5 bg-background"
                          onChange={async (e) => {
                            const newType = e.target.value
                            if (newType === (org.businessType || 'nursing_home')) return
                            try {
                              const res = await fetch(`/api/organizations?id=${org.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ businessType: newType }),
                              })
                              if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                              toast.success(`Organization type changed to "${BUSINESS_TYPES.find(bt => bt.type === newType)?.label}" for ${org.name}`)
                              refetchOrgs()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                        >
                          {BUSINESS_TYPES.map(bt => <option key={bt.type} value={bt.type}>{bt.label}</option>)}
                        </select>
                      </div>

                      {/* AI Enabled toggle — per org */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground whitespace-nowrap">AI:</span>
                        <button
                          onClick={async () => {
                            const newVal = !org.aiEnabled
                            if (newVal && !confirm(`Enable AI features for "${org.name}"?\n\nThe org Owner will then need to configure an API key in Settings → AI to start using the AI Assistant.`)) return
                            try {
                              const res = await fetch(`/api/organizations?id=${org.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ aiEnabled: newVal }),
                              })
                              if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
                              toast.success(`AI ${newVal ? 'enabled' : 'disabled'} for ${org.name}`)
                              refetchOrgs()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
                            org.aiEnabled
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                              : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                          }`}
                          title={org.aiEnabled ? 'AI is enabled — click to disable' : 'AI is disabled — click to enable'}
                        >
                          {org.aiEnabled ? '✓ Enabled' : 'Disabled'}
                        </button>
                      </div>
                    </div>

                    {/* ===== Subscription / Billing Management ===== */}
                    <div className="mt-2 ml-8 border rounded-md p-2 bg-muted/20 space-y-2">
                      <div className="text-[10px] font-semibold text-muted-foreground">SUBSCRIPTION & BILLING</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                        {/* Start date */}
                        <div>
                          <label className="text-muted-foreground block">Start Date</label>
                          <input type="date"
                            defaultValue={org.subscriptionStart ? new Date(org.subscriptionStart).toISOString().slice(0, 10) : ''}
                            className="w-full border rounded px-1 py-0.5 bg-background"
                            onBlur={async (e) => {
                              const val = e.target.value
                              const oldVal = org.subscriptionStart ? new Date(org.subscriptionStart).toISOString().slice(0, 10) : ''
                              if (val === oldVal) return
                              try {
                                await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionStart: val || null }) })
                                toast.success(`Start date ${val ? 'set' : 'cleared'} for ${org.name}`); refetchOrgs()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          />
                        </div>
                        {/* Plan */}
                        <div>
                          <label className="text-muted-foreground block">Plan</label>
                          <select
                            value={org.subscriptionPlan || ''}
                            className="w-full border rounded px-1 py-0.5 bg-background"
                            onChange={async (e) => {
                              try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionPlan: e.target.value || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <option value="">—</option>
                            <option value="TRIAL">Trial</option>
                            <option value="BASIC">Basic</option>
                            <option value="PRO">Pro</option>
                            <option value="ENTERPRISE">Enterprise</option>
                            <option value="CUSTOM">Custom</option>
                          </select>
                        </div>
                        {/* Amount */}
                        <div>
                          <label className="text-muted-foreground block">Amount (RM)</label>
                          <input type="number" step="0.01"
                            defaultValue={org.subscriptionAmount || ''}
                            className="w-full border rounded px-1 py-0.5 bg-background"
                            placeholder="0.00"
                            onBlur={async (e) => {
                              const val = parseFloat(e.target.value)
                              if (val === (org.subscriptionAmount || 0)) return
                              try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionAmount: val || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                            }}
                          />
                        </div>
                        {/* Frequency */}
                        <div>
                          <label className="text-muted-foreground block">Frequency</label>
                          <select
                            value={org.subscriptionFreq || ''}
                            className="w-full border rounded px-1 py-0.5 bg-background"
                            onChange={async (e) => {
                              try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionFreq: e.target.value || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <option value="">—</option>
                            <option value="MONTHLY">Monthly</option>
                            <option value="QUARTERLY">Quarterly</option>
                            <option value="YEARLY">Yearly</option>
                            <option value="ONE_TIME">One-time</option>
                          </select>
                        </div>
                        {/* Status */}
                        <div>
                          <label className="text-muted-foreground block">Status</label>
                          <select
                            value={org.subscriptionStatus || ''}
                            className={`w-full border rounded px-1 py-0.5 bg-background ${
                              org.subscriptionStatus === 'ACTIVE' ? 'text-emerald-600' :
                              org.subscriptionStatus === 'TRIAL' ? 'text-blue-600' :
                              org.subscriptionStatus === 'PAST_DUE' ? 'text-amber-600' :
                              org.subscriptionStatus === 'SUSPENDED' ? 'text-red-600' : ''
                            }`}
                            onChange={async (e) => {
                              try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionStatus: e.target.value || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <option value="">—</option>
                            <option value="ACTIVE">Active</option>
                            <option value="TRIAL">Trial</option>
                            <option value="PAST_DUE">Past Due</option>
                            <option value="SUSPENDED">Suspended</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        </div>
                        {/* Next payment date */}
                        <div>
                          <label className="text-muted-foreground block">Next Payment</label>
                          <input type="date"
                            defaultValue={org.nextPaymentDate ? new Date(org.nextPaymentDate).toISOString().slice(0, 10) : ''}
                            className="w-full border rounded px-1 py-0.5 bg-background"
                            onBlur={async (e) => {
                              const val = e.target.value
                              const oldVal = org.nextPaymentDate ? new Date(org.nextPaymentDate).toISOString().slice(0, 10) : ''
                              if (val === oldVal) return
                              try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextPaymentDate: val || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                            }}
                          />
                        </div>
                      </div>
                      {/* Notes */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground whitespace-nowrap">Notes:</span>
                        <input type="text"
                          defaultValue={org.subscriptionNotes || ''}
                          className="flex-1 border rounded px-1.5 py-0.5 bg-background text-[10px]"
                          placeholder="e.g. Custom pricing, payment terms, special arrangements..."
                          onBlur={async (e) => {
                            const val = e.target.value.trim()
                            if (val === (org.subscriptionNotes || '')) return
                            try { await fetch(`/api/organizations?id=${org.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionNotes: val || null }) }); refetchOrgs() } catch (e: any) { toast.error(e.message) }
                          }}
                        />
                      </div>
                      {/* Block info display */}
                      {org.blocked && (
                        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5">
                          ⛔ Access withheld
                          {org.blockedByName && <> by <strong>{org.blockedByName}</strong></>}
                          {org.blockedAt && <> on {new Date(org.blockedAt).toLocaleDateString()}</>}
                          {org.blockedReason && <> — {org.blockedReason}</>}
                        </div>
                      )}
                    </div>

                    {/* Add facility form (inline) */}
                    {showAddFacilityForOrg === org.id && (
                      <div className="mt-2 ml-8 p-2 border rounded bg-muted/30 space-y-2">
                        <div className="text-[10px] font-semibold text-muted-foreground">ADD FACILITY TO {org.name.toUpperCase()}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input value={newFacName} onChange={e => setNewFacName(e.target.value)} placeholder="Facility name *" className="text-xs h-7" />
                          <Input value={newFacDirector} onChange={e => setNewFacDirector(e.target.value)} placeholder="Director" className="text-xs h-7" />
                          <Input value={newFacPhone} onChange={e => setNewFacPhone(e.target.value)} placeholder="Phone" className="text-xs h-7" />
                          <Input value={newFacAddress} onChange={e => setNewFacAddress(e.target.value)} placeholder="Address" className="text-xs h-7" />
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[10px]" disabled={addingFac || !newFacName.trim()} onClick={async () => {
                            setAddingFac(true)
                            try {
                              const res = await fetch('/api/facilities', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newFacName.trim(), address: newFacAddress, phone: newFacPhone, director: newFacDirector, organizationId: org.id }),
                              })
                              const data = await res.json()
                              if (!res.ok) throw new Error(data.error)
                              toast.success(`Facility added: ${data.name}`)
                              setNewFacName(''); setNewFacAddress(''); setNewFacPhone(''); setNewFacDirector('')
                              setShowAddFacilityForOrg(null)
                              refetchOrgs()
                            } catch (e: any) { toast.error(e.message) }
                            setAddingFac(false)
                          }}>
                            {addingFac ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                            Add Facility
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowAddFacilityForOrg(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {/* Module access picker for this org */}
                    {showOrgModules === org.id && (
                      <OrgModulePicker orgId={org.id} orgName={org.name} settings={settings} businessType={org.businessType} onSaved={() => { refetchOrgs(); refetch() }} />
                    )}

                    {/* Facilities under this org */}
                    {org.facilities && org.facilities.length > 0 && (
                      <div className="mt-2 ml-8 space-y-1">
                        {org.facilities.map((f: any) => (
                          <div key={f.id} className="flex items-center gap-2 text-xs p-1.5 rounded border bg-background">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{f.name}</span>
                            {f.director && <span className="text-muted-foreground">• {f.director}</span>}
                            {f.address && <span className="text-muted-foreground truncate">• {f.address}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organization User Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Organization User Accounts
          </CardTitle>
          <CardDescription>
            Real user accounts (org owners, managers, staff, family). Enable or disable login access, and manage facility assignments.
            {facilityUsers.length > 0 && ` ${facilityUsers.length} account(s) total.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {realLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading user accounts...</div>
          ) : facilityUsers.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No organization user accounts. Create accounts from Staff or Residents modules.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Role</th>
                    <th className="text-left p-2 font-medium">Organization</th>
                    <th className="text-left p-2 font-medium">Facility Access</th>
                    <th className="text-center p-2 font-medium">Status</th>
                    <th className="text-center p-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {facilityUsers.map(u => {
                    // Resolve the user's organization
                    const userOrgFids = (u.facilityIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                    const userOrg = organizations?.find((org: any) =>
                      org.facilities?.some((f: any) => userOrgFids.includes(f.id))
                    ) || organizations?.find((org: any) => org.id === u.organizationId)
                    const orgFacilities = userOrg?.facilities || allFacilities
                    return (
                      <tr key={u.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          {u.code && <span className="text-[10px] font-mono text-primary block">{u.code}</span>}
                          <span className="font-medium">{u.name}</span>
                        </td>
                        <td className="p-2 text-xs font-mono">{u.email}</td>
                        <td className="p-2"><Badge variant="outline" className="text-xs">{u.role}</Badge></td>
                        <td className="p-2 text-xs">
                          {userOrg ? (
                            <span className="font-medium">{userOrg.name}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {orgFacilities.map((f: any) => {
                              const fids = (u.facilityIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                              const hasAccess = fids.includes(f.id) || u.level <= 1
                              return (
                                <label key={f.id} className="flex items-center gap-0.5 cursor-pointer text-[10px]" title={f.name}>
                                  <input
                                    type="checkbox"
                                    checked={hasAccess}
                                    disabled={u.level <= 1}
                                    onChange={() => updateUserFacilities(u.id, f.id, u.facilityIds || '', u.name)}
                                    className="h-2.5 w-2.5"
                                  />
                                  <span className="truncate max-w-[80px]">{f.name}</span>
                                </label>
                              )
                            })}
                            {orgFacilities.length === 0 && <span className="text-[10px] text-muted-foreground">No facilities</span>}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant={u.active ? 'outline' : 'secondary'} className={`text-xs ${u.active ? 'text-emerald-600' : 'text-red-600'}`}>
                            {u.active ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <Button
                            size="sm"
                            variant={u.active ? 'ghost' : 'outline'}
                            className={`h-7 text-xs ${u.active ? 'text-red-600' : 'text-emerald-600'}`}
                            onClick={() => toggleUserActive(u.id, u.active, u.name)}
                          >
                            {u.active ? 'Disable' : 'Enable'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ CUSTOMIZATION TAB ============
function CustomizationTab() {
  const [subTab, setSubTab] = useState<'fields' | 'tabs'>('fields')

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b pb-px">
        <button onClick={() => setSubTab('fields')} className={`px-4 py-2 text-sm border-b-2 ${subTab === 'fields' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          <ListChecks className="h-3.5 w-3.5 inline mr-1" /> Custom Fields
        </button>
        <button onClick={() => setSubTab('tabs')} className={`px-4 py-2 text-sm border-b-2 ${subTab === 'tabs' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          <Layers className="h-3.5 w-3.5 inline mr-1" /> Custom Tabs
        </button>
      </div>

      {subTab === 'fields' && <GlobalCustomFieldLibrary />}
      {subTab === 'tabs' && <GlobalCustomTabLibrary />}
    </div>
  )
}

// ============ GLOBAL CUSTOM FIELD LIBRARY ============
function GlobalCustomFieldLibrary() {
  const { data: globalFields, loading, refetch } = useFetch<any[]>('/api/global-custom-fields?includeOrgCount=true')
  const [showAdd, setShowAdd] = useState(false)
  const [editField, setEditField] = useState<any | null>(null)
  const [form, setForm] = useState<any>({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', description: '', businessTypes: [] as string[] })
  const [saving, setSaving] = useState(false)

  const moveField = async (id: string, direction: 'up' | 'down') => {
    const fields = globalFields || []
    const idx = fields.findIndex(f => f.id === id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= fields.length) return
    try {
      await fetch(`/api/global-custom-fields?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: fields[newIdx].sortOrder }) })
      await fetch(`/api/global-custom-fields?id=${fields[newIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: fields[idx].sortOrder }) })
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  const TYPE_LABELS: Record<string, string> = {
    TEXT: 'Text', NUMBER: 'Number', DATE: 'Date', SELECT: 'Dropdown', TEXTAREA: 'Long Text', REFERENCE: 'Reference',
  }
  const ENTITY_LABELS: Record<string, string> = {
    resident: 'Customer', invoice: 'Invoice', product: 'Product', staff: 'Staff',
  }

  const submit = async () => {
    if (!form.label.trim()) { toast.error('Label required'); return }
    setSaving(true)
    try {
      const payload: any = {
        label: form.label.trim(),
        type: form.type,
        unit: form.unit || null,
        required: form.required,
        description: form.description || null,
      }
      if (form.type === 'SELECT' && form.options) {
        payload.options = form.options.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      if (form.type === 'REFERENCE') {
        payload.referenceEntity = form.referenceEntity || null
      }
      payload.businessTypes = form.businessTypes || null
      if (editField) {
        const r = await fetch(`/api/global-custom-fields?id=${editField.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
        toast.success('Global field updated')
      } else {
        const r = await fetch('/api/global-custom-fields', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
        toast.success('Global field created — available to all orgs')
      }
      setShowAdd(false); setEditField(null)
      setForm({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', description: '', businessTypes: [] })
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Global Custom Field Library
            </CardTitle>
            <CardDescription className="mt-1">
              Master field definitions available to all organizations. Each org selects which fields to enable and can rename them locally.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setEditField(null); setForm({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', description: '', businessTypes: [] }) }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Global Field
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <Skeleton className="h-20" />
        ) : (globalFields || []).length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No global fields defined yet.</p>
            <p className="text-xs mt-1">Click "Add Global Field" to create fields that all orgs can use.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {(globalFields || []).map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {f.label}
                    {f.unit && <Badge variant="outline" className="text-[10px]">{f.unit}</Badge>}
                    {f.required && <Badge variant="outline" className="text-[10px] text-amber-700">Required</Badge>}
                    <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">{f.orgCount || 0} org{(f.orgCount || 0) === 1 ? '' : 's'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {TYPE_LABELS[f.type] || f.type}
                    {f.type === 'REFERENCE' && f.referenceEntity && <span> → {ENTITY_LABELS[f.referenceEntity] || f.referenceEntity}</span>}
                    {' • '}key: <code className="text-[10px]">{f.key}</code>
                    {f.options && <span> • Options: {JSON.parse(f.options).join(', ')}</span>}
                    {f.description && <span> • {f.description}</span>}
                  </div>
                </div>
                <div className="flex flex-col flex-shrink-0">
                  <button onClick={() => moveField(f.id, 'up')} disabled={(globalFields || []).indexOf(f) === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => moveField(f.id, 'down')} disabled={(globalFields || []).indexOf(f) === (globalFields || []).length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                  setEditField(f)
                  setForm({ label: f.label, type: f.type, options: f.options ? JSON.parse(f.options).join(', ') : '', unit: f.unit || '', required: f.required, referenceEntity: f.referenceEntity || '', description: f.description || '', businessTypes: f.businessTypes ? (() => { try { return JSON.parse(f.businessTypes) } catch { return [] } })() : [] })
                  setShowAdd(true)
                }}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={async () => {
                  if (!confirm(`Delete global field "${f.label}"?\n\nThis removes it from all orgs that have enabled it.`)) return
                  try {
                    const r = await fetch(`/api/global-custom-fields?id=${f.id}`, { method: 'DELETE' })
                    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error)
                    toast.success(`Deleted: ${f.label}`)
                    refetch()
                  } catch (e: any) { toast.error(e.message) }
                }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30 mt-2">
            <div className="text-xs font-semibold text-muted-foreground">{editField ? 'EDIT GLOBAL FIELD' : 'NEW GLOBAL FIELD'}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Label *</label>
                <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Blood Type" className="text-sm h-8" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Type</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="SELECT">Dropdown</option>
                  <option value="TEXTAREA">Long Text</option>
                  <option value="REFERENCE">Reference (link to another record)</option>
                </select>
              </div>
              {form.type === 'SELECT' && (
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Options (comma-separated)</label>
                  <Input value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} placeholder="A+, B+, O+" className="text-sm h-8" />
                </div>
              )}
              {form.type === 'REFERENCE' && (
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Links To *</label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={form.referenceEntity} onChange={e => setForm({ ...form, referenceEntity: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="product">Product</option>
                    <option value="staff">Staff</option>
                    <option value="resident">Customer / Resident</option>
                    <option value="invoice">Invoice</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Unit (optional)</label>
                <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="cm, kg" className="text-sm h-8" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Description (optional)</label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notes about this field" className="text-sm h-8" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="h-4 w-4" />
                  <span className="text-xs">Required</span>
                </label>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Business Types (leave all unchecked = all types)</label>
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_TYPES.map(bt => (
                    <label key={bt.type} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.businessTypes?.includes(bt.type) || false}
                        onChange={e => {
                          const cur = form.businessTypes || []
                          const next = e.target.checked ? [...cur, bt.type] : cur.filter((t: string) => t !== bt.type)
                          setForm({ ...form, businessTypes: next })
                        }}
                        className="h-3.5 w-3.5"
                      />
                      {bt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={saving || !form.label.trim() || (form.type === 'REFERENCE' && !form.referenceEntity)}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Check className="h-3.5 w-3.5 mr-1" /> {editField ? 'Update' : 'Create'} Global Field</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setEditField(null); setForm({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', description: '', businessTypes: [] }) }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============ GLOBAL CUSTOM TAB LIBRARY ============
function GlobalCustomTabLibrary() {
  const { data: globalTabs, loading, refetch } = useFetch<any[]>('/api/global-custom-tabs')
  const { data: globalFields } = useFetch<any[]>('/api/global-custom-fields')
  const [showAdd, setShowAdd] = useState(false)
  const [editTab, setEditTab] = useState<any | null>(null)
  const [form, setForm] = useState<any>({ label: '', description: '', fields: [], module: 'resident', enableVersioning: false, businessTypes: [] as string[] })
  const [saving, setSaving] = useState(false)

  const moveTab = async (id: string, direction: 'up' | 'down') => {
    const tabs = globalTabs || []
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= tabs.length) return
    try {
      await fetch(`/api/global-custom-tabs?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: tabs[newIdx].sortOrder }) })
      await fetch(`/api/global-custom-tabs?id=${tabs[newIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: tabs[idx].sortOrder }) })
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }
  // Built-in customer fields that can be included in custom tabs
  const BUILTIN_FIELDS = [
    { id: 'firstName', label: 'First Name' },
    { id: 'lastName', label: 'Last Name' },
    { id: 'dateOfBirth', label: 'Date of Birth' },
    { id: 'gender', label: 'Gender' },
    { id: 'icPassportNumber', label: 'IC / Passport No.' },
    { id: 'admissionDate', label: 'Admission Date' },
    { id: 'dischargeDate', label: 'Discharge Date' },
    { id: 'allergies', label: 'Allergies' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'dietaryNeeds', label: 'Dietary Needs' },
    { id: 'emergencyContactName', label: 'Emergency Contact Name' },
    { id: 'emergencyContactPhone', label: 'Emergency Contact Phone' },
    { id: 'emergencyContactRelation', label: 'Emergency Contact Relationship' },
    { id: 'roomNumber', label: 'Room Number' },
    { id: 'notes', label: 'Notes' },
  ]

  const allAvailableFields = [
    ...BUILTIN_FIELDS,
    ...(globalFields || []).map((f: any) => ({ id: f.id, label: f.label + ' (custom)' })),
  ]

  const submit = async () => {
    if (!form.label.trim()) { toast.error('Label required'); return }
    if (form.fields.length === 0) { toast.error('Select at least one field'); return }
    setSaving(true)
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description || null,
        fields: form.fields,
        module: form.module || 'resident',
        enableVersioning: form.enableVersioning || false,
        businessTypes: form.businessTypes || null,
      }
      if (editTab) {
        const r = await fetch(`/api/global-custom-tabs?id=${editTab.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
        toast.success('Custom tab updated')
      } else {
        const r = await fetch('/api/global-custom-tabs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
        toast.success('Custom tab created — enabled for all orgs')
      }
      setShowAdd(false); setEditTab(null)
      setForm({ label: '', description: '', fields: [], module: 'resident', enableVersioning: false, businessTypes: [] })
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Custom Tabs
            </CardTitle>
            <CardDescription className="mt-1">
              Create custom tabs for the customer detail view. Each tab is a collection of fields (built-in + custom). Saved globally and applied to all orgs.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setEditTab(null); setForm({ label: '', description: '', fields: [], module: 'resident', enableVersioning: false, businessTypes: [] }) }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Custom Tab
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <Skeleton className="h-20" />
        ) : (globalTabs || []).length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No custom tabs defined yet.</p>
            <p className="text-xs mt-1">Create a tab to group fields together in the customer detail view.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {(globalTabs || []).map((t: any) => {
              const fieldIds = JSON.parse(t.fields || '[]')
              const fieldLabels = fieldIds.map((id: string) => {
                const f = allAvailableFields.find(af => af.id === id)
                return f ? f.label : id
              })
              return (
                <div key={t.id} className="flex items-center gap-3 p-2 border rounded-md">
                  <div className="flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {t.label}
                      <Badge variant="outline" className="text-[10px]">{fieldIds.length} field{fieldIds.length === 1 ? '' : 's'}</Badge>
                      <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">module: {t.module}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fieldLabels.join(', ')}
                      {t.description && <span> • {t.description}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col flex-shrink-0">
                    <button onClick={() => moveTab(t.id, 'up')} disabled={(globalTabs || []).indexOf(t) === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => moveTab(t.id, 'down')} disabled={(globalTabs || []).indexOf(t) === (globalTabs || []).length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                    setEditTab(t)
                    setForm({ label: t.label, description: t.description || '', fields: JSON.parse(t.fields || '[]'), module: t.module || 'resident', enableVersioning: t.enableVersioning || false, businessTypes: t.businessTypes ? (() => { try { return JSON.parse(t.businessTypes) } catch { return [] } })() : [] })
                    setShowAdd(true)
                  }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={async () => {
                    if (!confirm(`Delete custom tab "${t.label}"?`)) return
                    try {
                      await fetch(`/api/global-custom-tabs?id=${t.id}`, { method: 'DELETE' })
                      toast.success(`Deleted: ${t.label}`)
                      refetch()
                    } catch (e: any) { toast.error(e.message) }
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {showAdd && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30 mt-2">
            <div className="text-xs font-semibold text-muted-foreground">{editTab ? 'EDIT CUSTOM TAB' : 'NEW CUSTOM TAB'}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Tab Name *</label>
                <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Measurements" className="text-sm h-8" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Module</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={form.module} onChange={e => setForm({ ...form, module: e.target.value })}>
                  {ALL_MODULES
                    .filter(m => m.id !== 'settings' && m.id !== 'developer')
                    .map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Description (optional)</label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this tab shows" className="text-sm h-8" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-md hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={form.enableVersioning}
                    onChange={e => setForm({ ...form, enableVersioning: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="text-sm font-medium">Enable version history</div>
                    <div className="text-[10px] text-muted-foreground">Each save creates a timestamped snapshot of all field values. Users can view how the values changed over time (e.g. body measurements, health metrics). Recommended for tabs tracking changing data.</div>
                  </div>
                </label>
              </div>
              <div className="col-span-2 mt-2">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Business Types (leave all unchecked = all types)</label>
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_TYPES.map(bt => (
                    <label key={bt.type} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.businessTypes?.includes(bt.type) || false}
                        onChange={e => {
                          const cur = form.businessTypes || []
                          const next = e.target.checked ? [...cur, bt.type] : cur.filter((t: string) => t !== bt.type)
                          setForm({ ...form, businessTypes: next })
                        }}
                        className="h-3.5 w-3.5"
                      />
                      {bt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Fields to include in this tab *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto border rounded p-2 bg-background">
                {allAvailableFields.map(f => (
                  <label key={f.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={form.fields.includes(f.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setForm({ ...form, fields: [...form.fields, f.id] })
                        } else {
                          setForm({ ...form, fields: form.fields.filter((id: string) => id !== f.id) })
                        }
                      }}
                      className="h-3.5 w-3.5 flex-shrink-0"
                    />
                    <span className="flex-shrink-0">{f.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{form.fields.length} field(s) selected</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={saving || !form.label.trim() || form.fields.length === 0}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Check className="h-3.5 w-3.5 mr-1" /> {editTab ? 'Update' : 'Create'} Tab</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setEditTab(null); setForm({ label: '', description: '', fields: [], module: 'resident', enableVersioning: false, businessTypes: [] }) }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// ============ DISK SPACE & CLEANUP CARD ============
function DiskSpaceCard() {
  const [info, setInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<any>(null)
  const [cleanLogs, setCleanLogs] = useState(false)

  const loadInfo = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/cleanup', { cache: 'no-store' })
      const data = await r.json()
      setInfo(data)
    } catch (e: any) {
      toast.error('Failed to load disk info')
    }
    setLoading(false)
  }

  useEffect(() => { loadInfo() }, [])

  const handleCleanup = async () => {
    if (!confirm(
      `Clean up temporary files?\n\n` +
      `This will delete:\n` +
      `  • Old build artifacts in /tmp\n` +
      `  • Old backup files in /tmp\n` +
      `  • Next.js build cache (.next/cache)\n` +
      (cleanLogs ? `  • Log files\n` : '') +
      `\nYour database and application data will NOT be affected.`
    )) return

    setCleaning(true)
    setCleanResult(null)
    try {
      const r = await fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp: true, next: true, logs: cleanLogs }),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || 'Cleanup failed')
      setCleanResult(result)
      toast.success(`Cleaned ${result.deletedCount} items, freed ${result.freedMB} MB`)
      // Reload disk info
      loadInfo()
    } catch (e: any) {
      toast.error(e.message)
    }
    setCleaning(false)
  }

  if (loading) return <Card><CardContent className="p-4"><Skeleton className="h-32" /></CardContent></Card>

  const disk = info?.disk || {}
  const usePercentNum = parseInt(disk.usePercent?.replace('%', '') || '0')
  const diskColor = usePercentNum > 90 ? 'text-red-600' : usePercentNum > 70 ? 'text-amber-600' : 'text-emerald-600'
  const mem = info?.memory || {}

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4" /> Disk Space & Cleanup
        </CardTitle>
        <CardDescription>Monitor disk usage and clean up temporary files to prevent deployment failures.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Disk usage bar */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Disk Usage</span>
            <span className={`font-bold ${diskColor}`}>{disk.usePercent} used</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${usePercentNum > 90 ? 'bg-red-500' : usePercentNum > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(usePercentNum, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Used: {disk.used}</span>
            <span>Available: <span className={diskColor === 'text-red-600' ? 'font-bold text-red-600' : 'font-medium'}>{disk.available}</span></span>
            <span>Total: {disk.total}</span>
          </div>
        </div>

        {/* Space breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border p-2.5 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Database className="h-3 w-3" /> Database</div>
            <div className="font-bold text-sm mt-0.5">{info?.dbSizeMB || '?'} MB</div>
          </div>
          <div className="rounded-md border p-2.5 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><HardDrive className="h-3 w-3" /> Build Cache</div>
            <div className="font-bold text-sm mt-0.5">{info?.nextCacheSizeMB || '?'} MB</div>
          </div>
          <div className="rounded-md border p-2.5 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><FileArchive className="h-3 w-3" /> Temp Files</div>
            <div className="font-bold text-sm mt-0.5">{info?.tempTotalSizeMB || '0'} MB</div>
            {info?.tempFiles?.length > 0 && <div className="text-[10px] text-muted-foreground">{info.tempFiles.length} files</div>}
          </div>
          <div className="rounded-md border p-2.5 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Server className="h-3 w-3" /> Memory</div>
            <div className="font-bold text-sm mt-0.5">{mem.used} / {mem.total}</div>
            <div className="text-[10px] text-muted-foreground">{mem.usePercent} used</div>
          </div>
        </div>

        {/* Temp files list */}
        {info?.tempFiles?.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-1.5 font-medium">File/Dir</th>
                  <th className="text-right p-1.5 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {info.tempFiles.slice(0, 20).map((f: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5 truncate max-w-48">{f.name}</td>
                    <td className="p-1.5 text-right">{(f.size / 1024 / 1024).toFixed(1)} MB</td>
                  </tr>
                ))}
                {info.tempFiles.length > 20 && (
                  <tr><td colSpan={2} className="p-1.5 text-center text-muted-foreground">...and {info.tempFiles.length - 20} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Cleanup options */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="clean-logs"
              checked={cleanLogs}
              onChange={e => setCleanLogs(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="clean-logs" className="text-sm text-muted-foreground cursor-pointer">Also delete log files (*.log)</label>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleCleanup} disabled={cleaning} variant={usePercentNum > 80 ? 'default' : 'outline'}>
              {cleaning ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cleaning...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Clean Temp Files</>
              )}
            </Button>
            <Button onClick={loadInfo} disabled={loading} variant="ghost" size="sm">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>

          {/* Cleanup result */}
          {cleanResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-1">
              <div className="font-medium text-emerald-800 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Cleanup complete — freed {cleanResult.freedMB} MB
              </div>
              <div className="text-xs text-emerald-700">Deleted {cleanResult.deletedCount} items. Disk now: {cleanResult.diskAfter?.used} used, {cleanResult.diskAfter?.available} available ({cleanResult.diskAfter?.usePercent})</div>
              {cleanResult.details?.length > 0 && (
                <details className="mt-1">
                  <summary className="text-xs cursor-pointer text-emerald-700">View details ({cleanResult.details.length} items)</summary>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {cleanResult.details.map((d: string, i: number) => <div key={i}>{d}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Warning if disk is nearly full */}
        {usePercentNum > 85 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Warning:</strong> Disk is {usePercentNum}% full. This can cause deployment failures and data corruption.
              Please clean up temporary files or download a backup and delete old data.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============ DEMO MODE CARD ============
function DemoModeCard() {
  const { data: settings, refetch: refetchSettings } = useFetch<any>('/api/settings')
  const { data: demoUsers, refetch: refetchDemoUsers } = useFetch<any[]>('/api/users?demoOnly=true')
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const [demoMode, setDemoMode] = useState(false)
  const [demoFacilityIds, setDemoFacilityIds] = useState<string[]>([])

  useEffect(() => {
    if (settings) {
      setDemoMode(settings.demoMode || false)
      setDemoFacilityIds(settings.demoFacilityIds || [])
    }
  }, [settings])

  const saveSetting = async (key: string, value: any) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      toast.success('Setting saved')
      refetchSettings()
    } catch (e: any) { toast.error(e.message) }
  }

  const allFacilities = facilities || []

  return (
    <Card className={demoMode ? 'border-amber-300 bg-amber-50' : ''}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Demo Mode
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Developer Only</Badge>
        </CardTitle>
        <CardDescription>Control demo account access, facility visibility, and toggle demo logins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={demoMode} onChange={async (e) => {
            setDemoMode(e.target.checked)
            await saveSetting('demoMode', e.target.checked)
          }} className="h-4 w-4" />
          <span className="font-medium">Enable demo mode (show quick-login buttons + allow demo logins)</span>
        </label>
        <div className="text-xs text-muted-foreground">
          When <strong>OFF</strong>: demo buttons hidden AND demo accounts cannot log in at all.
        </div>

        {demoMode && (
          <>
            {/* Demo accounts list with per-account facility access */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground">DEMO ACCOUNTS</div>
                <div className="text-[10px] text-muted-foreground">Tick facilities each demo account can access</div>
              </div>
              <div className="border rounded-md divide-y">
                {(demoUsers || []).map(du => (
                  <div key={du.id} className="p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{du.role}</Badge>
                      <span className="font-medium text-xs">{du.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{du.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-1">
                      {allFacilities.map(f => {
                        const userFids = (du.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
                        const checked = userFids.includes(f.id)
                        return (
                          <label key={f.id} className="flex items-center gap-1 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={async (e) => {
                                const current = (du.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
                                const next = e.target.checked
                                  ? [...new Set([...current, f.id])]
                                  : current.filter(id => id !== f.id)
                                try {
                                  await fetch(`/api/users?id=${du.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ facilityIds: next.join(',') }),
                                  })
                                  toast.success(`Updated facility access for ${du.name}`)
                                  refetchDemoUsers()
                                } catch (err: any) { toast.error(err.message) }
                              }}
                              className="h-3 w-3"
                            />
                            <span>{f.name}</span>
                          </label>
                        )
                      })}
                      {allFacilities.length === 0 && <span className="text-[10px] text-muted-foreground">No facilities configured</span>}
                    </div>
                  </div>
                ))}
                {(demoUsers || []).length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">No demo accounts found.</div>
                )}
              </div>
            </div>

            {/* Global demo facility filter */}
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">GLOBAL DEMO FACILITY FILTER (fallback)</div>
              <div className="text-xs text-muted-foreground">
                Applies to demo accounts with no specific facility access set above. Leave unchecked for all facilities.
              </div>
              <div className="flex flex-wrap gap-3">
                {allFacilities.map(f => (
                  <label key={f.id} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={demoFacilityIds.includes(f.id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...demoFacilityIds, f.id]
                          : demoFacilityIds.filter(id => id !== f.id)
                        setDemoFacilityIds(next)
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span>{f.name}</span>
                  </label>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={async () => {
                await saveSetting('demoFacilityIds', demoFacilityIds)
              }}><Check className="h-3 w-3 mr-1" /> Save Global Filter</Button>
            </div>
          </>
        )}

        <div className="text-xs text-amber-700 bg-amber-100 border border-amber-300 rounded p-2">
          ⚠ <strong>To go live:</strong> Turn this OFF. Demo accounts will be blocked from logging in entirely.
        </div>
      </CardContent>
    </Card>
  )
}
