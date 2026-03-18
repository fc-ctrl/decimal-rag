# Changelog — Decimal RAG

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.2.0] — 2026-03-18

### Ajouté
- **Edge Function rag-ingest** : pipeline d'ingestion complet
  - Extraction texte (fichiers uploadés, URLs)
  - Chunking intelligent par section (titres MD), taille 400-1000 chars
  - Chevauchement 100 chars entre chunks adjacents
  - Contextualisation LLM (GPT-4o-mini) : chaque chunk enrichi d'un résumé contextuel
  - Embedding OpenAI text-embedding-3-small (1536 dimensions)
  - Gestion des mises à jour (supprime anciens chunks avant réingestion)
- **Edge Function rag-chat** : pipeline de recherche et réponse
  - Multi-query : 3 reformulations automatiques de la question
  - Recherche hybride : vector cosine + BM25 full-text avec fusion RRF
  - ReRanking Cohere rerank-v3.5 (top 20 → top 5)
  - Corrective RAG : évaluation de pertinence de chaque chunk
  - Génération GPT-4o avec citations obligatoires [Source X]
  - Guardrails : répond "je ne sais pas" si aucun chunk pertinent
  - Note de confiance affichée (moyenne scores rerank)
- **Recherche hybride SQL** : fonction `match_rag_hybrid` (Reciprocal Rank Fusion)
- **Full-text search** : colonne `fts tsvector` français sur rag_chunks
- **Table rag_document_metadata** : titre, URL, source_type par document
- **Fonction get_rag_document_text** : reconstitution document complet

---

## [0.1.0] — 2026-03-18

### Ajouté
- **Scaffold initial** : Vite + React 19 + TypeScript + Tailwind v4
- **Auth Supabase** : login/logout, protection des routes
- **Chat** : conversations persistées, envoi de messages, affichage des sources, animation loading
- **Documents** : upload fichiers (PDF, Word, Excel, CSV, TXT...), ingestion URL, statut de traitement, recherche
- **Settings** : stats (documents, chunks, conversations), sources connectées
- **Tables Supabase** : rag_documents, rag_chunks (pgvector 1536), rag_conversations, rag_messages, rag_source_configs
- **pgvector** : extension activée, index IVFFlat, fonction `match_rag_chunks` pour recherche cosine
- **Storage** : bucket `rag-documents` pour les uploads
- **Déploiement** : Vercel
- **Brain OS** : projet créé avec prompt système v1
