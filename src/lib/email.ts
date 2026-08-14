import nodemailer from 'nodemailer'
import { db } from '@/lib/db'

/**
 * Email Helper — sends transactional emails via SMTP.
 *
 * SMTP configuration is read from environment variables (not from the DB)
 * so it works on Vercel / any serverless platform where env vars are the
 * standard way to manage secrets.
 *
 * === Environment Variables ===
 *
 *   SMTP_HOST          — e.g. "smtp.gmail.com", "smtp.sendgrid.net", "smtp.mailgun.org"
 *   SMTP_PORT          — e.g. 587 (STARTTLS), 465 (SSL), 25 (plain — not recommended)
 *   SMTP_USER          — username (usually the full email address)
 *   SMTP_PASS          — password or app-specific password
 *   SMTP_SECURE        — "true" for port 465 (implicit SSL), "false" for 587 (STARTTLS)
 *   EMAIL_FROM         — default From address, e.g. "Serenity Care <noreply@serenitycare.com>"
 *   EMAIL_FROM_NAME    — display name (optional, defaults to app name from DB settings)
 *
 * === Common SMTP Providers ===
 *
 * 1. Gmail (free, up to 500/day):
 *    SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_SECURE=false
 *    SMTP_USER=you@gmail.com   SMTP_PASS=<app password from Google Account>
 *    (Enable 2FA → generate App Password at https://myaccount.google.com/apppasswords)
 *
 * 2. SendGrid (free tier: 100/day):
 *    SMTP_HOST=smtp.sendgrid.net  SMTP_PORT=587  SMTP_SECURE=false
 *    SMTP_USER=apikey             SMTP_PASS=<your SendGrid API key>
 *
 * 3. Mailgun (free tier: 5k/month for 3 months):
 *    SMTP_HOST=smtp.mailgun.org  SMTP_PORT=587  SMTP_SECURE=false
 *    SMTP_USER=postmaster@<your-domain>.mailgun.org  SMTP_PASS=<Mailgun SMTP password>
 *
 * 4. Amazon SES (cheapest at scale):
 *    SMTP_HOST=email-smtp.<region>.amazonaws.com  SMTP_PORT=587  SMTP_SECURE=false
 *    SMTP_USER=<SES SMTP username>  SMTP_PASS=<SES SMTP password>
 *
 * 5. Resend (modern, developer-friendly, free 3k/month):
 *    SMTP_HOST=smtp.resend.com  SMTP_PORT=465  SMTP_SECURE=true
 *    SMTP_USER=resend          SMTP_PASS=<your Resend API key>
 *
 * 6. Brevo / Sendinblue (free 300/day):
 *    SMTP_HOST=smtp-relay.brevo.com  SMTP_PORT=587  SMTP_SECURE=false
 *    SMTP_USER=<your Brevo login email>  SMTP_PASS=<Brevo SMTP key>
 */

let cachedTransporter: nodemailer.Transporter | null = null

/**
 * Lazily creates (and caches) the nodemailer transporter from env vars.
 * Returns null if SMTP is not configured — callers should check + skip
 * silently rather than throwing.
 */
function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    return null  // SMTP not configured — skip email sending
  }

  const secure = process.env.SMTP_SECURE === 'true'

  cachedTransporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure,
    auth: { user, pass },
  })

  return cachedTransporter
}

/**
 * Checks if SMTP is configured (all 4 required env vars present).
 * Used by the Settings UI + API to show whether email is available.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * Returns the configured From address, falling back to the DB-stored
 * emailFromAddress setting, then to a default.
 */
async function getFromAddress(): Promise<string> {
  // Priority: env var > DB setting > default
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM

  try {
    const setting = await db.setting.findUnique({ where: { key: 'emailFromAddress' } })
    if (setting?.value) {
      try { return JSON.parse(setting.value) } catch { return setting.value }
    }
  } catch { /* ignore DB errors */ }

  return 'noreply@serenity-care.app'
}

export interface SendEmailOptions {
  to: string
  subject: string
  html?: string
  text?: string
  from?: string  // override the default From address
}

/**
 * Sends a transactional email via SMTP.
 *
 * Returns `{ success: true }` on success, or `{ success: false, error }` on failure.
 * If SMTP is not configured, returns `{ success: false, error: 'SMTP not configured' }`
 * without throwing — so callers can use `?.catch(() => {})` for non-critical emails.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter()
  if (!transporter) {
    return { success: false, error: 'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.' }
  }

  const from = opts.from || await getFromAddress()

  try {
    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || opts.html?.replace(/<[^>]*>/g, ''),  // strip HTML for text fallback
    })
    return { success: true }
  } catch (e: any) {
    console.error('[Email] Send failed:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * Verifies the SMTP connection by sending a NOOP command.
 * Used by the Settings → "Test SMTP" button.
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter()
  if (!transporter) {
    return { success: false, error: 'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.' }
  }
  try {
    await transporter.verify()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================================================
// Notification helpers — send specific notification types
// ============================================================================

/**
 * Sends a notification email if the corresponding event is enabled in
 * Settings → Email Notifications. Checks:
 *   1. Is SMTP configured? (env vars)
 *   2. Is emailNotificationsEnabled = true? (DB setting)
 *   3. Is this specific event in the notificationEvents list? (DB setting)
 *
 * If any check fails, returns silently (non-blocking).
 */
export async function sendNotificationEmail(
  event: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  try {
    // Check if SMTP is configured
    if (!isEmailConfigured()) return

    // Check if email notifications are enabled + this event is in the list
    const enabledSetting = await db.setting.findUnique({ where: { key: 'emailNotificationsEnabled' } })
    const enabled = enabledSetting ? JSON.parse(enabledSetting.value) : false
    if (!enabled) return

    const eventsSetting = await db.setting.findUnique({ where: { key: 'notificationEvents' } })
    const events: string[] = eventsSetting ? JSON.parse(eventsSetting.value) : []
    if (!events.includes(event)) return

    // Send the email (non-blocking — errors are logged but don't throw)
    await sendEmail({ to, subject, html }).catch(e => {
      console.error(`[Email] Notification "${event}" failed:`, e.message)
    })
  } catch (e: any) {
    // Non-blocking — email failures should never break the main operation
    console.error('[Email] Notification check failed:', e.message)
  }
}
