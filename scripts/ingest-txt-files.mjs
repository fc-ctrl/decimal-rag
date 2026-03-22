#!/usr/bin/env node
/**
 * Ingest all .txt knowledge files into RAG
 * These contain structured equipment knowledge, routing rules, and links
 * that tell the AI how to respond and which links to propose.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

const SUPABASE_URL = 'https://plbjafwltwpupspmlnip.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYmphZndsdHdwdXBzcG1sbmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjQ1MTYsImV4cCI6MjA4ODU0MDUxNn0.xQRTqPRBmpEwC1pZ3rX4m9wCtbQHx8jQC-dvgtUbNfk'
const N8N_INGEST_URL = 'https://n8n.decimal-ia.com/webhook/rag-ingest-text'
const TXT_FOLDER = 'm:/Outils/Bot Cosy/2026/v2'
const USER_ID = '7c330d1a-59e4-4213-9567-d776771f3894'

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

function parseMetadata(raw) {
  const get = (key) => { const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')); return m?.[1]?.trim() || null }
  return {
    type: get('TYPE'),
    level: get('LEVEL'),
    equipment_family: get('EQUIPMENT_FAMILY'),
    model: get('MODEL'),
    topic: get('TOPIC'),
  }
}

async function main() {
  const txtFiles = getAllTxtFiles(TXT_FOLDER)
  console.log(`\n${txtFiles.length} fichiers .txt trouvés\n`)

  // Get existing docs to avoid duplicates
  const { data: existing } = await supabase.from('rag_documents').select('title')
  const existingTitles = new Set((existing || []).map(d => d.title))

  let ok = 0, skip = 0, err = 0

  for (let i = 0; i < txtFiles.length; i++) {
    const filePath = txtFiles[i]
    const filename = basename(filePath, '.txt')
    const label = `[${i + 1}/${txtFiles.length}] ${filename}`

    // Check if already ingested
    if (existingTitles.has(filename)) {
      console.log(`${label} — SKIP (déjà ingéré)`)
      skip++
      continue
    }

    const raw = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')
    const meta = parseMetadata(raw)

    console.log(`${label} — Ingestion (${raw.length} chars)`)

    // Create document
    const { data: doc, error: docErr } = await supabase.from('rag_documents').insert({
      org_id: 'default',
      user_id: USER_ID,
      title: filename,
      source_type: 'upload',
      source_ref: filename,
      mime_type: 'text/plain',
      file_size: raw.length,
      chunk_count: 0,
      status: 'pending',
      metadata: meta,
    }).select().single()

    if (docErr) {
      console.log(`  ERROR doc: ${docErr.message}`)
      err++
      continue
    }

    // Send full content to n8n for chunking + embedding
    try {
      const res = await fetch(N8N_INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id, text: raw }),
      })
      if (!res.ok) {
        console.log(`  ERROR n8n: ${(await res.text()).substring(0, 200)}`)
        err++
        continue
      }
    } catch (e) {
      console.log(`  ERROR fetch: ${e.message}`)
      err++
      continue
    }

    // Wait for processing
    const start = Date.now()
    while (Date.now() - start < 60000) {
      const { data: check } = await supabase.from('rag_documents').select('status, chunk_count').eq('id', doc.id).single()
      if (check?.status === 'ready') {
        console.log(`  OK — ${check.chunk_count} chunks`)
        ok++
        break
      }
      if (check?.status === 'error') {
        console.log(`  ERROR processing`)
        err++
        break
      }
      await sleep(3000)
    }

    existingTitles.add(filename)
    await sleep(1000)
  }

  console.log(`\n========== RÉSULTAT ==========`)
  console.log(`OK: ${ok} | Skip: ${skip} | Erreurs: ${err}`)
}

main().catch(console.error)
