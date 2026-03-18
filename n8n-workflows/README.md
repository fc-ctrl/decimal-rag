# Workflows n8n — Decimal RAG

## Prérequis avant déploiement

### 1. Résoudre le problème Redis/n8n
Le serveur n8n Hostinger a `N8N_RUNNERS_ENABLED=true` qui démarre un Redis interne.
Ce Redis ne peut pas sauvegarder ses snapshots RDB → erreur MISCONF.

**Solution à valider** (NE PAS appliquer sans test) :
- Option A : `sysctl vm.overcommit_memory=1` sur le VPS (fix noyau Linux)
- Option B : Mettre `N8N_RUNNERS_ENABLED=false` dans docker-compose (désactive le task runner)
- Option C : Contacter le support Hostinger pour qu'ils appliquent le fix

### 2. Créer le credential Cohere dans n8n
- Aller dans n8n → Settings → Credentials → Add Credential
- Type : Cohere
- API Key : `eNL6Mplpwl6yxwbHopm701dztnpxiQhP8OsXV5Lu`
- Nom : "Cohere RAG"
- Noter l'ID du credential pour l'utiliser dans les workflows

### 3. Créer le credential Supabase pour le RAG
- Vérifier si le credential existant `5tl9S85Vu5TINDim` (Supabase Postgres n8n chat) fonctionne pour les tables rag_*
- Si non, créer un nouveau credential pointant vers la même base

## Workflows à déployer

### 1. Decimal RAG — Chat (`workflow-chat.json`)
- **Trigger** : Webhook POST `/webhook/rag-chat`
- **Agent IA** : GPT-4o avec system prompt RAG strict
- **Vector Store** : Supabase pgvector (table rag_chunks)
- **Embeddings** : OpenAI text-embedding-3-small
- **Mémoire** : Postgres Chat Memory
- **Sortie** : Respond to Webhook avec la réponse de l'agent

### 2. Decimal RAG — Ingestion (`workflow-ingestion.json`)
- **Trigger** : Webhook POST `/webhook/rag-ingest`
- **Étapes** :
  1. Lire le document dans rag_documents
  2. Mettre le status à "processing"
  3. Supprimer les anciens chunks
  4. Fetch l'URL source
  5. Extraire le texte (HTML → texte)
  6. Chunking intelligent (par section, 400-1000 chars, overlap 100)
  7. Contextualisation LLM (GPT-4o-mini)
  8. Fusion chunk + contexte
  9. Embedding + stockage dans Supabase Vector Store
  10. Mettre le status à "ready"

## Déploiement
Les workflows seront créés via l'API n8n MCP une fois le problème Redis résolu.
