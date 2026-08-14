'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch } from './api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { fmtDateTime, fmtDate, fmtTime, initials } from '@/lib/types'
import {
  Send, Mail, MailOpen, Plus, MessageSquare, Reply, ChevronLeft,
  User, Search, X, Phone, BedDouble, Pill
} from 'lucide-react'
import { toast } from 'sonner'
import { StandardSearchBar } from './StandardSearchBar'
import { ResidentSelect } from './ResidentSelect'

// Helper: Build a display name for a message sender that includes their relationship to the resident.
// For staff: "Sarah Chen (Owner)" or "Nurse Linda (Nurse)"
// For family: "Patricia Anderson (Daughter of RES-0028 Angela Anderson)"
//   — uses the resident's emergencyContactName and emergencyContactRelation
function getSenderDisplayName(sender: any, resident: any): string {
  if (!sender) return 'Unknown'
  const senderName = sender.name || 'Unknown'
  const senderRole = sender.role || ''

  // If sender is FAMILY, derive relationship from the resident's emergency contact info
  if (senderRole === 'FAMILY') {
    const ecName = resident?.emergencyContactName
    const ecRelation = resident?.emergencyContactRelation
    const resName = resident ? `${resident.firstName} ${resident.lastName}` : 'resident'
    const resCode = resident?.code || ''
    if (ecName && ecRelation) {
      return `${ecName} (${ecRelation} of ${resCode} ${resName})`
    }
    return `${senderName} (Family of ${resCode} ${resName})`
  }

  // For staff, show name + role
  const roleLabel = senderRole === 'OWNER' ? 'Owner' :
    senderRole === 'MANAGER' ? 'Manager' :
    senderRole === 'NURSE' ? 'Nurse' :
    senderRole === 'DOCTOR' ? 'Doctor' :
    senderRole === 'CARE_STAFF' ? 'Care Staff' :
    senderRole === 'RECEPTION' ? 'Reception' :
    senderRole === 'PHYSIO' ? 'Physio' :
    senderRole === 'DIETITIAN' ? 'Dietitian' :
    senderRole
  return `${senderName} (${roleLabel})`
}

