# Checklist de déploiement — Decimal RAG

## Étape 0 : Restaurer le snapshot Hostinger
- [ ] Snapshot restauré
- [ ] n8n accessible sur https://decimal.cosy-groupe.com
- [ ] Workflows existants (Cosy Chat, etc.) fonctionnent normalement

## Étape 1 : Fix Redis (voir FIX-REDIS-N8N.md)
- [ ] `sysctl vm.overcommit_memory=1` exécuté sur le VPS
- [ ] `echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf` pour le rendre permanent
- [ ] n8n redémarré : `docker restart n8n-n8n-1`
- [ ] Test : activer/désactiver un workflow existant dans n8n → ça marche

## Étape 2 : Créer le credential Cohere dans n8n
- [ ] n8n → Settings → Credentials → Add Credential
- [ ] Type : Cohere
- [ ] API Key : eNL6Mplpwl6yxwbHopm701dztnpxiQhP8OsXV5Lu
- [ ] Nom : "Cohere RAG"
- [ ] Noter l'ID du credential

## Étape 3 : Déployer les workflows via API
- [ ] Claude crée le workflow Chat via n8n MCP
- [ ] Claude crée le workflow Ingestion via n8n MCP
- [ ] Activer les 2 workflows

## Étape 4 : Mettre à jour l'app React
- [ ] Pointer vers les webhooks n8n (pas les Edge Functions)
- [ ] Tester l'ingestion d'un document (URL)
- [ ] Tester le chat avec une question

## Étape 5 : Améliorations RAG (après validation)
- [ ] Ajouter ReRank Cohere au workflow Chat
- [ ] Ajouter les tools "Liste documents" et "Lire document complet"
- [ ] Tester la qualité des réponses
