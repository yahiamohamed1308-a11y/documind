import React, { useEffect, useState, useRef } from 'react'
import {
  uploadMultipleDocuments,
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
  { label: '📅 Expiring documents', query: 'Show me documents expiring soon' },
  { label: '🗂️ أحدث المستندات', query: 'أحدث المستندات اللي اترفعت' },
  { label: "💰 This month's invoices", query: "Show me this month's invoices" },
  { label: '📦 شحنات', query: 'ابعتلي كل شهادات الشحن' },
]

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'upload', label: 'Upload', icon: '📤' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'chat', label: 'AI Chat', icon: '💬' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [documents, setDocuments] = useState([])
  const [activity, setActivity] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [insight, setInsight] = useState('')
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [uploadResults, setUploadResults] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
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

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setUploading(true)
    setErrorMsg('')
    setUploadResults(files.map((f) => ({ file: f.name, status: 'pending' })))

    const results = await uploadMultipleDocuments(files, yourName || 'Unknown', (done) => {
      setUploadResults((prev) =>
        prev.map((r, i) => (i < done ? { ...r, status: 'done' } : r))
      )
    })

    setUploadResults(
      results.map((r) => ({ file: r.file, status: r.success ? 'success' : 'failed', error: r.error }))
    )

    for (const r of results) {
      if (r.success) {
        await logActivity(yourName || 'Unknown', 'upload', `uploaded "${r.file}"`)
      }
    }
    setUploading(false)
  }

  function handleFileInputChange(e) {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
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
        <h1>DocuMind</h1>
        <p>Upload once, ask in Arabic or English, get everything compiled instantly.</p>
        <div className="header-controls">
          <button className="name-btn" onClick={handleSetName}>
            {yourName ? `👤 ${yourName}` : '👤 Set your name'}
          </button>
          {onlineUsers.map((u) => (
            <span key={u.user_name} className="presence-dot">{u.user_name}</span>
          ))}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}{t.id === 'library' ? ` (${documents.length})` : ''}</span>
          </button>
        ))}
      </div>

      {errorMsg && <div className="error-msg">{errorMsg}</div>}

      <div className="panel">
        {tab === 'dashboard' && (
          <div>
            <div className="card-grid">
              <div className="stat-card">
                <span className="stat-value" style={{ color: healthScore > 80 ? 'var(--green)' : 'var(--accent-gold)' }}>
                  {healthScore}%
                </span>
                <span className="stat-label">Vault Health Score</span>
                <span className="stat-sub">{expiringSoon.length} expiring soon · {uncategorized} uncategorized</span>
              </div>
              <div className="stat-card insight-card">
                <span className="insight-title">💡 Smart Insight</span>
                <span className="insight-text">{insight}</span>
              </div>
            </div>

            <p className="section-title">Recent Activity</p>
            <div className="doc-list">
              {activity.length === 0 && <p className="empty-state">No activity yet — upload something to get started.</p>}
              {activity.map((a) => (
                <div className="activity-item" key={a.id}>
                  <span><span className="who">{a.actor}</span> {a.description}</span>
                  <span className="when">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div>
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="dropzone-icon">📤</div>
              <div className="dropzone-title">Drag files here or click to browse</div>
              <div className="dropzone-sub">Upload as many files as you want at once — PDF, images, Word docs</div>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            </div>

            {uploadResults.length > 0 && (
              <div className="upload-progress-list">
                {uploadResults.map((r, i) => (
                  <div className={`upload-progress-item ${r.status}`} key={i}>
                    <span>{r.file}</span>
                    <span>
                      {r.status === 'pending' && '⏳ uploading…'}
                      {r.status === 'success' && '✅ done'}
                      {r.status === 'failed' && `❌ ${r.error}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="stat-sub" style={{ marginTop: 16 }}>
              Files are saved permanently and instantly visible to everyone sharing this app, on any device.
            </p>
          </div>
        )}

        {tab === 'library' && (
          <div className="doc-list">
            {documents.length === 0 && <p className="empty-state">No documents uploaded yet.</p>}
            {documents.map((d) => (
              <div className="doc-item" key={d.id}>
                <span className="filename">{d.file_name}</span>
                <span className="uploader">{d.uploaded_by}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div>
            <div className="chip-row">
              {SUGGESTED_CHIPS.map((c) => (
                <button key={c.label} className="chip" onClick={() => runQuery(c.query)}>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="chat-window">
              {messages.length === 0 && (
                <p className="empty-state">Ask about invoices, contracts, or any document — in Arabic or English.</p>
              )}
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
              <button className="btn-primary" onClick={() => runQuery(query)}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
