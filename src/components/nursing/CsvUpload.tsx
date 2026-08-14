'use client'

import { useState, useRef, useMemo } from 'react'
import { useEscClose } from './useEscClose'
import { Button } from '@/components/ui/button'
import { parseCsvWithHeaders, toCsv, downloadCsv } from '@/lib/csv'
import { Upload, FileText, Download, CheckCircle, AlertCircle, Loader2, ArrowRight, Wand2, Undo2, Link2 } from 'lucide-react'
import { toast } from 'sonner'

export interface CsvColumn {
  key: string       // field name in the model
  label: string     // display label
  required?: boolean
  // transform value from CSV string to model value
  transform?: (val: string) => any
  // validation: returns error message if invalid, null if OK
  validate?: (val: any, row: Record<string, any>) => string | null
  // alternative names / aliases for auto-detection (in addition to label)
  aliases?: string[]
}

interface CsvUploadProps {
  title: string
  columns: CsvColumn[]
  templateRows: Record<string, any>[]   // sample data for template download
  /**
   * Called with mapped + validated rows. Should return success/failed counts
   * and a list of per-row errors. The framework wraps this in a batchId
   * tracking + undo capability — the caller doesn't need to manage batchId.
   */
  onImport: (rows: any[], batchId: string) => Promise<{ success: number; failed: number; errors: string[] }>
  /**
   * Optional: undo a previous import by batchId. If provided, the dialog
   * shows an "Undo last import" button. Should delete all rows with the
   * given batchId.
   */
  onUndo?: (batchId: string) => Promise<{ success: boolean; deleted: number; error?: string }>
  /** Optional: last batchId (so we can offer "undo" without a server roundtrip) */
  lastBatchId?: string | null
  /** Optional: count of records in the last batch (shown on the undo button) */
  lastBatchCount?: number
  onClose: () => void
  onSaved: () => void
}

type Stage = 'select' | 'mapping' | 'preview' | 'importing' | 'done'

/**
 * Generate a unique batch ID for this import session.
 * Format: IMP-<timestamp>-<random4> — sortable by time, unique enough.
 */
function generateBatchId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `IMP-${ts}-${rand}`
}

/**
 * Auto-detect which CSV header maps to which model field.
 * Returns a map: csvHeaderIndex -> column.key | null (null = skip)
 */
function autoDetectMappings(headers: string[], columns: CsvColumn[]): Record<number, string | null> {
  const result: Record<number, string | null> = {}
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  // For each header, find the best-matching column
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i])
    if (!h) { result[i] = null; continue }

    // Try exact match on key first
    let bestMatch: string | null = null
    for (const col of columns) {
      const keyN = normalize(col.key)
      if (h === keyN) { bestMatch = col.key; break }

      // Try label
      const labelN = normalize(col.label)
      if (h === labelN) { bestMatch = col.key; break }

      // Try aliases
      if (col.aliases?.some(a => normalize(a) === h)) { bestMatch = col.key; break }
    }
    if (bestMatch) { result[i] = bestMatch; continue }

    // Partial / contains matching (lower priority)
    let partialMatch: string | null = null
    let partialScore = 0
    for (const col of columns) {
      const keyN = normalize(col.key)
      const labelN = normalize(col.label)
      const aliasN = (col.aliases || []).map(normalize)

      // Score: how many chars overlap
      let score = 0
      if (h.includes(keyN) || keyN.includes(h)) score = Math.max(score, Math.min(h.length, keyN.length))
      if (h.includes(labelN) || labelN.includes(h)) score = Math.max(score, Math.min(h.length, labelN.length))
      for (const a of aliasN) {
        if (h.includes(a) || a.includes(h)) score = Math.max(score, Math.min(h.length, a.length))
      }
      if (score > partialScore && score >= 3) {  // require at least 3 chars of overlap
        partialScore = score
        partialMatch = col.key
      }
    }
    result[i] = partialMatch
  }
  return result
}

/**
 * Auto-detect date format from sample values.
 * Returns: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY' | null
 */
