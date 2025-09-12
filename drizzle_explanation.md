# Compréhension de Drizzle et des Migrations

## Qu'est-ce que Drizzle ?

Drizzle est un **ORM (Object-Relational Mapping)** pour TypeScript qui permet de :
- Définir des schémas de base de données en TypeScript
- Générer automatiquement des requêtes SQL
- Interagir avec la base de données de manière type-safe

## Deux Approches de Migration avec Drizzle

### 1. Approche "Shadow" (`drizzle-kit push`)

#### Fonctionnement
- **Pas de fichiers de migration persistants**
- Drizzle compare directement le schéma TypeScript avec la base de données
- Applique les différences en temps réel

#### Processus
```
Schéma TypeScript ───► Drizzle ───► Introspection DB ───► Différences ───► SQL appliqué
```

#### Avantages
- ✅ Très pratique pour le développement
- ✅ Pas de gestion de fichiers de migration
- ✅ Synchronisation instantanée

#### Inconvénients
- ❌ Pas de versioning des changements
- ❌ Moins sûr pour la production
- ❌ Pas d'historique des modifications

### 2. Approche Traditionnelle (`drizzle-kit generate`)

#### Fonctionnement
- **Génère des fichiers de migration versionnés**
- Chaque changement est sauvegardé dans un fichier `.sql`
- Possibilité de reviewer et de versionner les changements

#### Processus
```
Schéma TypeScript ───► Drizzle ───► Fichiers .sql ───► Appliqués à la DB
                           ▲
                           │
                      Versionné (Git)
```

#### Avantages
- ✅ **Versioning** complet des migrations
- ✅ **Contrôle** sur chaque changement
- ✅ **Sécurité** pour la production
- ✅ Possibilité de **rollback**
- ✅ Intégration facile avec **CI/CD**

#### Inconvénients
- ❌ Plus complexe à gérer
- ❌ Nécessite de générer des fichiers
- ❌ Plus de steps dans le workflow

## Comment Drizzle Compare le Schéma

### Introspection de la Base de Données

Drizzle ne stocke pas les anciennes versions du schéma dans des fichiers. À la place :

1. **Lecture directe de la structure**
   ```sql
   -- Drizzle interroge PostgreSQL pour obtenir :
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'projects';
   ```

2. **Comparaison en mémoire**
   ```
   Schéma actuel (TypeScript)    Structure DB (introspectée)
   ┌──────────────────────┐      ┌──────────────────────┐
   │ projects:            │      │ projects:            │
   │ - id (varchar)       │  ┌─► │ - id (varchar)       │
   │ - name (text)        │  │   │ - name (text)        │
   │ - description (text) │  │   │                      │
   └──────────────────────┘  │   └──────────────────────┘
                             │
                             ▼
                      Différences détectées:
                      ALTER TABLE projects ADD COLUMN description TEXT;
   ```

### Où sont Stockées les Métadonnées ?

Les seules "métadonnées" sont **dans la base de données elle-même** :
- Structure des tables (dans `information_schema`)
- Colonnes existantes
- Contraintes et types de données
- Index et clés étrangères

## Recommandations

### Pour le Développement
- Utiliser `drizzle-kit push` pour la rapidité
- Pas de souci de drop/recreate en local

### Pour la Production
- Utiliser `drizzle-kit generate` pour le contrôle
- Versionner les fichiers de migration
- Appliquer les migrations de manière contrôlée

## Commandes Utiles

```bash
# Approche shadow (actuelle)
npm run db:push

# Approche avec fichiers (recommandée pour production)
npx drizzle-kit generate
npx drizzle-kit migrate

# Vérifier l'état
npx drizzle-kit check
```