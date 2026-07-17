import React, { useEffect, useState, useRef } from 'react'
import {
  uploadDocument,
  fetchAllDocuments,
  subscribeToDocuments,
  logActivity,
  fetchRecentActivity,
  subscribeToActivity,
  pingPresence,
  fetchPresence,
  subscribeToPresence,
} from './lib/supabaseClient'
import { askAI } from './lib/aiClient'
import { jsPDF } from 'jspdf'

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text)
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const SUGGESTED_CHIPS = [
  { label: 'Expiring documents', query: 'Show me documents expiring soon' },
  { label: 'أحدث المستندات', query: 'أحدث المستندات اللي اترفعت' },
  { label: "This month's invoices", query: "Show me this month's invoices" },
  { label: 'شحنات', query: 'ابعتلي كل شهادات الشحن' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [documents, setDocuments] = useState([])
  const [activity, setActivity] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [insight, setInsight] = useState('')
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [yourName, setYourName] = useState(
    localStorage.getItem('documind_username') || ''
  )
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchAllDocuments().then(setDocuments).catch((e) => setErrorMsg(e.message))
    fetchRecentActivity().then(setActivity).catch(() => {})
    fetchPresence().then(setOnlineUsers).catch(() => {})

    const unsubDocs = subscribeToDocuments(() => {
      fetchAllDocuments().then(setDocuments).catch((e) => setErrorMsg(e.message))
    })
    const unsubActivity = subscribeToActivity(() => {
      fetchRecentActivity().then(setActivity).catch(() => {})
    })
    const unsubPresence = subscribeToPresence(() => {
      fetchPresence().then(setOnlineUsers).catch(() => {})
    })

    return () => {
      unsubDocs()
      unsubActivity()
      unsubPresence()
    }
  }, [])

  useEffect(() => {
    if (!yourName) return
    pingPresence(yourName)
    const interval = setInterval(() => pingPresence(yourName), 15000)
    return () => clearInterval(interval)
  }, [yourName])

  useEffect(() => {
    if (documents.length === 0) {
      setInsight('No documents yet. Upload your first one to get started.')
      return
    }
    fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, language: 'en' }),
    })
      .then((r) => r.json())
      .then((d) => setInsight(d.insight || ''))
      .catch(() => setInsight(''))
  }, [documents])

  function handleSetName() {
    const name = prompt('Enter your name (so uploads show who added them):')
    if (name) {
      localStorage.setItem('documind_username', name)
      setYourName(name)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setErrorMsg('')
    try {
      const doc = await uploadDocument(file, yourName || 'Unknown')
      await logActivity(yourName || 'Unknown', 'upload', `uploaded "${doc.file_name}"`)
    } catch (err) {
      setErrorMsg(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function runQuery(userQuery) {
    if (!userQuery.trim()) return
    setMessages((m) => [...m, { role: 'user', text: userQuery }])
    setQuery('')
    setErrorMsg('')

    try {
      const result = await askAI(userQuery, documents)
      setMessages((m) => [...m, { role: 'ai', text: result.answer, matchedDocIds: result.matchedDocIds }])
      await logActivity(yourName || 'Unknown', 'search', `searched "${userQuery}"`)
    } catch (err) {
      setErrorMsg(err.message)
      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: isArabic(userQuery)
            ? 'حصل خطأ أثناء البحث. جرب تاني كمان شوية.'
            : 'Sorry, something went wrong while searching. Please try again.',
        },
      ])
    }
  }

  function compilePDF(matchedDocIds) {
    const matched = documents.filter((d) => matchedDocIds.includes(d.id))
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('DocuMind — Compiled Results', 10, 15)
    doc.setFontSize(11)
    let y = 30
    matched.forEach((d, i) => {
      doc.text(`${i + 1}. ${d.file_name} (uploaded by ${d.uploaded_by})`, 10, y)
      y += 8
      if (y > 270) {
        doc.addPage()
        y = 20
      }
    })
    doc.save('documind_results.pdf')
  }

  const totalDocs = documents.length
  const categorized = documents.filter((d) => d.category).length
  const withExpiryFlagged = documents.filter((d) => !d.expiry_date || new Date(d.expiry_date) > new Date()).length
  const healthScore =
    totalDocs === 0
      ? 100
      : Math.round(((categorized + withExpiryFlagged) / (totalDocs * 2)) * 100)
  const expiringSoon = documents.filter((d) => {
    if (!d.expiry_date) return false
    const days = (new Date(d.expiry_date) - new Date()) / 86400000
    return days > 0 && days < 60
  })
  const uncategorized = totalDocs - categorized

  return (
    <div className="app">
      <div className="header">
        <h1>DocuMind — AI Document Library</h1>
        <p>Upload once, ask in Arabic or English, get everything compiled instantly.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, alignItems: 'center' }}>
          <button className="upload-btn" onClick={handleSetName}>
            {yourName ? `👤 ${yourName}` : 'Set your name'}
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            {onlineUsers.map((u) => (
              <span key={u.user_name} title={`${u.user_name} online`} style={{
                background: '#22c55e', color: '#0a0a0f', borderRadius: 12, padding: '4px 10px', fontSize: 12, fontWeight: 600
              }}>
                ● {u.user_name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={`tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>Upload</button>
        <button className={`tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>Library ({documents.length})</button>
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>AI Chat</button>
      </div>

      {errorMsg && <div className="error-msg">{errorMsg}</div>}

      <div className="panel">
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div className="doc-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <strong style={{ fontSize: 24, color: healthScore > 80 ? '#22c55e' : '#f59e0b' }}>{healthScore}%</strong>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>Vault health score</span>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  {expiringSoon.length} expiring soon · {uncategorized} uncategorized
                </span>
              </div>
              <div className="doc-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <strong style={{ fontSize: 15 }}>💡 Smart Insight</strong>
                <span style={{ color: '#d1d5db', fontSize: 13 }}>{insight}</span>
              </div>
            </div>

            <h3 style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Recent Activity</h3>
            <div className="doc-list">
              {activity.length === 0 && <p style={{ color: '#9ca3af' }}>No activity yet.</p>}
              {activity.map((a) => (
                <div className="doc-item" key={a.id}>
                  <span>{a.actor} {a.description}</span>
                  <span style={{ color: '#9ca3af' }}>{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div>
            <input type="file" ref={fileInputRef} onChange={handleUpload} disabled={uploading} />
            {uploading && <p>Uploading…</p>}
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>
              Files are saved permanently and instantly visible to everyone sharing this app, on any device.
            </p>
          </div>
        )}

        {tab === 'library' && (
          <div className="doc-list">
            {documents.length === 0 && <p style={{ color: '#9ca3af' }}>No documents uploaded yet.</p>}
            {documents.map((d) => (
              <div className="doc-item" key={d.id}>
                <span>{d.file_name}</span>
                <span style={{ color: '#9ca3af' }}>{d.uploaded_by}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {SUGGESTED_CHIPS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => runQuery(c.query)}
                  style={{
                    background: '#26262f', color: '#d1d5db', border: '1px solid #333',
                    borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer'
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="chat-window">
              {messages.map((m, i) => (
                <div key={i}>
                  <div className={`bubble ${m.role}`} dir={isArabic(m.text) ? 'rtl' : 'ltr'}>
                    {m.text}
                  </div>
                  {m.role === 'ai' && m.matchedDocIds && m.matchedDocIds.length > 0 && (
                    <button className="pdf-btn" style={{ marginTop: 6 }} onClick={() => compilePDF(m.matchedDocIds)}>
                      📄 Download compiled PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="input-row">
              <input
                dir={isArabic(query) ? 'rtl' : 'ltr'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runQuery(query)}
                placeholder="اسأل بالعربي أو English…"
              />
              <button onClick={() => runQuery(query)}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
