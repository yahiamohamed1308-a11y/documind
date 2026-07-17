// Vercel serverless function: /api/ask
// Uses Google Gemini (free tier, no credit card needed) instead of a paid API.
// Get a free key at https://aistudio.google.com/app/apikey and set it as
// GEMINI_API_KEY in your Vercel environment variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, documents } = req.body

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "query"' })
    }
    if (!Array.isArray(documents)) {
      return res.status(400).json({ error: 'Missing or invalid "documents" array' })
    }

    const docIndex = documents
      .map(
        (d, i) =>
          `[${i}] file_name: ${d.file_name} | type: ${d.doc_type || 'unknown'} | text: ${
            (d.extracted_text || '').slice(0, 2000)
          }`
      )
      .join('\n---\n')

    const systemPrompt = `You are a bilingual (Egyptian Arabic + English) document search assistant.
The user will ask a question in Arabic, English, or a mix of both (common in Egypt).
You will be given an indexed list of documents with file names, types, and extracted text.

Your job:
1. Detect the language of the user's query (Arabic, English, or mixed).
2. Find every document that matches the query's meaning — not just exact keyword matches.
   Match synonyms across languages too (e.g. "certificate" should match "شهادة").
3. Reply in the SAME language the user asked in. If they wrote in Egyptian Arabic, reply in Egyptian Arabic.
4. Respond ONLY in strict JSON, no markdown, no extra text, in this exact shape:
{
  "answer": "short natural-language summary of what was found, in the detected language",
  "matchedDocIndexes": [array of integer indexes from the document list that match],
  "language": "ar" or "en" or "mixed"
}
If nothing matches, return an empty matchedDocIndexes array and say so in the answer, in the same language as the query.`

    const userMessage = `User query: "${query}"\n\nDocument index:\n${docIndex || '(no documents uploaded yet)'}`

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text()
      return res.status(502).json({ error: `Gemini API error: ${errBody}` })
    }

    const data = await geminiResponse.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    let parsed
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch (e) {
      return res.status(200).json({
        answer: rawText,
        matchedDocIds: [],
        language: 'unknown',
      })
    }

    const matchedDocIds = (parsed.matchedDocIndexes || [])
      .map((i) => documents[i]?.id)
      .filter(Boolean)

    return res.status(200).json({
      answer: parsed.answer,
      matchedDocIds,
      language: parsed.language,
    })
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` })
  }
}
