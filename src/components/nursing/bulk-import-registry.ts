/**
 * Shared registry of bulk-import definitions for all importable entity types.
 *
 * Used by:
 *   - Settings → Backup & Restore → Bulk Imports section (the canonical UI)
 *   - Anywhere else that wants to launch an import dialog (e.g. a "Quick Import"
 *     button in the Residents module can simply open the same dialog using
 *     the registry entry)
 *
 * Each definition includes:
 *   - entityType: passed to /api/import-undo for the undo operation
 *   - title: shown in the dialog header
 *   - description: shown on the card in the Bulk Imports section
 *   - icon: lucide-react icon for the card
 *   - columns: CsvColumn[] definition with aliases + validators
 *   - templateRows: sample rows for the downloadable template
 *   - onImport: callback that creates records via the API. Receives (rows, batchId, facilityId).
 *   - buildPayload: optional, builds the POST body from a mapped row. Defaults to spreading the row.
 */

import {
  Users, UserCheck, DoorOpen, Package, Truck,
  BookOpen, Landmark, Receipt, Wallet, Boxes, ShoppingCart,
  FileText, Tags, type LucideIcon,
} from 'lucide-react'
import type { CsvColumn } from './CsvUpload'

// Business types each import applies to. `null` (or omitted) = applies to all.
// Used by BulkImports.tsx to hide irrelevant imports based on the current org's business type.
export type BusinessTypeKey = 'nursing_home' | 'tailor' | 'clinic' | 'generic' | string

export interface BulkImportDefinition {
  entityType: 'resident' | 'staff' | 'room' | 'product' | 'vendor' | 'account' | 'bankAccount' | 'expense' | 'payment' | 'inventory' | 'purchaseOrder' | 'journalEntry' | 'productVendorPrice'
  title: string
  description: string
  icon: LucideIcon
  columns: CsvColumn[]
  templateRows: Record<string, any>[]
  /** API endpoint to POST each row to (without query string). facilityId is appended. */
  endpoint: string
  /** Build the POST body from a mapped row. Defaults to spreading the row + adding importBatchId. */
  buildPayload?: (row: any, batchId: string) => any
  /** Business types this import is applicable to. If omitted, applies to all types. */
  applicableBusinessTypes?: BusinessTypeKey[]
}

// ============================================================================
// RESIDENTS
// ============================================================================
const RESIDENT_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'firstName', label: 'First Name', required: true,
    aliases: ['given name', 'fname', 'first', 'nama depan', 'nama pertama'],
    validate: (v) => typeof v === 'string' && v.length > 100 ? 'First name too long (max 100 chars)' : null,
  },
  {
    key: 'lastName', label: 'Last Name', required: true,
    aliases: ['surname', 'family name', 'lname', 'last', 'nama akhir', 'nama keluarga'],
    validate: (v) => typeof v === 'string' && v.length > 100 ? 'Last name too long (max 100 chars)' : null,
  },
  {
    key: 'dateOfBirth', label: 'Date of Birth',
    aliases: ['dob', 'birth date', 'birthdate', 'birthday', 'tarikh lahir', 'dob yyyy-mm-dd'],
  },
  {
    key: 'gender', label: 'Gender (Male/Female/Other)',
    aliases: ['sex'],
    validate: (v) => {
      if (!v) return null
      const lower = String(v).toLowerCase()
      if (!['male', 'female', 'other', 'm', 'f', 'o'].includes(lower)) {
        return `Gender must be Male, Female, or Other (got "${v}")`
      }
      return null
    },
    transform: (v) => {
      if (!v) return null
      const lower = String(v).toLowerCase()
      if (lower === 'm') return 'Male'
      if (lower === 'f') return 'Female'
      if (lower === 'o') return 'Other'
      return String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
    },
  },
  {
    key: 'icPassportNumber', label: 'IC / Passport Number',
    aliases: ['ic', 'nric', 'ic number', 'passport', 'passport number', 'id number', 'no ic', 'kad pengenalan'],
    validate: (v) => {
      if (!v) return null
      const s = String(v).replace(/\s/g, '')
      if (s.length < 5 || s.length > 30) return 'IC/Passport number looks invalid (5-30 chars)'
      return null
    },
  },
  {
    key: 'allergies', label: 'Allergies (comma-separated)',
    aliases: ['allergy', 'allergies list'],
  },
  {
    key: 'conditions', label: 'Conditions (comma-separated)',
    aliases: ['condition', 'medical conditions', 'diagnosis', 'diagnoses', 'penyakit'],
  },
  {
    key: 'dietaryNeeds', label: 'Dietary Needs',
    aliases: ['diet', 'dietary', 'diet requirement', 'keperluan diet'],
  },
  {
    key: 'emergencyContactName', label: 'Emergency Contact Name',
    aliases: ['emergency contact', 'emergency name', 'next of kin', 'kin name', 'nok', 'nama kecemasan', 'nama waris'],
  },
  {
    key: 'emergencyContactPhone', label: 'Emergency Contact Phone',
    aliases: ['emergency phone', 'emergency contact', 'kin phone', 'nok phone', 'telefon kecemasan'],
  },
  {
    key: 'emergencyContactRelation', label: 'Emergency Contact Relationship',
    aliases: ['relationship', 'relation', 'kin relation', 'hubungan'],
  },
  {
    key: 'billingTIN', label: 'Billing TIN (Tax ID, for e-invoicing)',
    aliases: ['tin', 'tax id', 'tax number', 'gst', 'sst', 'no cukai'],
  },
  {
    key: 'billingName', label: 'Billing Name (if different from resident name)',
    aliases: ['bill to', 'bill name', 'payer name', 'nama pembayar'],
  },
  {
    key: 'billingEmail', label: 'Billing Email',
    aliases: ['bill email', 'invoice email', 'email pembayar'],
    validate: (v) => {
      if (!v) return null
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return `Invalid email: "${v}"`
      return null
    },
  },
  {
    key: 'billingPhone', label: 'Billing Phone',
    aliases: ['bill phone', 'invoice phone', 'contact phone', 'telefon pembayar'],
  },
  {
    key: 'billingAddress', label: 'Billing Address',
    aliases: ['bill address', 'invoice address', 'alamat pembayar'],
  },
  {
    key: 'roomNumber', label: 'Room Number (e.g. 101 — must exist in the facility)',
    aliases: ['room', 'room no', 'bilik', 'no bilik'],
  },
  {
    key: 'bedCode', label: 'Bed Code (e.g. 101-A — must exist in the room)',
    aliases: ['bed', 'bed no', 'bed id', 'katil'],
  },
]

