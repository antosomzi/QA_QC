# Format d'Import/Export des Annotations

Ce document décrit le format d'import/export JSON utilisé pour les annotations dans l'application, qui prend en charge les annotations avec multiples bounding boxes par objet.

## Nouveau Format Unifié (Post-Migration)

L'application utilise maintenant un format qui sépare les annotations (objets) des bounding boxes (positions rectangulaires) :

### 1. Format d'Export

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
      "gps": { 
        "lat": 34.12345, 
        "lon": -118.12345 
      },
      "label": "Panneau de signalisation",
      "created_at": 1234567890,
      "updated_at": 1234567890,
      "boundingBoxes": [
        {
          "frame_index": 123,
          "frame_timestamp_ms": 123456,
          "x": 100,
          "y": 100,
          "width": 200,
          "height": 200,
          "unit": "pixel"
        },
        {
          "frame_index": 125,
          "frame_timestamp_ms": 125000,
          "x": 105,
          "y": 102,
          "width": 195,
          "height": 198,
          "unit": "pixel"
        }
      ]
    }
  ]
}
```

**Caractéristiques :**
- **1 Annotation** = 1 objet détecté à une position GPS fixe
- **N BoundingBoxes** = Positions rectangulaires de cet objet sur différentes frames
- Le champ `video` est présent avec toutes les informations de la vidéo (si applicable)
- Les coordonnées GPS sont stockées au niveau de l'annotation
- Chaque bounding box a ses propres coordonnées de frame

### 2. Format d'Import

Le format d'import supporte à la fois le nouveau format et l'ancien (rétrocompatibilité) :

#### Nouveau Format (Recommandé)
```json
{
  "annotations": [
    {
      "id": "uuid-de-l-annotation",  // Optionnel - généré si absent
      "gps": { 
        "lat": 34.12345, 
        "lon": -118.12345 
      },
      "label": "Étiquette",
      "boundingBoxes": [
        {
          "frame_index": 100,
          "frame_timestamp_ms": 3333,
          "x": 50,
          "y": 50,
          "width": 100,
          "height": 100,
          "unit": "pixel"
        },
        {
          "frame_index": 105,
          "frame_timestamp_ms": 3500,
          "x": 55,
          "y": 52,
          "width": 98,
          "height": 102,
          "unit": "pixel"
        }
      ]
    }
  ]
}
```

#### Ancien Format (Rétrocompatibilité)
```json
{
  "annotations": [
    {
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
      "label": "Panneau de signalisation"
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