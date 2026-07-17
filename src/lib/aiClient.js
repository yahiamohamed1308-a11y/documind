// This calls YOUR OWN backend proxy (see /api/ask.js) which then calls
// the Anthropic API. We never call Anthropic directly from the browser
// because that would expose your API key to anyone using the app.

export async function askAI(query, documents) {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`AI request failed: ${errText}`)
  }

  return response.json() // { answer, matchedDocIds, language }
}