export function Messages({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=messages${facilityParam}&_t=${refreshTick}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')

  const triggerRefresh = useCallback(() => { setRefreshTick(t => t + 1); refetch() }, [refetch])

  if (loading) return <Skeleton className="h-96" />

  const me = currentUser?.user

  // Sort all messages by time
  const allMessages = (data || []).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())

  // Group messages by residentId → conversation
  const conversations: Record<string, any[]> = {}
  for (const m of allMessages) {
    const key = m.residentId
    if (!conversations[key]) conversations[key] = []
    conversations[key].push(m)
  }

  // Build conversation list with metadata
  const conversationList = Object.entries(conversations).map(([residentId, msgs]) => {
    const lastMsg = msgs[msgs.length - 1]
    const unreadCount = msgs.filter(m => !m.read && m.senderId !== me?.id).length
    const resident = lastMsg.resident
    return {
      residentId,
      resident,
      messages: msgs,
      lastMessage: lastMsg,
      unreadCount,
      lastMessageTime: lastMsg.sentAt,
    }
  }).sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())

  // Filter conversations by search
  const filteredConversations = conversationList.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      `${c.resident?.firstName} ${c.resident?.lastName}`.toLowerCase().includes(s) ||
      c.resident?.code?.toLowerCase().includes(s) ||
      c.lastMessage?.subject?.toLowerCase().includes(s) ||
      c.lastMessage?.body?.toLowerCase().includes(s) ||
      c.lastMessage?.sender?.name?.toLowerCase().includes(s)
    )
  })

  // Get the selected conversation
  const selectedConversation = selectedResidentId ? conversationList.find(c => c.residentId === selectedResidentId) : null

  // If a conversation is selected, show the chat view
  if (selectedConversation) {
    return (
      <ChatView
        conversation={selectedConversation}
        currentUser={me}
        onBack={() => setSelectedResidentId(null)}
        onSend={async (body) => {
          try {
            await apiPost('/api/data?type=messages', {
              residentId: selectedResidentId,
              senderId: me.id,
              subject: null,
              body,
              read: false,
              sentAt: new Date(),
            })
            triggerRefresh()
          } catch (e: any) {
            toast.error(e.message)
          }
        }}
        onMarkRead={async (msgId: string) => {
          try {
            await apiPatch(`/api/data?type=messages&id=${msgId}`, { read: true })
            triggerRefresh()
          } catch {}
        }}
      />
    )
  }

  // Otherwise show the conversation list
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-teal-50"><MessageSquare className="h-3.5 w-3.5 text-teal-600" /></div>
            <span className="text-xs text-muted-foreground">Conversations</span>
          </div>
          <div className="text-2xl font-bold">{conversationList.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-amber-50"><Mail className="h-3.5 w-3.5 text-amber-600" /></div>
            <span className="text-xs text-muted-foreground">Unread</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{conversationList.reduce((s, c) => s + c.unreadCount, 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-sky-50"><Send className="h-3.5 w-3.5 text-sky-600" /></div>
            <span className="text-xs text-muted-foreground">Total Messages</span>
          </div>
          <div className="text-2xl font-bold text-sky-600">{allMessages.length}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search conversations by resident, message, or sender..."
          totalCount={conversationList.length}
          filteredCount={filteredConversations.length}
        />
        <Button onClick={() => setShowCompose(true)} className="flex-shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Compose
        </Button>
      </div>

      {/* Conversation list — WhatsApp style */}
      <Card>
        <CardContent className="p-0">
          {filteredConversations.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No conversations match your search' : 'No messages yet'}
              </p>
              {!search && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCompose(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Start a conversation
                </Button>
              )}
            </div>
          )}
          <div className="divide-y">
            {filteredConversations.map((c) => {
              const lastMsg = c.lastMessage
              const isSentByMe = me && lastMsg.senderId === me.id
              return (
                <div
                  key={c.residentId}
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    // Mark unread messages as read when opening
                    c.messages.filter(m => !m.read && m.senderId !== me?.id).forEach(async (m) => {
                      try { await apiPatch(`/api/data?type=messages&id=${m.id}`, { read: true }) } catch {}
                    })
                    setSelectedResidentId(c.residentId)
                  }}
                >
                  {/* Avatar */}
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarFallback className="bg-teal-100 text-teal-700 text-sm">
                      {initials(c.resident?.firstName, c.resident?.lastName)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.resident?.code && (
                          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1 bg-primary/5 text-primary flex-shrink-0">
                            {c.resident.code}
                          </Badge>
                        )}
                        <span className="font-medium text-sm truncate">
                          {c.resident?.firstName} {c.resident?.lastName}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {fmtTime(lastMsg.sentAt)}
                      </span>
                    </div>

                    {/* Last message preview */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {isSentByMe ? <span className="text-sky-600">You: </span> : <span>{getSenderDisplayName(lastMsg.sender, c.resident).split('(')[0].trim()}: </span>}
                        {lastMsg.body}
                      </p>
                      {c.unreadCount > 0 && (
                        <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center flex-shrink-0">
                          {c.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {showCompose && (
        <ComposeDialog
          facilityId={facilityId}
          currentUser={me}
          onClose={() => setShowCompose(false)}
          onSaved={() => { setShowCompose(false); triggerRefresh() }}
        />
      )}
    </div>
  )
}

// ============ CHAT VIEW (WhatsApp-style conversation) ============
function ChatView({ conversation, currentUser, onBack, onSend, onMarkRead }: any) {
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation.messages.length])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSend = async () => {
    if (!replyText.trim()) return
    setSending(true)
    await onSend(replyText.trim())
    setReplyText('')
    setSending(false)
    textareaRef.current?.focus()
  }

  // Handle Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const resident = conversation.resident
  const messages = conversation.messages

  return (
    <div className="space-y-0" style={{ height: 'calc(100vh - 12rem)', minHeight: '500px' }}>
      <Card className="flex flex-col h-full overflow-hidden">
        {/* Chat header — resident info */}
        <div className="flex items-center gap-3 p-3 border-b bg-muted/30">
          <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-teal-100 text-teal-700 text-sm">
              {initials(resident?.firstName, resident?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {resident?.code && (
                <Badge variant="outline" className="text-[10px] font-mono py-0 px-1 bg-primary/5 text-primary">
                  {resident.code}
                </Badge>
              )}
              <span className="font-medium text-sm truncate">{resident?.firstName} {resident?.lastName}</span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              {resident?.room?.roomNumber && (
                <span className="flex items-center gap-0.5"><BedDouble className="h-2.5 w-2.5" /> Room {resident.room.roomNumber}</span>
              )}
              {resident?.emergencyContactName && (
                <>
                  <span>•</span>
                  <span>EC: {resident.emergencyContactName}{resident.emergencyContactRelation ? ` (${resident.emergencyContactRelation})` : ''}</span>
                </>
              )}
              <span>•</span>
              <span>{messages.length} msg{messages.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Messages thread — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
          {messages.map((m: any, i: number) => {
            const isSentByMe = currentUser && m.senderId === currentUser.id
            const showDateDivider = i === 0 || fmtDate(messages[i - 1].sentAt) !== fmtDate(m.sentAt)

            return (
              <div key={m.id}>
                {/* Date divider */}
                {showDateDivider && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-xs text-muted-foreground bg-background px-3 py-1 rounded-full border">
                      {fmtDate(m.sentAt)}
                    </span>
                  </div>
                )}

                {/* Message bubble */}
                <div className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                    isSentByMe
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-background border rounded-bl-sm'
                  }`}>
                    {/* Sender name (for received messages) */}
                    {!isSentByMe && (i === 0 || messages[i - 1].senderId !== m.senderId) && (
                      <div className="text-xs font-medium text-teal-600 mb-0.5">
                        {getSenderDisplayName(m.sender, resident)}
                      </div>
                    )}

                    {/* Subject (if any) */}
                    {m.subject && (
                      <div className={`text-xs font-medium mb-1 ${isSentByMe ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {m.subject}
                      </div>
                    )}

                    {/* Message body */}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>

                    {/* Timestamp */}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${isSentByMe ? 'text-primary-foreground/60 justify-end' : 'text-muted-foreground'}`}>
                      {fmtTime(m.sentAt)}
                      {isSentByMe && (m.read ? <MailOpen className="h-2.5 w-2.5" /> : <Mail className="h-2.5 w-2.5" />)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input — fixed at bottom */}
        <div className="border-t p-3 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              rows={1}
              value={replyText}
              onChange={e => {
                setReplyText(e.target.value)
                // Auto-resize textarea
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              className="flex-1 resize-none min-h-[40px] max-h-[120px] text-sm"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              size="icon"
              className="rounded-full h-10 w-10 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ============ COMPOSE DIALOG ============
function ComposeDialog({ facilityId, currentUser, onClose, onSaved }: any) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const [form, setForm] = useState<any>({ residentId: '', subject: '', body: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.residentId) { toast.error('Please select a resident'); return }
    if (!form.body.trim()) { toast.error('Message cannot be empty'); return }
    if (!currentUser) { toast.error('You must be signed in'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=messages', {
        residentId: form.residentId,
        senderId: currentUser.id,
        subject: form.subject || null,
        body: form.body,
        read: false,
        sentAt: new Date(),
      })
      toast.success('Message sent')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Send className="h-4 w-4" /> New Message</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To (Resident) *</label>
            <ResidentSelect
              residents={residents || []}
              value={form.residentId}
              onChange={(id) => setForm({ ...form, residentId: id })}
              placeholder="— Select resident —"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject (optional)</label>
            <Input
              value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              placeholder="e.g. Update request, visit inquiry..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Message *</label>
            <Textarea
              rows={5}
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
              placeholder="Type your message..."
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.residentId || !form.body.trim()}>
            <Send className="h-3 w-3 mr-1" /> {saving ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
