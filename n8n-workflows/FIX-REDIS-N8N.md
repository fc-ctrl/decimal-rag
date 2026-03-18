# Fix Redis n8n — Hostinger VPS

## Le problème
n8n avec `N8N_RUNNERS_ENABLED=true` démarre un Redis interne (task runner).
Le noyau Linux par défaut (`vm.overcommit_memory=0`) empêche Redis de faire un `fork()`
pour ses sauvegardes RDB → erreur MISCONF → TOUTE écriture dans n8n est bloquée.

C'est un problème **Linux standard documenté par Redis** : https://redis.io/faq/doc/296s7bo3im/

## La solution (NE PAS toucher au docker-compose)

### Étape 1 : Fix noyau Linux
Sur le terminal SSH Hostinger (PAS dans docker) :
```bash
sysctl vm.overcommit_memory=1
echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
```

### Étape 2 : Redémarrer n8n
```bash
cd /docker/n8n && docker compose down && docker compose up -d
```

### Étape 3 : Vérifier
Ouvrir https://decimal.cosy-groupe.com → essayer d'activer/désactiver un workflow.

## Solution alternative si le sysctl ne marche pas
Utiliser un container Redis temporaire pour envoyer la commande au Redis interne de n8n :
```bash
docker run --rm --network container:n8n-n8n-1 redis:7-alpine redis-cli -p 5679 CONFIG SET stop-writes-on-bgsave-error no
```
Puis redémarrer n8n.

## Ce qu'il ne faut PAS faire
- NE PAS modifier le docker-compose.yml
- NE PAS ajouter de container Redis externe
- NE PAS changer N8N_RUNNERS_ENABLED
- NE PAS installer de packages dans le container n8n

## Pourquoi ça n'a pas marché ce matin
On a fait le sysctl MAIS on avait aussi modifié le docker-compose (ajouté Redis externe,
changé N8N_RUNNERS_ENABLED, ajouté EXECUTIONS_MODE, etc.). Ces modifications ont créé
une configuration incohérente. Avec le snapshot restauré (docker-compose original intact),
le simple sysctl + restart devrait suffire.