const RESIDENT_TEMPLATE = [
  {
    firstName: 'John',
    lastName: 'Smith',
    dateOfBirth: '1950-05-15',
    gender: 'Male',
    icPassportNumber: '500515-14-5678',
    allergies: 'Penicillin',
    conditions: 'Hypertension, Arthritis',
    dietaryNeeds: 'Low Sodium',
    emergencyContactName: 'Sarah Smith',
    emergencyContactPhone: '+1-555-5678',
    emergencyContactRelation: 'Daughter',
    roomNumber: '101',
    bedCode: '101-A',
  },
]

// ============================================================================
// STAFF
// ============================================================================
const STAFF_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'firstName', label: 'First Name', required: true,
    aliases: ['given name', 'fname', 'first', 'nama depan'],
    validate: (v) => typeof v === 'string' && v.length > 100 ? 'First name too long' : null,
  },
  {
    key: 'lastName', label: 'Last Name', required: true,
    aliases: ['surname', 'family name', 'lname', 'last', 'nama akhir'],
    validate: (v) => typeof v === 'string' && v.length > 100 ? 'Last name too long' : null,
  },
  {
    key: 'role', label: 'Role (NURSE/CARE_STAFF/DOCTOR/PHYSIO/DIETITIAN/RECEPTION)', required: true,
    aliases: ['position', 'job title', 'job', 'jawatan', 'jenis pekerja'],
    validate: (v) => {
      if (!v) return null
      const valid = ['NURSE', 'CARE_STAFF', 'DOCTOR', 'PHYSIO', 'DIETITIAN', 'RECEPTION']
      const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
      if (!valid.includes(upper)) return `Role must be one of: ${valid.join(', ')} (got "${v}")`
      return null
    },
    transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'CARE_STAFF',
  },
  {
    key: 'email', label: 'Email',
    aliases: ['email address', 'e-mail', 'emel'],
    validate: (v) => {
      if (!v) return null
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return `Invalid email: "${v}"`
      return null
    },
  },
  {
    key: 'phone', label: 'Phone',
    aliases: ['mobile', 'contact', 'tel', 'telephone', 'telefon', 'no telefon'],
  },
  {
    key: 'hireDate', label: 'Hire Date',
    aliases: ['start date', 'date joined', 'joined', 'tarikh mula'],
  },
]

const STAFF_TEMPLATE = [
  {
    firstName: 'Jane',
    lastName: 'Nurse',
    role: 'NURSE',
    email: 'jane@example.com',
    phone: '+60-12-345-6789',
    hireDate: '2024-01-15',
  },
  {
    firstName: 'Bob',
    lastName: 'Caregiver',
    role: 'CARE_STAFF',
    email: 'bob@example.com',
    phone: '+60-12-987-6543',
    hireDate: '2024-02-01',
  },
]

// ============================================================================
// ROOMS
// ============================================================================
const ROOM_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'roomNumber', label: 'Room Number', required: true,
    aliases: ['room', 'room no', 'number', 'no bilik', 'bilik'],
    validate: (v) => typeof v === 'string' && v.length > 50 ? 'Room number too long' : null,
  },
  {
    key: 'floor', label: 'Floor',
    aliases: ['level', 'tingkat'],
    transform: (v) => v ? parseInt(String(v).replace(/[^0-9-]/g, '')) || 1 : 1,
    validate: (v) => (typeof v === 'number' && v < 0) ? 'Floor cannot be negative' : null,
  },
  {
    key: 'capacity', label: 'Capacity',
    aliases: ['beds', 'bed count', 'katil'],
    transform: (v) => v ? Math.max(1, parseInt(String(v)) || 1) : 1,
    validate: (v) => (typeof v === 'number' && v < 1) ? 'Capacity must be at least 1' : null,
  },
  {
    key: 'type', label: 'Type (PRIVATE/SEMI_PRIVATE/WARD)',
    aliases: ['room type', 'room class', 'jenis bilik'],
    validate: (v) => {
      if (!v) return null
      const valid = ['PRIVATE', 'SEMI_PRIVATE', 'WARD']
      const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
      if (!valid.includes(upper)) return `Type must be one of: ${valid.join(', ')} (got "${v}")`
      return null
    },
    transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'PRIVATE',
  },
  {
    key: 'status', label: 'Status (AVAILABLE/OCCUPIED/MAINTENANCE)',
    aliases: ['room status', 'state'],
    validate: (v) => {
      if (!v) return null
      const valid = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE']
      const upper = String(v).toUpperCase()
      if (!valid.includes(upper)) return `Status must be one of: ${valid.join(', ')} (got "${v}")`
      return null
    },
    transform: (v) => v ? String(v).toUpperCase() : 'AVAILABLE',
  },
  {
    key: 'notes', label: 'Notes',
    aliases: ['remarks', 'comment', 'catatan'],
  },
]

const ROOM_TEMPLATE = [
  { roomNumber: '101', floor: '1', capacity: '1', type: 'PRIVATE', status: 'AVAILABLE', notes: 'Ground floor private room' },
  { roomNumber: '102', floor: '1', capacity: '2', type: 'SEMI_PRIVATE', status: 'AVAILABLE', notes: '' },
  { roomNumber: '201', floor: '2', capacity: '4', type: 'WARD', status: 'AVAILABLE', notes: 'Second floor ward' },
]