function detectDateFormat(samples: string[]): string | null {
  const formats = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'YYYY/MM/DD']
  const counts: Record<string, number> = {}
  for (const s of samples) {
    if (!s) continue
    // YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
    if (m) {
      counts[s.includes('/') ? 'YYYY/MM/DD' : 'YYYY-MM-DD'] = (counts['YYYY/MM/DD'] || 0) + 1
      continue
    }
    // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (m) {
      const [_, a, b] = m
      const aN = parseInt(a), bN = parseInt(b)
      if (aN > 12) {
        // a must be day → DD/MM/YYYY (or DD-MM-YYYY)
        counts[s.includes('/') ? 'DD/MM/YYYY' : 'DD-MM-YYYY'] = (counts[s.includes('/') ? 'DD/MM/YYYY' : 'DD-MM-YYYY'] || 0) + 1
      } else if (bN > 12) {
        // b must be day → MM/DD/YYYY
        counts['MM/DD/YYYY'] = (counts['MM/DD/YYYY'] || 0) + 1
      } else {
        // Ambiguous — assume DD/MM/YYYY (Malaysian default)
        counts[s.includes('/') ? 'DD/MM/YYYY' : 'DD-MM-YYYY'] = (counts[s.includes('/') ? 'DD/MM/YYYY' : 'DD-MM-YYYY'] || 0) + 1
      }
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [fmt, n] of Object.entries(counts)) {
    if (n > bestCount) { best = fmt; bestCount = n }
  }
  return best
}

/**
 * Parse a date string in the given format, return ISO string or null.
 */
function parseDate(raw: string, format: string | null): string | null {
  if (!raw) return null
  if (!format) {
    // Fallback: try Date.parse
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  let y: string, m: string, d: string
  if (format === 'YYYY-MM-DD') {
    const mm = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!mm) return null
    y = mm[1]; m = mm[2]; d = mm[3]
  } else if (format === 'YYYY/MM/DD') {
    const mm = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (!mm) return null
    y = mm[1]; m = mm[2]; d = mm[3]
  } else if (format === 'DD/MM/YYYY') {
    const mm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!mm) return null
    d = mm[1]; m = mm[2]; y = mm[3]
  } else if (format === 'DD-MM-YYYY') {
    const mm = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (!mm) return null
    d = mm[1]; m = mm[2]; y = mm[3]
  } else if (format === 'MM/DD/YYYY') {
    const mm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!mm) return null
    m = mm[1]; d = mm[2]; y = mm[3]
  } else {
    const dt = new Date(raw)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  if (isNaN(dt.getTime())) return null
  return dt.toISOString()
}

