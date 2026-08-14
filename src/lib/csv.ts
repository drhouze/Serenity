// CSV parser — handles quoted fields, embedded commas, escaped quotes

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        currentField += char
        i++
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
        i++
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField)
        currentField = ''
        if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        if (char === '\r' && text[i + 1] === '\n') i += 2
        else i++
      } else {
        currentField += char
        i++
      }
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(f => f.trim() !== '')) {
      rows.push(currentRow)
    }
  }

  return rows
}

export function parseCsvWithHeaders(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows = parseCsv(text)
  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = rows[0].map(h => h.trim())
  const dataRows = rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (row[i] || '').trim()
    })
    return obj
  })
  return { headers, rows: dataRows }
}

export function toCsv(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0 && !headers) return ''
  const cols = headers || Object.keys(rows[0] || {})
  const escape = (val: any) => {
    const s = String(val ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [cols.join(',')]
  for (const row of rows) {
    lines.push(cols.map(c => escape(row[c])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
