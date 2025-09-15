# Format des Données GPS pour les Vidéos

Ce document décrit les formats supportés pour les données GPS associées aux vidéos dans l'application.

## Formats Supportés

Les données GPS pour les vidéos peuvent être importées dans deux formats :
1. **CSV** - Format texte avec des valeurs séparées par des virgules
2. **JSON** - Format structuré en JavaScript Object Notation

## Format CSV

### Structure du fichier

Les fichiers CSV doivent suivre cette structure :

```csv
timestamp_ms,latitude_dd,longitude_dd
0,48.8584,2.2945
100,48.85841,2.29451
200,48.85842,2.29452
300,48.85843,2.29453
```

### Colonnes requises

1. **timestamp_ms** : Timestamp en millisecondes depuis le début de la vidéo
2. **latitude_dd** : Latitude en degrés décimaux
3. **longitude_dd** : Longitude en degrés décimaux

### Caractéristiques

- La première ligne doit être un **en-tête** avec les noms des colonnes
- Les séparateurs sont des **virgules** (,)
- Les valeurs décimales utilisent des **points** (.) comme séparateurs décimaux
- Pas d'espaces autour des virgules
- Encodage UTF-8 recommandé

### Exemple complet

```csv
timestamp_ms,latitude_dd,longitude_dd
0,48.858400,2.294500
100,48.858401,2.294501
200,48.858402,2.294502
300,48.858403,2.294503
400,48.858404,2.294504
500,48.858405,2.294505
```

## Format JSON

### Structure du fichier

Les fichiers JSON doivent être un tableau d'objets avec cette structure :

```json
[
  {
    "timestamp": 0.0,
    "lat": 48.8584,
    "lon": 2.2945
  },
  {
    "timestamp": 0.1,
    "lat": 48.85841,
    "lon": 2.29451
  },
  {
    "timestamp": 0.2,
    "lat": 48.85842,
    "lon": 2.29452
  }
]
```

### Propriétés des objets

1. **timestamp** : Temps en secondes depuis le début de la vidéo (nombre décimal)
2. **lat** : Latitude en degrés décimaux (nombre décimal)
3. **lon** : Longitude en degrés décimaux (nombre décimal)

### Exemple complet

```json
[
  {
    "timestamp": 0.000,
    "lat": 48.858400,
    "lon": 2.294500
  },
  {
    "timestamp": 0.100,
    "lat": 48.858401,
    "lon": 2.294501
  },
  {
    "timestamp": 0.200,
    "lat": 48.858402,
    "lon": 2.294502
  },
  {
    "timestamp": 0.300,
    "lat": 48.858403,
    "lon": 2.294503
  }
]
```

## Conversion des Données

### CSV vers Base de Données

Lors de l'import d'un fichier CSV :
1. La première ligne (en-tête) est ignorée
2. Les timestamps en millisecondes sont convertis en secondes :
   - `timestamp_sec = timestamp_ms / 1000`
3. Les données sont stockées dans le même format que le JSON

### JSON vers Base de Données

Les fichiers JSON sont stockés directement sans conversion, avec les mêmes clés et types de données.

## Validation des Données

### Vérifications effectuées

1. **Format numérique** :
   - Tous les champs doivent être des nombres valides
   - Pas de texte ou de caractères spéciaux (sauf les points décimaux)

2. **Plage de valeurs** :
   - Latitude : entre -90 et 90 degrés
   - Longitude : entre -180 et 180 degrés
   - Timestamp : valeurs positives ou nulles

3. **Ordre chronologique** :
   - Les timestamps doivent être en ordre croissant

### Exemples de données invalides

```csv
# Données invalides - latitude hors plage
timestamp_ms,latitude_dd,longitude_dd
0,95.1234,2.2945  # Latitude > 90
```

```json
// Données invalides - timestamp décroissant
[
  {
    "timestamp": 1.0,
    "lat": 48.8584,
    "lon": 2.2945
  },
  {
    "timestamp": 0.5,
    "lat": 48.85841,
    "lon": 2.29451  // Timestamp inférieur au précédent
  }
]
```

## Bonnes Pratiques

### Fréquence d'échantillonnage

- **Recommandé** : Un point GPS toutes les 100-500 millisecondes
- **Minimum** : Un point toutes les secondes
- **Maximum** : Pas de limite stricte, mais éviter les milliers de points par seconde

### Précision

- Utiliser au moins 6 chiffres décimaux pour la latitude et longitude
- Cela correspond à une précision d'environ 10 cm

### Nommage des fichiers

- Utiliser des noms descriptifs
- Conserver le même nom de base que la vidéo avec un suffixe `_gps`
- Exemple : `VID_20231015_120000.mp4` → `VID_20231015_120000_gps.csv`

## Exemple de Workflow

1. **Préparation** :
   ```
   Vidéo : VID_20231015_120000.mp4
   GPS :   VID_20231015_120000_gps.csv
   ```

2. **Import de la vidéo** :
   - Upload de `VID_20231015_120000.mp4` dans un dossier

3. **Import des données GPS** :
   - Upload de `VID_20231015_120000_gps.csv`
   - Le système associe automatiquement le fichier GPS à la vidéo

4. **Utilisation** :
   - Lors de l'annotation vidéo, les coordonnées GPS sont extraites automatiquement
   - Les annotations incluent les coordonnées calculées à partir des données GPS

## Points Importants

1. **Formats** : Seuls les fichiers `.csv` et `.json` sont supportés
2. **Taille** : Pas de limite stricte, mais les très gros fichiers peuvent prendre du temps à importer
3. **Encodage** : UTF-8 est fortement recommandé
4. **Erreurs** : En cas d'erreur de format, l'import est annulé et un message d'erreur détaillé est fourni
5. **Doublons** : Le système remplace les données GPS existantes pour une vidéo donnée