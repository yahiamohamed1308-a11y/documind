// Vercel serverless function: /api/insights
// Uses Google Gemini (free tier) to generate the Dashboard's "Smart Insights" card.
// Get a free key at https://aistudio.google.com/app/apikey — set as GEMINI_API_KEY.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { documents, language } = req.body

    if (!Array.isArray(documents)) {
      return res.status(400).json({ error: 'Missing or invalid "documents" array' })
    }

    if (documents.length === 0) {
      return res.status(200).json({
        insight:
          language === 'ar'
            ? 'لسه معندكش مستندات مرفوعة. ابدأ برفع أول مستند.'
            : 'No documents yet. Upload your first one to get started.',
      })
    }

    const docSummary = documents
      .map(
        (d) =>
          `- ${d.file_name} | type: ${d.doc_type || 'unknown'} | category: ${
            d.category || 'uncategorized'
          } | expiry: ${d.expiry_date || 'none'} | uploaded_by: ${d.uploaded_by}`
      )
      .join('\n')

    const systemPrompt = `You are a document vault analyst. Given a list of documents, write ONE short, natural-language insight (max 2 sentences) that would be genuinely useful to see on a dashboard — e.g. totals, counts by category, upcoming expirations, or notable patterns. Reply in ${
      language === 'ar' ? 'Egyptian Arabic' : 'English'
    } only. Do not use markdown. Just the plain sentence(s).`

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Documents:\n${docSummary}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text()
      return res.status(502).json({ error: `Gemini API error: ${errBody}` })
    }

    const data = await geminiResponse.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return res.status(200).json({ insight: text.trim() })
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` })
  }
}
