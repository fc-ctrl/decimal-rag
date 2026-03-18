# Decimal RAG

## Projet
RAG multi-source (documents, Airtable, Supabase, Google Drive, URLs) — chat + API — multi-tenant, vendable via Decimal.

## Stack
- Vite + React 19 + TypeScript + Tailwind v4
- Supabase partagé (`plbjafwltwpupspmlnip`) — tables préfixées `rag_*`
- pgvector pour embeddings (OpenAI 1536 dimensions)
- Vercel pour le déploiement
- n8n pour les pipelines d'ingestion

## Conventions
- Tables Supabase préfixées `rag_*`
- Multi-tenant : toujours `org_id` sur les tables
- Auth : Supabase Auth partagé avec les autres apps Cosy/Decimal
- TypeScript strict : `tsc -b --noEmit` doit passer avant chaque push
- Pousser sur GitHub après chaque changement significatif

## Architecture RAG
1. Ingestion : upload/URL/API → rag_documents (status: pending)
2. Chunking : découpage texte → rag_chunks (content + token_count)
3. Embedding : OpenAI ada-002 → rag_chunks.embedding (vector 1536)
4. Retrieval : match_rag_chunks() → cosine similarity
5. Génération : prompt + context chunks → réponse sourcée

## Credentials
- Supabase URL : `https://plbjafwltwpupspmlnip.supabase.co`
- OpenAI : credential n8n `ofSSEvpXZSj1zVP0`
