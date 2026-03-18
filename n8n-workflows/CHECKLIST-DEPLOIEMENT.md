# Checklist de déploiement — Decimal RAG

## Étape 0 : Restaurer le snapshot Hostinger
- [ ] Snapshot restauré
- [ ] n8n accessible sur https://decimal.cosy-groupe.com
- [ ] Workflows existants (Cosy Chat, etc.) fonctionnent normalement
- [ ] Vérifier qu'on peut activer/désactiver un workflow → si MISCONF, passer à l'étape 1

## Étape 1 : Fix Redis (NE PAS toucher au docker-compose !)
Sur le terminal SSH Hostinger :
```bash
sysctl vm.overcommit_memory=1
echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
cd /docker/n8n && docker compose down && docker compose up -d
```
- [ ] Commandes exécutées
- [ ] Test : activer/désactiver un workflow existant dans n8n → ça marche

Si ça ne marche toujours pas, solution B :
```bash
docker run --rm --network container:n8n-n8n-1 redis:7-alpine redis-cli -p 5679 CONFIG SET stop-writes-on-bgsave-error no
docker restart n8n-n8n-1
```

## Étape 2 : Créer le credential Cohere dans n8n
- [ ] n8n → Settings → Credentials → Add Credential
- [ ] Type : Cohere
- [ ] API Key : eNL6Mplpwl6yxwbHopm701dztnpxiQhP8OsXV5Lu
- [ ] Nom : "Cohere RAG"
- [ ] Communiquer l'ID du credential à Claude

## Étape 3 : Claude déploie les workflows via API n8n MCP
- [ ] Workflow Chat créé et activé
- [ ] Workflow Ingestion créé et activé
- [ ] Webhooks testés

## Étape 4 : Mettre à jour l'app React
- [ ] ChatPage pointe vers webhook n8n `/webhook/rag-chat`
- [ ] DocumentsPage pointe vers webhook n8n `/webhook/rag-ingest`
- [ ] Push + deploy Vercel

## Étape 5 : Test complet
- [ ] Ingestion d'un document URL
- [ ] Vérifier status "ready" + nombre de chunks
- [ ] Chat : poser une question → réponse sourcée
- [ ] Chat : poser une question hors sujet → "pas dans les documents"

## Étape 6 : Améliorations RAG (après validation)
- [ ] Ajouter ReRank Cohere au workflow Chat
- [ ] Ajouter tool "Liste documents" (Postgres)
- [ ] Ajouter tool "Lire document complet" (Postgres)
- [ ] Tester la qualité des réponses