// ============================================================================
// PRODUCTS
// ============================================================================
const PRODUCT_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'name', label: 'Name', required: true,
    aliases: ['product name', 'product', 'item name', 'item', 'service', 'service name', 'nama produk', 'nama'],
    validate: (v) => typeof v === 'string' && v.length > 200 ? 'Name too long (max 200 chars)' : null,
  },
  {
    key: 'description', label: 'Description',
    aliases: ['desc', 'details', 'notes', 'keterangan'],
  },
  {
    key: 'category', label: 'Category', required: true,
    aliases: ['cat', 'type', 'product type', 'product category', 'jenis', 'kategori'],
    validate: (v) => {
      if (!v) return null
      const valid = ['ROOM', 'CARE', 'MEDICATION', 'THERAPY', 'SUPPLIES', 'FOOD', 'OTHER']
      const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
      if (!valid.includes(upper)) return `Category must be one of: ${valid.join(', ')} (got "${v}")`
      return null
    },
    transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'OTHER',
  },
  {
    key: 'unitPrice', label: 'Unit Price', required: true,
    aliases: ['price', 'cost', 'amount', 'rate', 'fee', 'harga', 'jumlah'],
    transform: (v) => {
      if (!v) return 0
      const cleaned = String(v).replace(/[RM$,\s]/g, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? 0 : n
    },
    validate: (v) => (typeof v === 'number' && v < 0) ? 'Price cannot be negative' : null,
  },
  {
    key: 'unit', label: 'Unit (each/day/session/month/hour)',
    aliases: ['unit type', 'pricing unit', 'measure', 'satuan'],
  },
]

const PRODUCT_TEMPLATE = [
  { name: 'Custom Service', description: 'Description here', category: 'OTHER', unitPrice: '50', unit: 'session' },
  { name: 'Daily Care Package', description: 'Standard daily care', category: 'CARE', unitPrice: '120', unit: 'day' },
]

// ============================================================================
// VENDORS
// ============================================================================
const VENDOR_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'name', label: 'Vendor Name', required: true,
    aliases: ['vendor', 'supplier', 'company', 'company name', 'nama vendor', 'nama pembekal'],
    validate: (v) => typeof v === 'string' && v.length > 200 ? 'Name too long' : null,
  },
  {
    key: 'email', label: 'Email',
    aliases: ['email address', 'e-mail', 'emel'],
    validate: (v) => {
      if (!v) return null
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return `Invalid email: "${v}"`
      return null
    },
  },
  {
    key: 'phone', label: 'Phone',
    aliases: ['tel', 'telephone', 'contact', 'telefon', 'no telefon'],
  },
  {
    key: 'address', label: 'Address',
    aliases: ['addr', 'street', 'alamat'],
  },
  {
    key: 'contactPerson', label: 'Contact Person',
    aliases: ['contact name', 'person', 'salesperson', 'orang hubungan', 'wakil'],
  },
  {
    key: 'paymentTerms', label: 'Payment Terms (e.g. Net 30, COD)',
    aliases: ['terms', 'payment', 'syarat bayaran'],
  },
  {
    key: 'taxId', label: 'Tax ID (SST/GST)',
    aliases: ['sst', 'gst', 'tax number', 'no cukai', 'no sst'],
  },
  {
    key: 'notes', label: 'Notes',
    aliases: ['remarks', 'comment', 'catatan'],
  },
]

const VENDOR_TEMPLATE = [
  { name: 'ABC Medical Supplies', email: 'sales@abcmed.com', phone: '+60-3-1234-5678', address: '12 Jalan Tun, KL', contactPerson: 'John Tan', paymentTerms: 'Net 30', taxId: 'SST-12345', notes: 'Primary supplier for medical consumables' },
  { name: 'Fresh Foods Sdn Bhd', email: 'orders@freshfoods.my', phone: '+60-3-8765-4321', address: '45 Jalan Makan, PJ', contactPerson: 'Siti', paymentTerms: 'COD', taxId: '', notes: 'Daily food supplier' },
]

