# Fix Redis n8n — Hostinger VPS

## Le problème
n8n avec `N8N_RUNNERS_ENABLED=true` démarre un Redis interne (task runner sur port 5679).
Ce Redis interne ne peut pas faire de BGSAVE car le noyau Linux n'autorise pas l'overcommit mémoire.
Résultat : TOUTE écriture dans n8n est bloquée (activer, désactiver, modifier des workflows).

## La solution (2 commandes)

### 1. Fix noyau Linux (permanent)
```bash
# Applique immédiatement
sysctl vm.overcommit_memory=1

# Rend permanent au reboot
echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
```

### 2. Redémarrer n8n
```bash
cd /docker/n8n && docker compose down && docker compose up -d
```

### Alternative : désactiver les runners
Si le fix sysctl ne suffit pas, changer dans docker-compose.yml :
```
N8N_RUNNERS_ENABLED=false
```
Puis redémarrer. Aucun impact fonctionnel — les runners sont un mode d'exécution optionnel.

## Vérification
Après le fix, aller dans n8n et essayer d'activer/désactiver un workflow.

## Ce qu'on NE doit PAS faire
- Ajouter un container Redis externe (n8n utilise son Redis interne, pas un externe)
- Modifier d'autres variables dans docker-compose.yml
- Installer des packages dans le container n8n
