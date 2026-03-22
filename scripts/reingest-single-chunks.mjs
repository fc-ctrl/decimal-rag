#!/usr/bin/env node
/**
 * Re-ingest structured .txt files as SINGLE chunks (no splitting).
 * These files are small (< 3000 chars) and contain structured knowledge
 * with URLs that must stay together with the equipment name.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

const SUPABASE_URL = 'https://plbjafwltwpupspmlnip.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYmphZndsdHdwdXBzcG1sbmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjQ1MTYsImV4cCI6MjA4ODU0MDUxNn0.xQRTqPRBmpEwC1pZ3rX4m9wCtbQHx8jQC-dvgtUbNfk'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const TXT_FOLDER = 'm:/Outils/Bot Cosy/2026/v2'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function getAllTxtFiles(dir) {
  const results = []
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item)
    if (statSync(fullPath).isDirectory()) {
      results.push(...getAllTxtFiles(fullPath))
    } else if (item.endsWith('.txt') && item !== 'customer instruction.txt') {
      results.push(fullPath)
    }
  }
  return results
}

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: [text] })
  })
  const data = await res.json()
  return data.data?.[0]?.embedding || null
}

async function main() {
  const txtFiles = getAllTxtFiles(TXT_FOLDER)
  console.log(`${txtFiles.length} fichiers .txt trouvés\n`)

  let ok = 0, skip = 0, err = 0

  for (let i = 0; i < txtFiles.length; i++) {
    const filePath = txtFiles[i]
    const filename = basename(filePath, '.txt')
    const label = `[${i + 1}/${txtFiles.length}] ${filename}`
    const raw = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')

    // Find existing document
    const { data: doc } = await supabase
      .from('rag_documents')
      .select('id, chunk_count')
      .eq('title', filename)
      .single()

    if (!doc) {
      console.log(`${label} — SKIP (pas de document)`)
      skip++
      continue
    }

    if (doc.chunk_count <= 1) {
      console.log(`${label} — SKIP (déjà 1 chunk)`)
      skip++
      continue
    }

    console.log(`${label} — Re-ingestion en 1 chunk (était ${doc.chunk_count} chunks, ${raw.length} chars)`)

    // Delete existing chunks
    const { error: delErr } = await supabase
      .from('rag_chunks')
      .delete()
      .eq('document_id', doc.id)

    if (delErr) {
      console.log(`  ERROR delete chunks: ${delErr.message}`)
      err++
      continue
    }

    // Generate embedding for full content
    const embedding = await getEmbedding(raw)
    if (!embedding) {
      console.log(`  ERROR embedding`)
      err++
      continue
    }

    // Insert single chunk
    const { error: insertErr } = await supabase
      .from('rag_chunks')
      .insert({
        document_id: doc.id,
        chunk_index: 0,
        content: raw,
        token_count: Math.ceil(raw.length / 4),
        embedding: JSON.stringify(embedding),
      })

    if (insertErr) {
      console.log(`  ERROR insert: ${insertErr.message}`)
      err++
      continue
    }

    // Update document chunk count
    await supabase
      .from('rag_documents')
      .update({ chunk_count: 1 })
      .eq('id', doc.id)

    console.log(`  OK — 1 chunk (${raw.length} chars)`)
    ok++
    await sleep(500) // throttle OpenAI
  }

  console.log(`\n========== RÉSULTAT ==========`)
  console.log(`OK: ${ok} | Skip: ${skip} | Erreurs: ${err}`)
}

main().catch(console.error)