export function CsvUpload({ title, columns, templateRows, onImport, onUndo, lastBatchId, lastBatchCount, onClose, onSaved }: CsvUploadProps) {
  useEscClose(onClose)
  const [stage, setStage] = useState<Stage>('select')
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[]; batchId?: string } | null>(null)
  const [undoing, setUndoing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // === Mapping stage state ===
  // mapping[i] = column.key | null (which model field the i-th CSV header maps to)
  const [mapping, setMapping] = useState<Record<number, string | null>>({})
  // dateFormat: detected format string, can be overridden by user
  const [dateFormat, setDateFormat] = useState<string | null>(null)
  const [detectedDateFormat, setDetectedDateFormat] = useState<string | null>(null)

  // === Preview stage state ===
  // mappedRows: array of { values: Record<colKey, any>, errors: string[], rowIdx: number }
  const [mappedRows, setMappedRows] = useState<{ values: Record<string, any>; errors: string[]; rowIdx: number }[]>([])

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      try {
        const { headers: hdrs, rows } = parseCsvWithHeaders(text)
        if (rows.length === 0) {
          toast.error('CSV file is empty or has no data rows')
          return
        }

        // Auto-detect column mappings
        const autoMap = autoDetectMappings(hdrs, columns)
        setMapping(autoMap)

        // Auto-detect date format from all date-like columns
        const dateColumns = columns.filter(c => c.key.toLowerCase().includes('date') || c.key.toLowerCase().includes('dob') || c.key.toLowerCase().includes('birth'))
        const dateSamples: string[] = []
        for (const dc of dateColumns) {
          const hdrIdx = hdrs.findIndex((h, i) => autoMap[i] === dc.key)
          if (hdrIdx >= 0) {
            for (const row of rows.slice(0, 50)) {
              const val = row[hdrs[hdrIdx]]
              if (val) dateSamples.push(val)
            }
          }
        }
        const detectedFmt = dateSamples.length > 0 ? detectDateFormat(dateSamples) : null
        setDetectedDateFormat(detectedFmt)
        setDateFormat(detectedFmt)

        setHeaders(hdrs)
        setParsedRows(rows)
        setStage('mapping')
        toast.success(`Parsed ${rows.length} rows from CSV`)
      } catch (err: any) {
        toast.error(`Failed to parse CSV: ${err.message}`)
      }
    }
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const csv = toCsv(templateRows, columns.map(c => c.key))
    downloadCsv(`${title.toLowerCase().replace(/\s+/g, '-')}-template.csv`, csv)
  }

  // Update a single mapping entry
  const updateMapping = (headerIdx: number, colKey: string | null) => {
    setMapping(prev => ({ ...prev, [headerIdx]: colKey }))
  }

  // Auto-suggest mappings again (after user changes)
  const reAutoDetect = () => {
    const autoMap = autoDetectMappings(headers, columns)
    setMapping(autoMap)
    toast.info('Re-applied auto-detection')
  }

  // Move from mapping stage to preview stage
  const goToPreview = () => {
    // Check required columns are mapped
    const mappedKeys = new Set(Object.values(mapping).filter(Boolean) as string[])
    const missingRequired = columns.filter(c => c.required && !mappedKeys.has(c.key))
    if (missingRequired.length > 0) {
      toast.error(`Required columns not mapped: ${missingRequired.map(c => c.label).join(', ')}`)
      return
    }

    // Apply mapping + transform + validate to each row
    const processed: { values: Record<string, any>; errors: string[]; rowIdx: number }[] = []
    for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx++) {
      const row = parsedRows[rowIdx]
      const values: Record<string, any> = {}
      const rowErrors: string[] = []

      // Build a reverse map: colKey -> headerIdx
      const colToHeaderIdx: Record<string, number> = {}
      for (const [hIdx, colKey] of Object.entries(mapping)) {
        if (colKey) colToHeaderIdx[colKey] = parseInt(hIdx)
      }

      // For each column, get the raw value from the mapped header
      for (const col of columns) {
        const hIdx = colToHeaderIdx[col.key]
        if (hIdx === undefined) {
          values[col.key] = null
          continue
        }
        const rawVal = row[headers[hIdx]] || ''
        let transformedVal: any = rawVal

        // Special handling for date fields
        if (col.key.toLowerCase().includes('date') || col.key.toLowerCase().includes('dob') || col.key.toLowerCase().includes('birth')) {
          if (rawVal) {
            const iso = parseDate(rawVal, dateFormat)
            transformedVal = iso
            if (!iso) {
              rowErrors.push(`Invalid date "${rawVal}" for ${col.label} (expected ${dateFormat || 'YYYY-MM-DD'})`)
            }
          } else {
            transformedVal = null
          }
        } else if (col.transform) {
          try {
            transformedVal = col.transform(rawVal)
          } catch (e: any) {
            rowErrors.push(`Invalid value "${rawVal}" for ${col.label}: ${e.message}`)
          }
        }

        if (col.required && (!transformedVal || transformedVal === '')) {
          rowErrors.push(`Missing required field "${col.label}"`)
        }

        if (col.validate && transformedVal && !rowErrors.length) {
          const vErr = col.validate(transformedVal, values)
          if (vErr) rowErrors.push(vErr)
        }

        values[col.key] = transformedVal
      }

      processed.push({ values, errors: rowErrors, rowIdx })
    }

    setMappedRows(processed)
    setStage('preview')
  }

  const doImport = async () => {
    setStage('importing')
    setErrors([])

    // Filter out rows with errors
    const validRows = mappedRows.filter(r => r.errors.length === 0).map(r => r.values)
    const errorRows = mappedRows.filter(r => r.errors.length > 0)
    const allErrors: string[] = errorRows.flatMap(r => r.errors.map(e => `Row ${r.rowIdx + 2}: ${e}`))  // +2 for 1-indexed + header row

    if (validRows.length === 0) {
      toast.error('No valid rows to import — please fix the errors and try again')
      setStage('preview')
      return
    }

    const batchId = generateBatchId()
    try {
      const result = await onImport(validRows, batchId)
      const combinedErrors = [...allErrors, ...result.errors]
      setImportResult({
        success: result.success,
        failed: result.failed + errorRows.length,
        errors: combinedErrors,
        batchId,
      })
      setStage('done')
      if (result.success > 0) {
        toast.success(`Imported ${result.success} records (batch ${batchId})`)
      }
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`)
      setStage('preview')
    }
  }

  const handleUndo = async () => {
    if (!importResult?.batchId) return
    if (!onUndo) return
    if (!confirm(`Undo this import? This will delete all ${importResult.success} records imported in batch ${importResult.batchId}. This cannot be undone.`)) return
    setUndoing(true)
    try {
      const result = await onUndo(importResult.batchId)
      if (result.success) {
        toast.success(`Undone — deleted ${result.deleted} records`)
        setStage('select')
        setImportResult(null)
        onSaved()
      } else {
        toast.error(`Undo failed: ${result.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      toast.error(e.message || 'Undo failed')
    }
    setUndoing(false)
  }

  // Handle undo of a PREVIOUS import (from outside this dialog)
  const handleUndoPrevious = async () => {
    if (!lastBatchId || !onUndo) return
    if (!confirm(`Undo your previous import (batch ${lastBatchId})? This will delete all ${lastBatchCount || ''} records from that import.`)) return
    setUndoing(true)
    try {
      const result = await onUndo(lastBatchId)
      if (result.success) {
        toast.success(`Undone — deleted ${result.deleted} records`)
        onSaved()
        onClose()
      } else {
        toast.error(`Undo failed: ${result.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      toast.error(e.message || 'Undo failed')
    }
    setUndoing(false)
  }

  const close = () => {
    if (stage === 'done') onSaved()
    else onClose()
  }

  // Counts for mapping stage
  const mappedCount = Object.values(mapping).filter(Boolean).length
  const unmappedCount = headers.length - mappedCount
  const requiredMappedCount = columns.filter(c => c.required && Object.values(mapping).includes(c.key)).length
  const requiredTotal = columns.filter(c => c.required).length

  // Counts for preview stage
  const validRowCount = mappedRows.filter(r => r.errors.length === 0).length
  const errorRowCount = mappedRows.filter(r => r.errors.length > 0).length

  // List of columns that have been mapped (in the order they appear in `columns`)
  // — used to render only mapped columns in the preview table
  const mappedColumnKeys = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping).filter(Boolean) as string[])
    return columns.filter(c => mappedKeys.has(c.key))
  }, [columns, mapping])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Upload className="h-5 w-5" /> {title}
          </h3>
          <div className="flex items-center gap-2">
            {onUndo && lastBatchId && stage === 'select' && (
              <Button variant="outline" size="sm" onClick={handleUndoPrevious} disabled={undoing}>
                {undoing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Undoing...</> : <><Undo2 className="h-3 w-3 mr-1" /> Undo last import{lastBatchCount ? ` (${lastBatchCount})` : ''}</>}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={close}>×</Button>
          </div>
        </div>

        {/* Progress indicator */}
        {stage !== 'select' && stage !== 'done' && (
          <div className="border-b px-4 py-2 flex items-center gap-2 text-xs">
            <span className={stage === 'mapping' ? 'font-bold text-primary' : 'text-muted-foreground'}>1. Map Columns</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className={stage === 'preview' ? 'font-bold text-primary' : 'text-muted-foreground'}>2. Preview & Validate</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className={stage === 'importing' ? 'font-bold text-primary' : 'text-muted-foreground'}>3. Import</span>
          </div>
        )}

        <div className="p-4 space-y-4">
          {/* Stage 1: File select */}
          {stage === 'select' && (
            <>
              <div className="rounded-md border border-dashed p-6 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">Choose a CSV file to import</p>
                <p className="text-xs text-muted-foreground mb-4">
                  The file must have a header row. After uploading, you'll be able to map your columns to our fields — no need to reformat your file.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Choose File
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Reference columns (you'll be able to map your CSV headers to these):</span>
                  <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                    <Download className="h-3 w-3 mr-1" /> Download template
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {columns.map(c => (
                    <span key={c.key} className={`text-xs px-2 py-0.5 rounded border ${c.required ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-border bg-muted text-muted-foreground'}`}>
                      {c.label}{c.required && ' *'}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Stage 2: Column mapping */}
          {stage === 'mapping' && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="font-medium">{parsedRows.length} rows</span> detected.
                  Map your CSV columns to our fields:
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={reAutoDetect}>
                    <Wand2 className="h-3 w-3 mr-1" /> Re-detect
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStage('select')}>
                    Choose different file
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-amber-50/50 p-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Column mapping:</strong> For each of your CSV headers, choose which field it maps to.
                  We auto-detected the mapping — review and adjust as needed.
                  Required fields ({requiredMappedCount}/{requiredTotal} mapped) must be mapped before continuing.
                  Unmapped columns will be skipped.
                </div>
              </div>

              {/* Date format selector */}
              {detectedDateFormat && (
                <div className="rounded-md border p-3 bg-blue-50/50">
                  <div className="text-xs font-medium text-blue-900 mb-1">Date format detected: <code className="bg-blue-100 px-1 rounded">{detectedDateFormat}</code></div>
                  <div className="text-xs text-blue-700 mb-2">
                    Sample: {parsedRows.slice(0, 3).map(r => {
                      const dateHdrIdx = headers.findIndex((h, i) => mapping[i] && columns.find(c => c.key === mapping[i])?.key.toLowerCase().match(/date|dob|birth/))
                      if (dateHdrIdx < 0) return null
                      return r[headers[dateHdrIdx]]
                    }).filter(Boolean).join(', ')}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Override:</span>
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={dateFormat || ''}
                      onChange={e => setDateFormat(e.target.value || null)}
                    >
                      <option value="">Auto-detect</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2024-03-15)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 15/03/2024)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 03/15/2024)</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 15-03-2024)</option>
                      <option value="YYYY/MM/DD">YYYY/MM/DD (e.g. 2024/03/15)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Mapping table */}
              <div className="border rounded-md overflow-auto max-h-[50vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium w-1/2">Your CSV column</th>
                      <th className="text-left p-2 font-medium w-1/2">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => {
                      const mappedKey = mapping[i]
                      const col = mappedKey ? columns.find(c => c.key === mappedKey) : null
                      const isMapped = !!mappedKey
                      const sampleValues = parsedRows.slice(0, 3).map(r => r[h]).filter(Boolean).join(', ')
                      return (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          <td className="p-2">
                            <div className="font-medium">{h}</div>
                            {sampleValues && (
                              <div className="text-muted-foreground mt-0.5 truncate" title={sampleValues}>
                                e.g.: {sampleValues}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <select
                              className={`w-full border rounded px-2 py-1 text-xs ${isMapped ? (col?.required ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50') : 'border-muted'}`}
                              value={mappedKey || ''}
                              onChange={e => updateMapping(i, e.target.value || null)}
                            >
                              <option value="">— Skip (do not import) —</option>
                              {columns.map(c => (
                                <option key={c.key} value={c.key}>
                                  {c.label}{c.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                            {isMapped && col && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Link2 className="h-2.5 w-2.5" />
                                {col.required ? 'Required' : 'Optional'}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground">
                  <span className="text-emerald-600 font-medium">{mappedCount} mapped</span>
                  {' • '}
                  <span className="text-muted-foreground">{unmappedCount} will be skipped</span>
                  {requiredMappedCount < requiredTotal && (
                    <span className="text-red-600 font-medium ml-2">• {requiredTotal - requiredMappedCount} required field(s) still need mapping</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setStage('select')}>Back</Button>
                <Button onClick={goToPreview} disabled={requiredMappedCount < requiredTotal}>
                  Preview {parsedRows.length} rows <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </>
          )}

          {/* Stage 3: Preview & validate */}
          {stage === 'preview' && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="font-medium text-emerald-600">{validRowCount} valid</span>
                  {errorRowCount > 0 && (
                    <>, <span className="font-medium text-red-600">{errorRowCount} with errors</span> (will be skipped)</>
                  )}
                  {' '}— ready to import
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStage('mapping')}>
                  ← Back to mapping
                </Button>
              </div>

              {errorRowCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <strong>Note:</strong> Rows with errors will be skipped. After import, you can download the list of failed rows to fix and re-upload.
                </div>
              )}

              <div className="border rounded-md overflow-auto max-h-[50vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium w-12">#</th>
                      <th className="text-left p-2 font-medium w-16">Status</th>
                      {mappedColumnKeys.map(c => (
                        <th key={c.key} className="text-left p-2 font-medium whitespace-nowrap">
                          {c.label}{c.required && <span className="text-red-500"> *</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={`border-t ${r.errors.length > 0 ? 'bg-red-50/50' : ''}`}>
                        <td className="p-2 text-muted-foreground">{r.rowIdx + 2}</td>
                        <td className="p-2">
                          {r.errors.length === 0 ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </td>
                        {mappedColumnKeys.map(c => {
                          const v = r.values[c.key]
                          const displayVal = v instanceof Date ? v.toLocaleDateString() : (v == null ? '' : String(v))
                          return (
                            <td key={c.key} className="p-2 max-w-32 truncate" title={displayVal}>
                              {displayVal}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappedRows.length > 50 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                    ... and {mappedRows.length - 50} more rows
                  </div>
                )}
              </div>

              {/* Error details (collapsible) */}
              {errorRowCount > 0 && (
                <details className="rounded-md border border-red-200 bg-red-50/50 p-3 text-xs">
                  <summary className="font-medium text-red-700 cursor-pointer">
                    Show {errorRowCount} rows with errors
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {mappedRows.filter(r => r.errors.length > 0).slice(0, 100).map((r, i) => (
                      <div key={i} className="text-red-700">
                        <strong>Row {r.rowIdx + 2}:</strong> {r.errors.join('; ')}
                      </div>
                    ))}
                    {errorRowCount > 100 && <div className="text-red-600">... and {errorRowCount - 100} more</div>}
                  </div>
                </details>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setStage('mapping')}>Back</Button>
                <Button onClick={doImport} disabled={validRowCount === 0}>
                  <Upload className="h-4 w-4 mr-1" /> Import {validRowCount} record{validRowCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}

          {/* Stage 4: Importing */}
          {stage === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-3" />
              <p className="text-sm font-medium">Importing records...</p>
              <p className="text-xs text-muted-foreground mt-1">Please wait</p>
            </div>
          )}

          {/* Stage 5: Done */}
          {stage === 'done' && importResult && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle className="h-12 w-12 mx-auto text-emerald-500" />
              <div>
                <p className="font-semibold">Import complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-emerald-600 font-medium">{importResult.success}</span> imported successfully
                  {importResult.failed > 0 && (
                    <>, <span className="text-red-600 font-medium">{importResult.failed}</span> failed</>
                  )}
                </p>
                {importResult.batchId && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Batch ID: <code className="bg-muted px-1 rounded">{importResult.batchId}</code>
                  </p>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 max-h-32 overflow-y-auto text-left">
                  <div className="font-medium mb-1">Errors ({importResult.errors.length}):</div>
                  {importResult.errors.slice(0, 10).map((e, i) => <div key={i}>• {e}</div>)}
                  {importResult.errors.length > 10 && <div>... and {importResult.errors.length - 10} more</div>}
                </div>
              )}
              <div className="flex justify-center gap-2 flex-wrap">
                {onUndo && importResult.success > 0 && (
                  <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoing}>
                    {undoing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Undoing...</> : <><Undo2 className="h-3 w-3 mr-1" /> Undo this import</>}
                  </Button>
                )}
                <Button onClick={close}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
