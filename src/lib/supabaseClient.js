import { createClient } from '@supabase/supabase-js'

// These two values come from YOUR Supabase project (Settings -> API).
// They go in a .env file — see .env.example in this project.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars missing. Copy .env.example to .env and fill in your project URL + anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Uploads a file to Supabase Storage (bucket: "documents") and inserts
 * a matching row in the "documents" table so everyone sharing this app
 * sees it appear instantly (via realtime subscription in App.jsx).
 */
export async function uploadDocument(file, uploadedBy) {
  const filePath = `${Date.now()}_${file.name}`

  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(filePath, file)

  if (storageError) throw storageError

  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath)

  const { data, error: insertError } = await supabase
    .from('documents')
    .insert({
      file_name: file.name,
      file_path: filePath,
      public_url: urlData.publicUrl,
      uploaded_by: uploadedBy,
      extracted_text: null, // filled in later by AI OCR step
      doc_type: null,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return data
}

export async function fetchAllDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Subscribes to live changes on the documents table.
 * This is what makes uploads from your dad's device appear
 * on your screen instantly, and vice versa.
 */
export function subscribeToDocuments(onChange) {
  const channel = supabase
    .channel('documents-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documents' },
      (payload) => onChange(payload)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ----- Activity feed -----

export async function logActivity(actor, actionType, description) {
  const { error } = await supabase
    .from('activity_log')
    .insert({ actor, action_type: actionType, description })
  if (error) console.error('Failed to log activity:', error)
}

export async function fetchRecentActivity(limit = 15) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export function subscribeToActivity(onChange) {
  const channel = supabase
    .channel('activity-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_log' },
      (payload) => onChange(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ----- Presence (who's online) -----

export async function pingPresence(userName) {
  const { error } = await supabase
    .from('presence')
    .upsert({ user_name: userName, last_seen: new Date().toISOString() })
  if (error) console.error('Presence ping failed:', error)
}

export async function fetchPresence() {
  const { data, error } = await supabase.from('presence').select('*')
  if (error) throw error
  const cutoff = Date.now() - 30 * 1000
  return data.filter((p) => new Date(p.last_seen).getTime() > cutoff)
}

export function subscribeToPresence(onChange) {
  const channel = supabase
    .channel('presence-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'presence' },
      (payload) => onChange(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}
