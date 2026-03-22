# Changelog — Decimal RAG

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et [Semantic Versioning](https://semver.org/lang/fr/).

---

## [2.0.0] — 2026-03-22

### Ajouté — App Client Cosy Piscine (/client)
- **Login client** : authentification par email vérifié dans Airtable Extrabat Cosy (table Contacts)
- **Dashboard client** : vue d'ensemble avec matériel, dernières demandes SAV, accès rapide chat/matériel/SAV
- **Mon matériel** : ajout d'équipements par photo (GPT-4o Vision identifie automatiquement), édition, liste des équipements du client
- **Chat SAV contextualisé** : le RAG connaît le matériel du client, plus besoin de demander le modèle. Photo possible dans le chat
- **Mes demandes SAV** : lecture des tickets SAV depuis Airtable avec statut, description, interventions
- **Workflows n8n** : Cosy Client Auth (vérification email Airtable) + Cosy Client Data (dashboard/SAV)
- **Tables Supabase** : cosy_equipment, cosy_client_sessions, rag_equipment_catalog
- **Routing séparé** : /client = app client Cosy, / = back-office admin Decimal RAG

---

## [1.2.0] — 2026-03-22

### Ajouté
- **Reconnaissance photo d'équipement** : bouton caméra dans le chat, le client photographie son matériel, GPT-4o Vision identifie marque/modèle/type, puis le RAG fournit la documentation correspondante
- **Cache sémantique** : les questions similaires (cosine > 0.88) obtiennent une réponse instantanée (~800ms) depuis le cache. Embedding de la question stocké dans `rag_cache.query_embedding`

---

## [1.1.0] — 2026-03-21

### Ajouté
- **Cache intelligent** : les réponses aux questions déjà posées sont mises en cache (7 jours). Cache hit = réponse en <1 seconde sans appeler GPT-4o. Table `rag_cache` avec RPC `rag_cache_get` / `rag_cache_set`
- **Streaming simulé** : les réponses s'affichent mot par mot (typing effect ~15ms/mot) au lieu d'apparaître d'un bloc après 8 secondes d'attente. Les réponses depuis le cache s'affichent instantanément sans animation

---

## [1.0.0] — 2026-03-21

### Ajouté
- **Page Historique** : consultation de toutes les conversations Q&A avec filtrage par durée (7j, 30j, 90j, tout), recherche textuelle, statistiques (conversations, questions, réponses), et déroulement des échanges
- **Page Documents améliorée** : filtres par type (PDF, URL, Autres) avec compteurs, badges de type colorés, date de mise à jour affichée
- **Distinction Vertigo V1/V2** dans le prompt Chat : identification automatique par code erreur (03→V1, E17→V2) ou question sur la forme du boîtier (rectangulaire/rond)
- **93 documents ingérés** : notices PDF, articles Cosy Piscine, fichiers de diagnostic
- **Import en masse** : script `bulk-ingest.mjs` pour ingestion automatique des fichiers .txt et URLs du sitemap

---

## [0.9.1] — 2026-03-21

### Amélioré
- URLs cliquables dans les réponses du chat

---

## [0.9.0] — 2026-03-21

### Ajouté
- **Téléchargement des notices sources** : quand le chat cite un document PDF, un lien de téléchargement apparaît sous la réponse permettant de récupérer le PDF original
- **Ingestion PDF via n8n Hostinger** : remplacement de l'Edge Function Supabase (WORKER_LIMIT) par un workflow n8n robuste
- **Contextualisation LLM** : chaque chunk est enrichi d'un contexte GPT-4o-mini pour améliorer la recherche sémantique et éviter la confusion entre documents
- **Fonctions RPC Supabase** : `rag_ingest_chunks` et `rag_update_doc_status` pour l'ingestion depuis n8n

### Corrigé
- Upload de gros PDFs qui crashait avec WORKER_LIMIT sur Supabase Edge Functions

---

## [0.8.2] — 2026-03-21

### Corrigé
- Ingestion PDF redirigée vers webhook n8n Hostinger au lieu de l'Edge Function Supabase

---

## [0.8.1] — 2026-03-21

### Amélioré
- **Barre de progression PDF** : affiche l'étape en cours et le pourcentage pendant l'extraction PDF (page par page), l'envoi au serveur et le traitement — plus de bouton "Upload..." bloqué sans feedback

---

## [0.8.0] — 2026-03-21

### Ajouté
- **Numéro de version** affiché dans la sidebar près du logo

---

## [0.7.0] — 2026-03-20

### Ajouté
- **Extraction PDF côté client** avec pdf.js — plus de dépendance serveur pour lire les PDFs
- **Edge Function rag-ingest-text** : ingestion depuis texte brut extrait côté navigateur

### Amélioré
- Limite upload augmentée de 5 Mo à 20 Mo
- Polling du statut d'ingestion avec feedback d'erreur

---

## [0.6.0] — 2026-03-20

### Modifié
- **Migration chat vers Hostinger** (n8n.decimal-ia.com)
- Upload fichier avec limite 5 Mo

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
