export interface Document {
  id: string
  org_id: string
  user_id: string
  title: string
  source_type: 'upload' | 'google_drive' | 'airtable' | 'supabase' | 'url'
  source_ref: string
  mime_type: string
  file_size: number | null
  chunk_count: number
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  token_count: number
  embedding: number[] | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatConversation {
  id: string
  org_id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: ChatSource[]
  created_at: string
}

export interface ChatSource {
  document_id: string
  document_title: string
  chunk_id: string
  chunk_content: string
  similarity: number
}

export interface EquipmentLink {
  label: string
  url: string
  type: string // 'guide' | 'notice' | 'vigipool' | 'guide_etalonnage' | 'guide_installation' | 'problem'
}

export interface EquipmentTopic {
  label: string
  description: string
  guide_url: string | null
}

export interface Collection {
  id: string
  org_id: string
  name: string
  description: string
  color: string
  document_count: number
  created_at: string
}
