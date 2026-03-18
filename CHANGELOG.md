# Changelog — Decimal RAG

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et [Semantic Versioning](https://semver.org/lang/fr/).

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
