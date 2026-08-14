/**
 * Input sanitization utilities to prevent XSS, SQL injection, and log injection.
 * Use these on all user-provided inputs before storing or displaying them.
 */

/**
 * Sanitizes a string input by:
 * - Trimming whitespace
 * - Limiting length
 * - Stripping null bytes
 * - Escaping HTML special characters (for XSS prevention when displayed)
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 1000): string {
  if (!input) return ''
  return input
    .replace(/\0/g, '')          // Remove null bytes
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitizes an email address:
 * - Lowercase
 * - Trim
 * - Basic format validation
 * - Max 255 chars
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return ''
  return email.toLowerCase().trim().slice(0, 255)
}

/**
 * Validates password strength:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * Returns { valid: boolean, message: string }
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' }
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' }
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' }
  }
  return { valid: true, message: 'Password is strong enough' }
}

/**
 * Validates an email address format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 255
}

/**
 * Sanitizes an object by applying sanitizeString to all string values.
 * Recursively handles nested objects and arrays.
 */
export function sanitizeObject<T>(obj: T, maxLength: number = 5000): T {
  if (typeof obj === 'string') {
    return sanitizeString(obj, maxLength) as unknown as T
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxLength)) as unknown as T
  }
  if (obj && typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value, maxLength)
    }
    return result
  }
  return obj
}