// ============================================================================
// REGISTRY
// ============================================================================
export const BULK_IMPORT_REGISTRY: BulkImportDefinition[] = [
  {
    entityType: 'resident',
    title: 'Import Residents from CSV',
    description: 'Resident profiles with contact info, billing details, medical info, and emergency contacts.',
    icon: Users,
    columns: RESIDENT_CSV_COLUMNS,
    templateRows: RESIDENT_TEMPLATE,
    endpoint: '/api/data?type=residents',
    applicableBusinessTypes: ['nursing_home', 'clinic', 'generic'],
    buildPayload: (row, batchId) => {
      const payload: any = {
        admissionDate: new Date().toISOString(),
        status: 'ACTIVE',
        importBatchId: batchId,
      }
      for (const [k, v] of Object.entries(row)) {
        if (v === '' || v == null) continue
        payload[k] = v
      }
      return payload
    },
  },
  {
    entityType: 'staff',
    title: 'Import Staff from CSV',
    description: 'Staff members with roles, contact info, and hire dates. Multi-facility assignment is done after import via the Staff module.',
    icon: UserCheck,
    columns: STAFF_CSV_COLUMNS,
    templateRows: STAFF_TEMPLATE,
    endpoint: '/api/data?type=staff',
    buildPayload: (row, batchId) => {
      const payload: any = {
        active: true,
        importBatchId: batchId,
        ...row,
      }
      if (row.hireDate) payload.hireDate = row.hireDate
      else payload.hireDate = new Date().toISOString()
      return payload
    },
  },
  {
    entityType: 'room',
    title: 'Import Rooms from CSV',
    description: 'Room numbers with capacity, type, and status. Useful for setting up a new facility quickly.',
    icon: DoorOpen,
    applicableBusinessTypes: ['nursing_home', 'generic'],
    columns: ROOM_CSV_COLUMNS,
    templateRows: ROOM_TEMPLATE,
    endpoint: '/api/data?type=rooms',
    buildPayload: (row, batchId) => ({
      ...row,
      importBatchId: batchId,
    }),
  },
  {
    entityType: 'product',
    title: 'Import Products from CSV',
    description: 'Billable products and services with default prices. Used for invoicing and monthly charge generation.',
    icon: Package,
    columns: PRODUCT_CSV_COLUMNS,
    templateRows: PRODUCT_TEMPLATE,
    endpoint: '/api/data?type=products',
    buildPayload: (row, batchId) => ({
      name: row.name,
      description: row.description || null,
      category: row.category || 'OTHER',
      unitPrice: parseFloat(row.unitPrice) || 0,
      unit: row.unit || 'each',
      active: true,
      importBatchId: batchId,
    }),
  },
  {
    entityType: 'vendor',
    title: 'Import Vendors from CSV',
    description: 'Supplier/vendor master file with contact info and payment terms. Used by the Expenses module.',
    icon: Truck,
    columns: VENDOR_CSV_COLUMNS,
    templateRows: VENDOR_TEMPLATE,
    endpoint: '/api/data?type=vendors',
    buildPayload: (row, batchId) => ({
      name: row.name,
      email: row.email || null,
      phone: row.phone || null,
      address: row.address || null,
      contactPerson: row.contactPerson || null,
      paymentTerms: row.paymentTerms || null,
      taxId: row.taxId || null,
      notes: row.notes || null,
      active: true,
      importBatchId: batchId,
    }),
  },

  // ========================================================================
  // CHART OF ACCOUNTS
  // ========================================================================
  {
    entityType: 'account',
    title: 'Import Chart of Accounts from CSV',
    description: 'GL accounts (assets, liabilities, equity, revenue, expenses). The chart of accounts must exist before you can import expenses, payments, or post any journal entries.',
    icon: BookOpen,
    endpoint: '/api/data?type=accounts',
    columns: [
      {
        key: 'code', label: 'Account Code', required: true,
        aliases: ['account number', 'gl code', 'gl number', 'no akaun', 'kod akaun'],
        validate: (v) => typeof v !== 'string' || v.length > 20 ? 'Code must be a string up to 20 chars' : null,
      },
      {
        key: 'name', label: 'Account Name', required: true,
        aliases: ['account title', 'description', 'nama akaun'],
        validate: (v) => typeof v === 'string' && v.length > 200 ? 'Name too long' : null,
      },
      {
        key: 'type', label: 'Type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE)', required: true,
        aliases: ['account type', 'category', 'jenis'],
        validate: (v) => {
          if (!v) return null
          const valid = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
          const upper = String(v).toUpperCase()
          if (!valid.includes(upper)) return `Type must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase() : 'EXPENSE',
      },
      {
        key: 'subtype', label: 'Subtype (e.g. CURRENT_ASSET, FIXED_ASSET)',
        aliases: ['sub-type', 'classification'],
      },
      {
        key: 'normalBalance', label: 'Normal Balance (DEBIT/CREDIT)',
        aliases: ['normal balance', 'debit credit', 'dc'],
        validate: (v) => {
          if (!v) return null
          const upper = String(v).toUpperCase()
          if (!['DEBIT', 'CREDIT', 'D', 'C'].includes(upper)) return `Normal balance must be DEBIT or CREDIT (got "${v}")`
          return null
        },
        transform: (v) => {
          if (!v) return null
          const upper = String(v).toUpperCase()
          if (upper === 'D') return 'DEBIT'
          if (upper === 'C') return 'CREDIT'
          return upper
        },
      },
      {
        key: 'isGroup', label: 'Is Group? (true/false)',
        aliases: ['header', 'group account', 'parent'],
        transform: (v) => {
          if (!v) return false
          const s = String(v).toLowerCase().trim()
          return s === 'true' || s === 'yes' || s === '1' || s === 'y'
        },
      },
      {
        key: 'active', label: 'Active (true/false)',
        aliases: ['status'],
        transform: (v) => {
          if (v == null || v === '') return true
          const s = String(v).toLowerCase().trim()
          return s !== 'false' && s !== 'no' && s !== '0' && s !== 'inactive'
        },
      },
      {
        key: 'description', label: 'Description',
        aliases: ['desc', 'notes', 'remarks'],
      },
    ],
    templateRows: [
      { code: '1000', name: 'Cash on Hand', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT', isGroup: 'false', active: 'true', description: 'Petty cash and cash on hand' },
      { code: '1010', name: 'Bank — Maybank Operating', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT', isGroup: 'false', active: 'true', description: 'Main operating account' },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT', isGroup: 'false', active: 'true', description: 'Residents and insurance receivables' },
      { code: '1500', name: 'Fixed Assets', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT', isGroup: 'true', active: 'true', description: 'Group account — do not post' },
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isGroup: 'false', active: 'true', description: 'Vendors payable' },
      { code: '2300', name: 'Resident Deposits Held', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isGroup: 'false', active: 'true', description: 'Refundable deposits' },
      { code: '3000', name: "Owner's Equity", type: 'EQUITY', normalBalance: 'CREDIT', isGroup: 'false', active: 'true', description: 'Capital' },
      { code: '4000', name: 'Room & Board Revenue', type: 'REVENUE', normalBalance: 'CREDIT', isGroup: 'false', active: 'true', description: 'Room charges' },
      { code: '4010', name: 'Care Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT', isGroup: 'false', active: 'true', description: 'Care services' },
      { code: '5000', name: 'Staff Salaries', type: 'EXPENSE', normalBalance: 'DEBIT', isGroup: 'false', active: 'true', description: 'Salaries and wages' },
      { code: '5200', name: 'Food & Beverages', type: 'EXPENSE', normalBalance: 'DEBIT', isGroup: 'false', active: 'true', description: 'Resident meals' },
    ],
    buildPayload: (row, batchId) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      subtype: row.subtype || null,
      normalBalance: row.normalBalance || null,
      isGroup: row.isGroup === true,
      active: row.active !== false,
      description: row.description || null,
      importBatchId: batchId,
    }),
  },

  // ========================================================================
  // BANK ACCOUNTS
  // ========================================================================
  {
    entityType: 'bankAccount',
    title: 'Import Bank Accounts from CSV',
    description: 'Bank and cash accounts linked to GL accounts. Used for receiving payments and recording expenses. Each bank account must reference an existing GL account code.',
    icon: Landmark,
    endpoint: '/api/data?type=bankAccounts',
    columns: [
      {
        key: 'name', label: 'Account Name', required: true,
        aliases: ['bank account name', 'account name', 'nama akaun'],
        validate: (v) => typeof v === 'string' && v.length > 100 ? 'Name too long' : null,
      },
      {
        key: 'type', label: 'Type (BANK/CASH/SAVINGS)',
        aliases: ['account type', 'jenis'],
        validate: (v) => {
          if (!v) return null
          const valid = ['BANK', 'CASH', 'SAVINGS']
          const upper = String(v).toUpperCase()
          if (!valid.includes(upper)) return `Type must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase() : 'BANK',
      },
      {
        key: 'glAccountCode', label: 'GL Account Code (e.g. 1010)', required: true,
        aliases: ['gl code', 'gl account', 'account code', 'gl'],
      },
      {
        key: 'accountNumber', label: 'Account Number (last 4 digits OK)',
        aliases: ['no akaun', 'acct no'],
      },
      {
        key: 'bankName', label: 'Bank Name',
        aliases: ['bank', 'nama bank'],
      },
      {
        key: 'branch', label: 'Branch',
        aliases: ['branch name', 'cawangan'],
      },
      {
        key: 'openingBalance', label: 'Opening Balance',
        aliases: ['opening', 'starting balance', 'baki awal'],
        transform: (v) => {
          if (!v) return 0
          const cleaned = String(v).replace(/[RM$,\s]/g, '')
          const n = parseFloat(cleaned)
          return isNaN(n) ? 0 : n
        },
        validate: (v) => (typeof v === 'number' && isNaN(v)) ? 'Invalid number' : null,
      },
    ],
    templateRows: [
      { name: 'Maybank Operating', type: 'BANK', glAccountCode: '1010', accountNumber: '1234', bankName: 'Maybank', branch: 'KL Main', openingBalance: '50000' },
      { name: 'Maybank Savings', type: 'SAVINGS', glAccountCode: '1020', accountNumber: '5678', bankName: 'Maybank', branch: 'PJ', openingBalance: '100000' },
      { name: 'Petty Cash', type: 'CASH', glAccountCode: '1000', accountNumber: '', bankName: '', branch: '', openingBalance: '500' },
    ],
    // Note: buildPayload resolves glAccountCode → glAccountId server-side via the resolve endpoint
    // The /api/data POST handler for bankAccounts expects glAccountId; we use a special resolver.
    buildPayload: (row, batchId) => ({
      name: row.name,
      type: row.type || 'BANK',
      glAccountCode: row.glAccountCode,  // sent to API; the API handler resolves it
      accountNumber: row.accountNumber || null,
      bankName: row.bankName || null,
      branch: row.branch || null,
      openingBalance: row.openingBalance || 0,
      importBatchId: batchId,
    }),
  },

  // ========================================================================
  // EXPENSES
  // ========================================================================
  {
    entityType: 'expense',
    title: 'Import Expenses from CSV',
    description: 'Recorded expenses with category, vendor, amount, and paid-by staff. Each expense auto-posts a journal entry to the General Ledger (Dr. Expense / Cr. Cash). To link to an existing vendor or staff, use the vendor/staff code (e.g. VEN-0001, STF-0003).',
    icon: Receipt,
    endpoint: '/api/data?type=expenses',
    columns: [
      {
        key: 'description', label: 'Description', required: true,
        aliases: ['desc', 'details', 'narration', 'keterangan', 'butiran'],
        validate: (v) => typeof v === 'string' && v.length > 500 ? 'Description too long' : null,
      },
      {
        key: 'amount', label: 'Amount', required: true,
        aliases: ['total', 'cost', 'value', 'jumlah'],
        transform: (v) => {
          if (!v) return 0
          const cleaned = String(v).replace(/[RM$,\s]/g, '')
          const n = parseFloat(cleaned)
          return isNaN(n) ? 0 : n
        },
        validate: (v) => (typeof v !== 'number' || v < 0) ? 'Amount must be a positive number' : null,
      },
      {
        key: 'category', label: 'Category (SALARY/SUPPLIES/FOOD/UTILITIES/MAINTENANCE/EQUIPMENT/OTHER)', required: true,
        aliases: ['cat', 'type', 'expense type', 'jenis'],
        validate: (v) => {
          if (!v) return null
          const valid = ['SALARY', 'SUPPLIES', 'FOOD', 'UTILITIES', 'MAINTENANCE', 'EQUIPMENT', 'OTHER']
          const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
          if (!valid.includes(upper)) return `Category must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'OTHER',
      },
      {
        key: 'date', label: 'Expense Date',
        aliases: ['expense date', 'transaction date', 'tarikh'],
      },
      {
        key: 'vendorCode', label: 'Vendor Code (e.g. VEN-0001, links to vendor master)',
        aliases: ['vendor no', 'vendor id', 'supplier code', 'kod vendor'],
      },
      {
        key: 'vendorName', label: 'Vendor Name (free text, used if vendor code not provided)',
        aliases: ['vendor', 'supplier', 'paid to', 'kepada'],
      },
      {
        key: 'paidByStaffCode', label: 'Paid By Staff Code (e.g. STF-0003, links to staff)',
        aliases: ['staff code', 'paid by code', 'dibayar oleh kod'],
      },
      {
        key: 'paidBy', label: 'Paid By Name (free text, used if staff code not provided)',
        aliases: ['paid by name', 'payer', 'dibayar oleh'],
      },
      {
        key: 'receiptNumber', label: 'Receipt Number',
        aliases: ['receipt', 'receipt no', 'no resit'],
      },
      {
        key: 'notes', label: 'Notes',
        aliases: ['remarks', 'comment', 'catatan'],
      },
    ],
    templateRows: [
      { description: 'Monthly rice supply — 50kg', amount: 'RM 250.00', category: 'FOOD', date: '2024-03-01', vendorCode: 'VEN-0001', vendorName: 'Fresh Foods Sdn Bhd', paidByStaffCode: 'STF-0003', paidBy: 'Jane (Manager)', receiptNumber: 'R-001', notes: 'Monthly supply' },
      { description: 'Electricity bill — March', amount: '450', category: 'UTILITIES', date: '2024-03-15', vendorCode: '', vendorName: 'TNB', paidByStaffCode: '', paidBy: 'Jane (Manager)', receiptNumber: 'TNB-0324', notes: '' },
      { description: 'Nurse salary — March', amount: '3500', category: 'SALARY', date: '2024-03-31', vendorCode: '', vendorName: '', paidByStaffCode: '', paidBy: 'Owner', receiptNumber: '', notes: 'Net pay' },
    ],
    buildPayload: (row, batchId) => {
      const payload: any = {
        description: row.description,
        amount: row.amount,
        category: row.category,
        receiptNumber: row.receiptNumber || null,
        notes: row.notes || null,
        importBatchId: batchId,
      }
      // Send both vendorCode (for API resolution) and vendorName (fallback free-text)
      if (row.vendorCode) payload.vendorCode = row.vendorCode
      if (row.vendorName) payload.vendorName = row.vendorName
      // Same for paidByStaffCode / paidBy
      if (row.paidByStaffCode) payload.paidByStaffCode = row.paidByStaffCode
      if (row.paidBy) payload.paidBy = row.paidBy
      if (row.date) payload.date = row.date
      return payload
    },
  },

  // ========================================================================
  // PAYMENTS
  // ========================================================================
  {
    entityType: 'payment',
    title: 'Import Payments from CSV',
    description: 'Payments received from residents/family/insurance. Each payment auto-posts a journal entry (Dr. Cash / Cr. AR) and can optionally be applied to a specific invoice by invoice number.',
    icon: Wallet,
    endpoint: '/api/data?type=payments',
    columns: [
      {
        key: 'amount', label: 'Amount', required: true,
        aliases: ['total', 'paid', 'received', 'jumlah'],
        transform: (v) => {
          if (!v) return 0
          const cleaned = String(v).replace(/[RM$,\s]/g, '')
          const n = parseFloat(cleaned)
          return isNaN(n) ? 0 : n
        },
        validate: (v) => (typeof v !== 'number' || v <= 0) ? 'Amount must be greater than 0' : null,
      },
      {
        key: 'paymentDate', label: 'Payment Date',
        aliases: ['date', 'received date', 'tarikh bayaran'],
      },
      {
        key: 'payerName', label: 'Payer Name',
        aliases: ['payer', 'paid by', 'from', 'daripada', 'nama pembayar'],
      },
      {
        key: 'method', label: 'Method (CASH/BANK_TRANSFER/CHEQUE/CARD/INSURANCE/ONLINE/OTHER)',
        aliases: ['payment method', 'mode', 'cara bayaran'],
        validate: (v) => {
          if (!v) return null
          const valid = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'INSURANCE', 'ONLINE', 'OTHER']
          const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
          if (!valid.includes(upper)) return `Method must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'CASH',
      },
      {
        key: 'reference', label: 'Reference (cheque #, txn id)',
        aliases: ['ref', 'cheque', 'cheque number', 'transaction id', 'rujukan'],
      },
      {
        key: 'invoiceNumber', label: 'Apply to Invoice # (e.g. INV-000123)',
        aliases: ['invoice', 'invoice no', 'for invoice', 'untuk invois'],
      },
      {
        key: 'residentCode', label: 'Resident Code (e.g. RES-0001)',
        aliases: ['resident', 'resident no', 'for resident'],
      },
      {
        key: 'status', label: 'Status (PENDING/CLEARED/BOUNCED/REFUNDED)',
        aliases: ['payment status'],
        validate: (v) => {
          if (!v) return null
          const valid = ['PENDING', 'CLEARED', 'BOUNCED', 'REFUNDED']
          const upper = String(v).toUpperCase()
          if (!valid.includes(upper)) return `Status must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase() : 'CLEARED',
      },
      {
        key: 'bankAccount', label: 'Bank Account (name)',
        aliases: ['bank', 'deposited to'],
      },
      {
        key: 'notes', label: 'Notes',
        aliases: ['remarks', 'comment', 'catatan'],
      },
    ],
    templateRows: [
      { amount: '1500', paymentDate: '2024-03-15', payerName: 'Tan Ah Kow (family)', method: 'BANK_TRANSFER', reference: 'TXN-001', invoiceNumber: 'INV-000123', residentCode: 'RES-0001', status: 'CLEARED', bankAccount: 'Maybank Operating', notes: 'March room + care' },
      { amount: '800', paymentDate: '2024-03-20', payerName: 'Great Eastern Insurance', method: 'INSURANCE', reference: 'GE-CLM-456', invoiceNumber: 'INV-000124', residentCode: 'RES-0005', status: 'CLEARED', bankAccount: 'Maybank Operating', notes: 'Insurance claim' },
      { amount: '300', paymentDate: '2024-03-25', payerName: 'Walk-in cash', method: 'CASH', reference: '', invoiceNumber: '', residentCode: 'RES-0002', status: 'CLEARED', bankAccount: 'Petty Cash', notes: 'Partial payment' },
    ],
    buildPayload: (row, batchId) => {
      const payload: any = {
        amount: row.amount,
        method: row.method || 'CASH',
        status: row.status || 'CLEARED',
        payerName: row.payerName || null,
        reference: row.reference || null,
        bankAccount: row.bankAccount || null,
        notes: row.notes || null,
        importBatchId: batchId,
      }
      if (row.paymentDate) payload.paymentDate = row.paymentDate
      // Send invoiceNumber — the API will resolve it to invoiceId
      if (row.invoiceNumber) payload.invoiceNumber = row.invoiceNumber
      // Send residentCode — the registry-side onImport in BulkImports.tsx will resolve it
      // (we'll handle this via a pre-process step in the import flow)
      if (row.residentCode) payload.residentCode = row.residentCode
      return payload
    },
  },

  // ========================================================================
  // INVENTORY ITEMS (medical supplies, food, cleaning, etc.)
  // ========================================================================
  {
    entityType: 'inventory',
    title: 'Import Inventory Items from CSV',
    description: 'Physical stock items with reorder levels, supplier, and unit cost. Used by the Inventory module + Purchase Orders.',
    icon: Boxes,
    endpoint: '/api/data?type=inventory',
    applicableBusinessTypes: ['nursing_home', 'clinic', 'generic', 'tailor'],
    columns: [
      {
        key: 'name', label: 'Name', required: true,
        aliases: ['item name', 'product name', 'item', 'description', 'nama'],
        validate: (v) => typeof v === 'string' && v.length > 200 ? 'Name too long (max 200 chars)' : null,
      },
      {
        key: 'category', label: 'Category (MEDICAL/FOOD/CLEANING/OFFICE/OTHER)',
        aliases: ['cat', 'type'],
        validate: (v) => {
          if (!v) return null
          const valid = ['MEDICAL', 'FOOD', 'CLEANING', 'OFFICE', 'OTHER']
          const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
          if (!valid.includes(upper)) return `Category must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'OTHER',
      },
      {
        key: 'sku', label: 'SKU',
        aliases: ['sku number', 'item code', 'product code'],
      },
      {
        key: 'unit', label: 'Unit (each/box/bottle/kg/L)',
        aliases: ['unit type', 'measure', 'satuan'],
      },
      {
        key: 'currentStock', label: 'Current Stock',
        aliases: ['stock', 'qty', 'quantity', 'on hand', 'balance'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'reorderLevel', label: 'Reorder Level',
        aliases: ['reorder', 'min stock', 'minimum'],
        transform: (v) => {
          if (!v) return 10
          const n = parseFloat(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? 10 : n
        },
      },
      {
        key: 'reorderQty', label: 'Reorder Qty',
        aliases: ['reorder quantity', 'restock qty'],
        transform: (v) => {
          if (!v) return 50
          const n = parseFloat(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? 50 : n
        },
      },
      {
        key: 'unitCost', label: 'Unit Cost',
        aliases: ['cost', 'cost price'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'location', label: 'Location',
        aliases: ['shelf', 'room', 'storage'],
      },
      {
        key: 'supplier', label: 'Supplier (name)',
        aliases: ['vendor', 'supplier name'],
      },
      {
        key: 'notes', label: 'Notes',
        aliases: ['remarks', 'comment'],
      },
    ],
    templateRows: [
      { name: 'Disposable Gloves (Box of 100)', category: 'MEDICAL', sku: 'GLV-100', unit: 'box', currentStock: '25', reorderLevel: '10', reorderQty: '20', unitCost: '15.50', location: 'Store Room A', supplier: 'MediSupplies Sdn Bhd', notes: 'Latex, powder-free' },
      { name: 'Adult Diapers (Pack of 30)', category: 'MEDICAL', sku: 'DIA-30', unit: 'pack', currentStock: '40', reorderLevel: '15', reorderQty: '30', unitCost: '28.00', location: 'Store Room A', supplier: 'CarePlus', notes: '' },
      { name: 'Rice (10kg bag)', category: 'FOOD', sku: 'RICE-10', unit: 'bag', currentStock: '8', reorderLevel: '5', reorderQty: '10', unitCost: '45.00', location: 'Kitchen Pantry', supplier: 'Jaya Grocer', notes: '' },
    ],
    buildPayload: (row, batchId) => ({
      name: row.name,
      category: row.category || 'OTHER',
      sku: row.sku || null,
      unit: row.unit || 'each',
      currentStock: row.currentStock || 0,
      reorderLevel: row.reorderLevel ?? 10,
      reorderQty: row.reorderQty ?? 50,
      unitCost: row.unitCost || 0,
      location: row.location || null,
      supplier: row.supplier || null,
      notes: row.notes || null,
      active: true,
      lastCountDate: new Date().toISOString(),
      importBatchId: batchId,
    }),
  },

  // ========================================================================
  // PURCHASE ORDERS (header-only import; lines must be added via UI)
  // ========================================================================
  {
    entityType: 'purchaseOrder',
    title: 'Import Purchase Orders from CSV (header only)',
    description: 'Create purchase order headers in bulk. Each row becomes one PO (DRAFT status). Add line items via the PO detail view afterward.',
    icon: ShoppingCart,
    endpoint: '/api/data?type=purchaseOrders',
    applicableBusinessTypes: ['nursing_home', 'clinic', 'generic', 'tailor'],
    columns: [
      {
        key: 'vendorCode', label: 'Vendor Code (e.g. VEN-0001)',
        aliases: ['vendor', 'vendor no', 'supplier code'],
      },
      {
        key: 'orderDate', label: 'Order Date',
        aliases: ['date', 'po date'],
      },
      {
        key: 'expectedDate', label: 'Expected Date',
        aliases: ['expected', 'delivery date'],
      },
      {
        key: 'paymentMethod', label: 'Payment Method (CASH/BANK_TRANSFER/CHEQUE/CARD/ONLINE/CREDIT)',
        aliases: ['payment', 'pay method'],
        validate: (v) => {
          if (!v) return null
          const valid = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE', 'CREDIT']
          const upper = String(v).toUpperCase().replace(/[\s-]/g, '_')
          if (!valid.includes(upper)) return `Method must be one of: ${valid.join(', ')} (got "${v}")`
          return null
        },
        transform: (v) => v ? String(v).toUpperCase().replace(/[\s-]/g, '_') : 'CREDIT',
      },
      {
        key: 'paidAmount', label: 'Paid Amount',
        aliases: ['paid', 'amount paid'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'tax', label: 'Tax',
        aliases: ['sst', 'gst', 'tax amount'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'lineDescription', label: 'Line Description', required: true,
        aliases: ['description', 'item description', 'item'],
      },
      {
        key: 'lineQuantity', label: 'Line Qty', required: true,
        aliases: ['qty', 'quantity'],
        transform: (v) => {
          const n = parseFloat(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
        validate: (v) => (typeof v !== 'number' || v <= 0) ? 'Quantity must be greater than 0' : null,
      },
      {
        key: 'lineUnitPrice', label: 'Line Unit Price', required: true,
        aliases: ['unit price', 'price', 'rate'],
        transform: (v) => {
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'notes', label: 'Notes',
        aliases: ['remarks', 'comment'],
      },
    ],
    templateRows: [
      { vendorCode: 'VEN-0001', orderDate: '2026-07-11', expectedDate: '2026-07-15', paymentMethod: 'CREDIT', paidAmount: '0', tax: '0', lineDescription: 'Disposable Gloves (Box of 100)', lineQuantity: '20', lineUnitPrice: '15.50', notes: 'Monthly restock' },
      { vendorCode: 'VEN-0002', orderDate: '2026-07-11', expectedDate: '2026-07-18', paymentMethod: 'CASH', paidAmount: '500', tax: '0', lineDescription: 'Rice (10kg bag)', lineQuantity: '10', lineUnitPrice: '45.00', notes: '' },
    ],
    buildPayload: (row, batchId) => {
      // Each CSV row becomes a single-line PO. The API auto-generates the poNumber.
      const quantity = Number(row.lineQuantity) || 0
      const unitPrice = Number(row.lineUnitPrice) || 0
      const tax = Number(row.tax) || 0
      const subtotal = Math.round(quantity * unitPrice * 100) / 100
      const total = Math.round((subtotal + tax) * 100) / 100
      return {
        vendorCode: row.vendorCode || null, // API can resolve this to vendorId if supported; otherwise omit
        orderDate: row.orderDate || new Date().toISOString().slice(0, 10),
        expectedDate: row.expectedDate || null,
        paymentMethod: row.paymentMethod || 'CREDIT',
        paidAmount: Number(row.paidAmount) || 0,
        tax,
        notes: row.notes || null,
        status: 'DRAFT',
        lines: [
          {
            description: row.lineDescription,
            quantity,
            unitPrice,
            total: subtotal,
          },
        ],
        importBatchId: batchId,
      }
    },
  },

  // ========================================================================
  // JOURNAL ENTRIES (manual GL postings)
  // ========================================================================
  {
    entityType: 'journalEntry',
    title: 'Import Journal Entries from CSV',
    description: 'Manual double-entry journal postings. Each row is one line; group multiple lines with the same Reference # to form a single balanced entry.',
    icon: FileText,
    endpoint: '/api/data?type=journalEntries',
    applicableBusinessTypes: ['nursing_home', 'clinic', 'generic', 'tailor'],
    columns: [
      {
        key: 'reference', label: 'Reference (group lines into 1 JE)', required: true,
        aliases: ['ref', 'batch', 'group', 'je ref'],
      },
      {
        key: 'entryDate', label: 'Entry Date',
        aliases: ['date', 'je date'],
      },
      {
        key: 'memo', label: 'Memo', required: true,
        aliases: ['description', 'narration', 'remarks'],
      },
      {
        key: 'accountCode', label: 'Account Code', required: true,
        aliases: ['gl code', 'account', 'akaun'],
      },
      {
        key: 'debit', label: 'Debit',
        aliases: ['dr'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'credit', label: 'Credit',
        aliases: ['cr'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
      },
      {
        key: 'lineDescription', label: 'Line Description',
        aliases: ['line memo', 'details'],
      },
    ],
    templateRows: [
      { reference: 'JE-JUL-001', entryDate: '2026-07-10', memo: 'Office supplies purchase', accountCode: '5100', debit: '150.00', credit: '0', lineDescription: 'Stationery' },
      { reference: 'JE-JUL-001', entryDate: '2026-07-10', memo: 'Office supplies purchase', accountCode: '1010', debit: '0', credit: '150.00', lineDescription: 'Paid cash' },
      { reference: 'JE-JUL-002', entryDate: '2026-07-11', memo: 'Bank fees', accountCode: '5300', debit: '25.00', credit: '0', lineDescription: 'Maybank monthly fee' },
      { reference: 'JE-JUL-002', entryDate: '2026-07-11', memo: 'Bank fees', accountCode: '1010', debit: '0', credit: '25.00', lineDescription: 'Auto-debited' },
    ],
    // Special: this import groups rows by `reference` and posts one JE per group.
    // The buildPayload below produces one line; BulkImports.tsx onImport for journalEntry
    // pre-aggregates rows into a single POST per group.
    buildPayload: (row, batchId) => ({
      reference: row.reference,
      entryDate: row.entryDate,
      memo: row.memo,
      accountCode: row.accountCode,
      debit: row.debit || 0,
      credit: row.credit || 0,
      lineDescription: row.lineDescription || null,
      importBatchId: batchId,
    }),
  },

  // ========================================================================
  // PRODUCT VENDOR PRICES (per-vendor cost prices for products)
  // ========================================================================
  {
    entityType: 'productVendorPrice',
    title: 'Import Product Vendor Prices from CSV',
    description: 'Set vendor-specific cost prices for products. Each row links a product to a vendor with a unit cost (used when creating purchase orders).',
    icon: Tags,
    endpoint: '/api/data?type=productVendorPrices',
    applicableBusinessTypes: ['nursing_home', 'clinic', 'generic', 'tailor'],
    columns: [
      {
        key: 'productCode', label: 'Product Code (e.g. PRD-0001)', required: true,
        aliases: ['product', 'product no', 'code'],
      },
      {
        key: 'vendorCode', label: 'Vendor Code (e.g. VEN-0001)', required: true,
        aliases: ['vendor', 'vendor no', 'supplier code'],
      },
      {
        key: 'unitCost', label: 'Unit Cost', required: true,
        aliases: ['cost', 'cost price', 'price'],
        transform: (v) => {
          if (!v) return 0
          const n = parseFloat(String(v).replace(/[RM$,\s]/g, ''))
          return isNaN(n) ? 0 : n
        },
        validate: (v) => (typeof v !== 'number' || v < 0) ? 'Unit cost cannot be negative' : null,
      },
      {
        key: 'minOrderQty', label: 'Min Order Qty',
        aliases: ['moq', 'minimum order'],
        transform: (v) => {
          if (!v) return null
          const n = parseFloat(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? null : n
        },
      },
      {
        key: 'leadTimeDays', label: 'Lead Time (days)',
        aliases: ['lead time', 'lead'],
        transform: (v) => {
          if (!v) return null
          const n = parseInt(String(v).replace(/[,\s]/g, ''))
          return isNaN(n) ? null : n
        },
      },
      {
        key: 'effectiveFrom', label: 'Effective From',
        aliases: ['from', 'start date'],
      },
      {
        key: 'effectiveTo', label: 'Effective To',
        aliases: ['to', 'end date', 'expires'],
      },
      {
        key: 'notes', label: 'Notes',
        aliases: ['remarks'],
      },
    ],
    templateRows: [
      { productCode: 'PRD-0001', vendorCode: 'VEN-0001', unitCost: '12.50', minOrderQty: '10', leadTimeDays: '3', effectiveFrom: '2026-07-01', effectiveTo: '', notes: 'Bulk discount' },
      { productCode: 'PRD-0001', vendorCode: 'VEN-0002', unitCost: '14.00', minOrderQty: '5', leadTimeDays: '5', effectiveFrom: '2026-07-01', effectiveTo: '', notes: 'Faster delivery' },
      { productCode: 'PRD-0005', vendorCode: 'VEN-0001', unitCost: '28.00', minOrderQty: '20', leadTimeDays: '7', effectiveFrom: '2026-07-01', effectiveTo: '', notes: '' },
    ],
    buildPayload: (row, batchId) => ({
      productCode: row.productCode,
      vendorCode: row.vendorCode,
      unitCost: row.unitCost || 0,
      minOrderQty: row.minOrderQty ?? null,
      leadTimeDays: row.leadTimeDays ?? null,
      effectiveFrom: row.effectiveFrom || null,
      effectiveTo: row.effectiveTo || null,
      notes: row.notes || null,
      importBatchId: batchId,
    }),
  },
]

/**
 * Find a registry entry by entityType.
 */
export function getBulkImportDefinition(entityType: string): BulkImportDefinition | undefined {
  return BULK_IMPORT_REGISTRY.find(d => d.entityType === entityType)
}
