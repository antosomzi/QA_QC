# Format d'Import/Export des Annotations

Ce document décrit le format d'import/export JSON utilisé pour les annotations dans l'application, qui prend en charge à la fois les annotations basées sur les vidéos et celles basées sur les dossiers.

## Format Unifié

L'application utilise un format d'export unifié qui s'adapte automatiquement au type d'annotations :

### 1. Annotations avec Informations Vidéo

Lorsque les annotations sont liées à une vidéo, l'export inclut les informations de la vidéo :

```json
{
  "video": {
    "video_id": "uuid-de-la-video",
    "original_name": "NomOriginal.mp4",
    "fps": 30,
    "duration_ms": 123456
  },
  "annotations": [
    {
      "id": "uuid-de-l-annotation",
      "frame_index": 123,
      "frame_timestamp_ms": 123456,
      "gps": { 
        "lat": 34.12345, 
        "lon": -118.12345 
      },
      "bbox": {
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 200,
        "unit": "pixel"
      },
      "label": "Panneau de signalisation",
      "created_at": 1234567890,
      "updated_at": 1234567890
    }
  ]
}
```

**Caractéristiques :**
- Le champ `video` est présent avec toutes les informations de la vidéo
- Tous les champs d'annotation (`frame_index`, `frame_timestamp_ms`) sont remplis
- Les coordonnées GPS proviennent des données GPS de la vidéo

### 2. Annotations basées sur les dossiers uniquement

Lorsque les annotations sont créées directement sur la carte sans vidéo :

```json
{
  "annotations": [
    {
      "id": "uuid-de-l-annotation",
      "gps": { 
        "lat": 34.12345, 
        "lon": -118.12345 
      },
      "bbox": {
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 200,
        "unit": "pixel"
      },
      "label": "Bâtiment",
      "created_at": 1234567890,
      "updated_at": 1234567890
    }
  ]
}
```

**Caractéristiques :**
- Le champ `video` est absent
- Les champs `frame_index` et `frame_timestamp_ms` sont absents
- Les coordonnées GPS sont définies manuellement lors de la création

## Format d'Import

Le format d'import est flexible et ne considère que le tableau d'annotations :

```json
{
  "video": {
    // Optionnel - ignoré lors de l'import
  },
  "annotations": [
    {
      "id": "uuid-de-l-annotation",  // Optionnel - généré si absent
      "frame_index": 123,            // Optionnel - pour annotations vidéo
      "frame_timestamp_ms": 123456,  // Optionnel - pour annotations vidéo
      "gps": { 
        "lat": 34.12345, 
        "lon": -118.12345 
      },
      "bbox": {
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 200,
        "unit": "pixel"
      },
      "label": "Étiquette",
      "created_at": 1234567890,      // Optionnel
      "updated_at": 1234567890       // Optionnel
    }
  ]
}
```

### Règles d'import

1. **Champs ignorés** : Seul le tableau `annotations` est utilisé, tous les autres champs sont ignorés
2. **Dossier cible** : L'ID du dossier est déterminé par le point d'API (`/api/annotations/import/folder/:folderId`)
3. **Détection automatique** :
   - Si `frame_index` et `frame_timestamp_ms` sont présents → annotation vidéo
   - Si ces champs sont absents → annotation basée sur le dossier
4. **Génération d'ID** : Si l'ID d'une annotation est absent, il sera généré automatiquement

## Exemples Pratiques

### Import d'annotations vidéo

```json
{
  "annotations": [
    {
      "frame_index": 100,
      "frame_timestamp_ms": 3333,
      "gps": { "lat": 34.12345, "lon": -118.12345 },
      "bbox": { "x": 50, "y": 50, "width": 100, "height": 100, "unit": "pixel" },
      "label": "Véhicule"
    }
  ]
}
```

### Import d'annotations carte seule

```json
{
  "annotations": [
    {
      "gps": { "lat": 34.12345, "lon": -118.12345 },
      "bbox": { "x": 75, "y": 75, "width": 150, "height": 150, "unit": "pixel" },
      "label": "Arbre"
    }
  ]
}
```

### Import mixte

```json
{
  "annotations": [
    {
      "frame_index": 150,
      "frame_timestamp_ms": 5000,
      "gps": { "lat": 34.12345, "lon": -118.12345 },
      "bbox": { "x": 100, "y": 100, "width": 200, "height": 200, "unit": "pixel" },
      "label": "Feu de circulation"
    },
    {
      "gps": { "lat": 34.12346, "lon": -118.12346 },
      "bbox": { "x": 150, "y": 150, "width": 100, "height": 100, "unit": "pixel" },
      "label": "Banc"
    }
  ]
}
```

## Points Importants

1. **Flexibilité** : Le format permet d'importer/exporter différents types d'annotations dans un seul fichier
2. **Rétrocompatibilité** : Les fichiers d'export vidéo existants sont toujours compatibles
3. **Simplicité** : L'import ne nécessite que le tableau d'annotations, les autres champs sont optionnels
4. **Adaptabilité** : Le système détecte automatiquement le type d'annotation en fonction des champs présents

Cette approche unifiée permet de gérer tous les types d'annotations avec un seul format d'API, tout en préservant la flexibilité nécessaire pour les différents cas d'utilisation.