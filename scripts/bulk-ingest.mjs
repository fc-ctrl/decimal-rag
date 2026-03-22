#!/usr/bin/env node
/**
 * Bulk ingestion script for Decimal RAG
 * - Reads .txt files from Bot Cosy folder
 * - Ingests URLs from service.cosy-piscine.com sitemap
 * - Sends content to n8n webhook or rag-ingest Edge Function
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

const SUPABASE_URL = 'https://plbjafwltwpupspmlnip.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYmphZndsdHdwdXBzcG1sbmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjQ1MTYsImV4cCI6MjA4ODU0MDUxNn0.xQRTqPRBmpEwC1pZ3rX4m9wCtbQHx8jQC-dvgtUbNfk'
const N8N_INGEST_URL = 'https://n8n.decimal-ia.com/webhook/rag-ingest-text'
const EDGE_INGEST_URL = `${SUPABASE_URL}/functions/v1/rag-ingest`

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// User ID for fc@decimal-ia.com
const USER_ID = '7c330d1a-59e4-4213-9567-d776771f3894'

const TXT_FOLDER = 'm:/Outils/Bot Cosy/2026/v2'

// ---- Helpers ----

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getAllTxtFiles(dir) {
  const results = []
  const items = readdirSync(dir)
  for (const item of items) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...getAllTxtFiles(fullPath))
    } else if (item.endsWith('.txt') && item !== 'customer instruction.txt') {
      results.push(fullPath)
    }
  }
  return results
}

function parseTxtFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')
  const result = {
    path: filePath,
    filename: basename(filePath),
    type: null,
    level: null,
    equipment_family: null,
    model: null,
    topic: null,
    link: null,
    content: null,
    intents: [],
    raw,
  }

  // Parse header fields
  const typeMatch = raw.match(/^TYPE:\s*(.+)$/m)
  if (typeMatch) result.type = typeMatch[1].trim()

  const levelMatch = raw.match(/^LEVEL:\s*(.+)$/m)
  if (levelMatch) result.level = levelMatch[1].trim()

  const familyMatch = raw.match(/^EQUIPMENT_FAMILY:\s*(.+)$/m)
  if (familyMatch) result.equipment_family = familyMatch[1].trim()

  const modelMatch = raw.match(/^MODEL:\s*(.+)$/m)
  if (modelMatch) result.model = modelMatch[1].trim()

  const topicMatch = raw.match(/^TOPIC:\s*(.+)$/m)
  if (topicMatch) result.topic = topicMatch[1].trim()

  // Parse LINK: field or bare URL on a line
  const linkMatch = raw.match(/^LINK:\s*(https?:\/\/.+)$/m)
  if (linkMatch) {
    result.link = linkMatch[1].trim()
  } else {
    // Look for bare URL on its own line (common in these files)
    const bareUrl = raw.match(/^(https?:\/\/service\.cosy-piscine\.com\/[^\s]+)$/m)
      || raw.match(/^(https?:\/\/cosy-piscine\.fr\/[^\s]+)$/m)
    if (bareUrl) result.link = bareUrl[1].trim()
  }

  // Parse intents
  const intentSection = raw.match(/INTENT:\n([\s\S]*?)(?=\n[A-Z_]+:|$)/m)
  if (intentSection) {
    result.intents = intentSection[1]
      .split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(l => l.length > 0)
  }

  // Parse content
  const contentMatch = raw.match(/CONTENT:\n([\s\S]*?)(?=\nORIENTATION_QUESTION:|$)/m)
  if (contentMatch) {
    result.content = contentMatch[1].trim()
  }

  // If no CONTENT but has meaningful text after headers, use the whole file as content
  if (!result.content && !result.link) {
    // Use raw text minus header fields as content
    const lines = raw.split('\n')
    const contentLines = lines.filter(l => !l.match(/^(TYPE|LEVEL|EQUIPMENT_FAMILY|MODEL|TOPIC|SUBTYPE|INTENT|USAGE_RULE|LINK|ORIENTATION_QUESTION):/))
      .filter(l => !l.match(/^-\s/))
      .filter(l => l.trim().length > 0)
    const fallbackContent = contentLines.join('\n').trim()
    if (fallbackContent.length > 50) result.content = fallbackContent
  }

  return result
}

async function getExistingDocUrls() {
  const { data } = await supabase
    .from('rag_documents')
    .select('source_ref, title')
  return new Set((data || []).map(d => d.source_ref || d.title))
}

async function createDocument(title, sourceType, sourceRef, metadata = {}) {
  const { data, error } = await supabase.from('rag_documents').insert({
    org_id: 'default',
    user_id: USER_ID,
    title,
    source_type: sourceType,
    source_ref: sourceRef,
    mime_type: sourceType === 'url' ? 'text/html' : 'text/plain',
    file_size: null,
    chunk_count: 0,
    status: 'pending',
    metadata,
  }).select().single()
  if (error) {
    console.error(`  ERROR creating doc: ${error.message}`)
    return null
  }
  return data
}

async function ingestViaEdgeFunction(documentId) {
  try {
    const res = await fetch(EDGE_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`  ERROR rag-ingest: ${err.substring(0, 200)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`  ERROR rag-ingest: ${e.message}`)
    return false
  }
}

async function ingestViaN8n(documentId, text) {
  try {
    const res = await fetch(N8N_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, text }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`  ERROR n8n ingest: ${err.substring(0, 200)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`  ERROR n8n ingest: ${e.message}`)
    return false
  }
}

async function waitForReady(documentId, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('rag_documents')
      .select('status, chunk_count')
      .eq('id', documentId)
      .single()
    if (data?.status === 'ready') return data.chunk_count
    if (data?.status === 'error') return -1
    await sleep(3000)
  }
  return -2 // timeout
}

// ---- Main ----

async function main() {
  const existing = await getExistingDocUrls()
  console.log(`\nDocuments existants: ${existing.size}`)

  let totalIngested = 0
  let totalSkipped = 0
  let totalErrors = 0

  // ========== PHASE 1: .txt files ==========
  console.log('\n========== PHASE 1: Fichiers .txt ==========\n')
  const txtFiles = getAllTxtFiles(TXT_FOLDER)
  console.log(`${txtFiles.length} fichiers .txt trouvés\n`)

  for (let i = 0; i < txtFiles.length; i++) {
    const parsed = parseTxtFile(txtFiles[i])
    const label = `[${i + 1}/${txtFiles.length}] ${parsed.filename}`

    // Skip selectors (they're routing logic, not content)
    if (parsed.filename.startsWith('selector_') || parsed.filename.startsWith('slector_')) {
      console.log(`${label} — SKIP (selector)`)
      totalSkipped++
      continue
    }

    // If file has a LINK, we'll ingest the URL
    if (parsed.link) {
      if (existing.has(parsed.link)) {
        console.log(`${label} — SKIP (URL déjà ingérée: ${parsed.link})`)
        totalSkipped++
        continue
      }

      console.log(`${label} — Ingestion URL: ${parsed.link}`)
      const metadata = {
        equipment_family: parsed.equipment_family,
        model: parsed.model,
        topic: parsed.topic,
        level: parsed.level,
        type: parsed.type,
        intents: parsed.intents,
      }
      const doc = await createDocument(parsed.link, 'url', parsed.link, metadata)
      if (doc) {
        const ok = await ingestViaEdgeFunction(doc.id)
        if (ok) {
          const chunks = await waitForReady(doc.id)
          if (chunks > 0) {
            console.log(`  OK — ${chunks} chunks`)
            totalIngested++
          } else {
            console.log(`  ERREUR ou timeout`)
            totalErrors++
          }
        } else {
          totalErrors++
        }
      } else {
        totalErrors++
      }
      existing.add(parsed.link)
      await sleep(2000) // throttle
      continue
    }

    // If file has CONTENT, ingest the text via n8n
    if (parsed.content && parsed.content.length > 50) {
      const title = parsed.filename.replace('.txt', '')
      if (existing.has(title)) {
        console.log(`${label} — SKIP (déjà ingéré)`)
        totalSkipped++
        continue
      }

      console.log(`${label} — Ingestion contenu texte (${parsed.content.length} chars)`)
      const metadata = {
        equipment_family: parsed.equipment_family,
        model: parsed.model,
        topic: parsed.topic,
        level: parsed.level,
        type: parsed.type,
        intents: parsed.intents,
      }

      // Prepend intents and metadata to the content for better search
      let enrichedText = ''
      if (parsed.equipment_family) enrichedText += `Famille: ${parsed.equipment_family}\n`
      if (parsed.model) enrichedText += `Modèle: ${parsed.model}\n`
      if (parsed.topic) enrichedText += `Sujet: ${parsed.topic}\n`
      if (parsed.intents.length > 0) enrichedText += `Questions fréquentes: ${parsed.intents.join(', ')}\n`
      enrichedText += `\n${parsed.content}`

      const doc = await createDocument(title, 'upload', title, metadata)
      if (doc) {
        const ok = await ingestViaN8n(doc.id, enrichedText)
        if (ok) {
          const chunks = await waitForReady(doc.id)
          if (chunks > 0) {
            console.log(`  OK — ${chunks} chunks`)
            totalIngested++
          } else {
            console.log(`  ERREUR ou timeout`)
            totalErrors++
          }
        } else {
          totalErrors++
        }
      } else {
        totalErrors++
      }
      existing.add(title)
      await sleep(2000) // throttle
      continue
    }

    // File has neither LINK nor substantial CONTENT
    console.log(`${label} — SKIP (pas de contenu ni de lien)`)
    totalSkipped++
  }

  // ========== PHASE 2: URLs du sitemap ==========
  console.log('\n========== PHASE 2: URLs sitemap ==========\n')

  const sitemapUrls = [
    'https://service.cosy-piscine.com/etalonner-les-sondes-ph-et-redox-du-regulateur-ofix-vp-facilement/',
    'https://service.cosy-piscine.com/guide-pompe-piscine-vitesse-variable/',
    'https://service.cosy-piscine.com/sg-installation-et-utilisation-de-lelectrolyseur-au-sel/',
    'https://service.cosy-piscine.com/comment-bien-equilibrer-leau-de-votre-piscine-guide-complet-des-parametres-a-surveiller/',
    'https://service.cosy-piscine.com/comment-bien-regler-les-vannes-apres-le-filtre-de-piscine-explications-et-conseils/',
    'https://service.cosy-piscine.com/comment-calculer-la-quantite-de-sel-pour-votre-electrolyseur-guide-pratique/',
    'https://service.cosy-piscine.com/comment-et-quand-nettoyer-le-prefiltre-de-votre-pompe-de-piscine-guide-etape-par-etape/',
    'https://service.cosy-piscine.com/comment-et-quand-nettoyer-un-filtre-a-sable-de-piscine-guide-pratique/',
    'https://service.cosy-piscine.com/comment-fonctionne-une-piscine-explication-complete-du-circuit-de-filtration/',
    'https://service.cosy-piscine.com/comment-installer-et-utiliser-lelectrolyseur-au-sel-sel-in-de-poolex-guide-complet/',
    'https://service.cosy-piscine.com/comment-tester-une-cellule-delectrolyseur-de-piscine-guide-pratique/',
    'https://service.cosy-piscine.com/condensation-dans-les-lames-en-polycarbonate-de-piscine-causes-impact-et-solutions/',
    'https://service.cosy-piscine.com/dereglement-des-fins-de-course-causes-et-corrections/',
    'https://service.cosy-piscine.com/diodes-vertes-sur-un-electrolyseur-hayward-signification-et-solutions/',
    'https://service.cosy-piscine.com/eau-de-piscine-noire-causes-solutions-et-prevention-fer-manganese/',
    'https://service.cosy-piscine.com/eau-de-piscine-trouble-causes-traitements-et-conseils-de-prevention/',
    'https://service.cosy-piscine.com/electrolyseur-hayward-pourquoi-les-led-saffichent-en-violet/',
    'https://service.cosy-piscine.com/electrolyseur-hayward-que-faire-si-les-3-diodes-jaunes-clignotent/',
    'https://service.cosy-piscine.com/erreur-a1-sur-un-electrolyseur-sg-probleme-de-debit-et-solutions/',
    'https://service.cosy-piscine.com/erreur-co-sur-un-electrolyseur-sg-sous-production-et-couverture-fermee/',
    'https://service.cosy-piscine.com/erreur-e2-e5-e7-e8-e9-ea-ec-sur-electrolyseur-sel-in-causes-et-solutions/',
    'https://service.cosy-piscine.com/etalonnage-sondes-ph-et-orp-electrolyseur-aqualyzer/',
    'https://service.cosy-piscine.com/filtre-a-sable-fissure/',
    'https://service.cosy-piscine.com/guide-pompe-a-chaleur-piscine/',
    'https://service.cosy-piscine.com/guide-pompe-piscine-vitesse-fixe/',
    'https://service.cosy-piscine.com/jai-une-led-jaune-fixe-sur-mon-electrolyseur-aquarite/',
    'https://service.cosy-piscine.com/je-perds-des-bouchons-de-volet-mon-volet-piscine/',
    'https://service.cosy-piscine.com/le-couvercle-de-mon-filtre-ne-souvre-pas/',
    'https://service.cosy-piscine.com/les-attaches-de-mon-volet-piscine-sont-cassees/',
    'https://service.cosy-piscine.com/ma-cartouche-de-filtration-est-deformee/',
    'https://service.cosy-piscine.com/ma-pompe-fait-un-bruit-anormalement-fort/',
    'https://service.cosy-piscine.com/ma-vanne-6-voies-laisse-fuir-de-leau-a-legout/',
    'https://service.cosy-piscine.com/mes-lames-de-volet-me-semblent-trop-petites-par-rapport-a-mon-basin/',
    'https://service.cosy-piscine.com/mon-electrolyseur-aquarite-hayward-est-eteint/',
    'https://service.cosy-piscine.com/mon-filtre-a-cartouche-fuit/',
    'https://service.cosy-piscine.com/mon-filtre-a-cartouche-ne-filtre-pas-certaines-impuretes/',
    'https://service.cosy-piscine.com/mon-filtre-a-cartouche-sencrasse-trop-vite/',
    'https://service.cosy-piscine.com/mon-filtre-a-sable-rejette-du-sable/',
    'https://service.cosy-piscine.com/mon-filtre-a-sable-sencrasse-vite/',
    'https://service.cosy-piscine.com/mon-volet-ne-fonctionne-pas-lorsque-jactionne-la-cle/',
    'https://service.cosy-piscine.com/piscine-verte-et-parois-glissantes-causes-traitement-et-prevention-des-algues/',
    'https://service.cosy-piscine.com/pompe-de-piscine-qui-ne-demarre-pas-causes-et-solutions/',
    'https://service.cosy-piscine.com/pompe-desamorcee/',
    'https://service.cosy-piscine.com/pompe-hayward-vstd-guide-dinstallation-et-reglages-optimises/',
    'https://service.cosy-piscine.com/pompe-poolex-cosy-variline-guide-complet-de-programmation-et-entretien/',
    'https://service.cosy-piscine.com/pompe-qui-fuit/',
    'https://service.cosy-piscine.com/pompes-a-vitesse-variable-comment-regler-le-temps-de-filtration/',
    'https://service.cosy-piscine.com/popourquoi-votre-piscine-consomme-trop-de-chlore-liquide-causes-et-solutionsurquoi-votre-piscine-consomme-trop-de-chlore-liquide-causes-et-solutions/',
    'https://service.cosy-piscine.com/pourquoi-ma-sonde-redox-fuit-elle-causes-solutions-et-entretien/',
    'https://service.cosy-piscine.com/pourquoi-mon-electrolyseur-sel-in-est-eteint-causes-et-solutions/',
    'https://service.cosy-piscine.com/pourquoi-mon-electrolyseur-sg-est-hors-tension-explication-et-solutions/',
    'https://service.cosy-piscine.com/pourquoi-mon-regulateur-de-chlore-affiche-de-mauvaises-valeurs-explications-et-solutions/',
    'https://service.cosy-piscine.com/pression-du-manometre-trop-haute-ou-trop-basse/',
    'https://service.cosy-piscine.com/probleme-de-debit-sur-electrolyseur-sel-in-erreur-e3-causes-et-solutions/',
    'https://service.cosy-piscine.com/probleme-de-debit/',
    'https://service.cosy-piscine.com/probleme-de-pression-sur-le-manometre-de-mon-filtre-a-cartouche/',
    'https://service.cosy-piscine.com/procedure-de-reamorcage-pompe-et-hydraulique-piscine/',
    'https://service.cosy-piscine.com/quand-et-a-quelle-temperature-utiliser-un-electrolyseur-de-piscine/',
    'https://service.cosy-piscine.com/quand-et-comment-nettoyer-un-filtre-a-cartouche-de-piscine-guide-complet/',
    'https://service.cosy-piscine.com/reglage-des-fins-de-course-dun-volet-immerge-sirem-mosse-guide-complet/',
    'https://service.cosy-piscine.com/reglage-des-fins-de-course-dun-volet-immerge-unicom-guide-complet/',
    'https://service.cosy-piscine.com/reouverture-piscine-guide-complet-pour-remettre-votre-bassin-en-service/',
    'https://service.cosy-piscine.com/taches-de-rouilles-sur-les-lame-de-volet-piscine/',
    'https://service.cosy-piscine.com/temps-de-filtration-des-pompes-a-vitesse-fixe/',
    'https://service.cosy-piscine.com/volet-de-piscine-que-faire-si-vos-lames-sont-percees-ou-endommagees-par-la-grele/',
  ]

  let urlsIngested = 0
  let urlsSkipped = 0

  for (let i = 0; i < sitemapUrls.length; i++) {
    const url = sitemapUrls[i]
    const label = `[${i + 1}/${sitemapUrls.length}] ${url.split('/').slice(-2, -1)[0]}`

    if (existing.has(url)) {
      console.log(`${label} — SKIP (déjà ingérée)`)
      urlsSkipped++
      continue
    }

    console.log(`${label} — Ingestion URL...`)
    const doc = await createDocument(url, 'url', url, {})
    if (doc) {
      const ok = await ingestViaEdgeFunction(doc.id)
      if (ok) {
        const chunks = await waitForReady(doc.id)
        if (chunks > 0) {
          console.log(`  OK — ${chunks} chunks`)
          urlsIngested++
        } else {
          console.log(`  ERREUR ou timeout`)
          totalErrors++
        }
      } else {
        totalErrors++
      }
    }
    existing.add(url)
    await sleep(3000) // throttle more for URL scraping
  }

  // ========== Summary ==========
  console.log('\n========== RÉSUMÉ ==========')
  console.log(`Fichiers .txt ingérés: ${totalIngested}`)
  console.log(`Fichiers .txt ignorés: ${totalSkipped}`)
  console.log(`URLs ingérées: ${urlsIngested}`)
  console.log(`URLs ignorées: ${urlsSkipped}`)
  console.log(`Erreurs: ${totalErrors}`)
  console.log(`Total documents dans la base: ${existing.size}`)
}

main().catch(console.error)
