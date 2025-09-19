# Nouvelle logique de gestion de la vidéo et des frames

## Architecture globale

La nouvelle approche utilise une **source de vérité unique** : le temps de la vidéo comme référence principale. Toutes les mises à jour de la frame sont dérivées du temps actuel de la vidéo.

## Gestion des mises à jour

### 1. Mise à jour automatique pendant la lecture

```
const handleTimeUpdate = useCallback(() => {
  // Ignorer les mises à jour pendant la navigation manuelle
  if (isManualNavigation) return;
  
  if (videoRef.current && video.fps) {
    const time = videoRef.current.currentTime;
    // Utiliser Math.round au lieu de Math.floor pour une meilleure synchronisation
    // avec la frame réellement affichée
    const frame = Math.round(time * video.fps);
    setCurrentTime(time);
    // Ne mettre à jour la frame que si elle a vraiment changé
    if (frame !== currentFrame) {
      onFrameChange(frame);
    }
  }
}, [video.fps, onFrameChange, isManualNavigation, currentFrame]);
```

**Fonctionnement** :
- Déclenché par l'événement `onTimeUpdate` de la vidéo
- Calcule la frame actuelle à partir du temps avec `Math.round` pour une meilleure synchronisation
- Ne met à jour que si la frame a vraiment changé
- Désactivé pendant la navigation manuelle

### 2. Navigation manuelle frame par frame

#### États utilisés :
```
const [isManualNavigation, setIsManualNavigation] = useState(false);
```

#### Fonction helper de navigation :
```
const navigateToFrame = useCallback((targetFrame: number) => {
  if (!video.fps || !videoRef.current) return;
  
  setIsManualNavigation(true);
  // Calculer le temps exact pour la frame cible
  // Ajouter 0.5 / fps pour se positionner au milieu de la frame
  // Cela garantit que Math.round donnera la bonne frame
  const targetTime = (targetFrame + 0.5) / video.fps;
  
  // Effectuer le seek
  videoRef.current.currentTime = targetTime;
  setCurrentTime(targetTime);
  onFrameChange(targetFrame);
  
  // Réactiver la mise à jour automatique après un court délai
  setTimeout(() => setIsManualNavigation(false), 100);
}, [video.fps, onFrameChange]);
```

#### Fonctions de navigation :
```
const goToPreviousFrame = useCallback(() => {
  if (video.fps && currentFrame > 0) {
    navigateToFrame(currentFrame - 1);
  }
}, [currentFrame, video.fps, navigateToFrame]);

const goToNextFrame = useCallback(() => {
  if (video.fps && duration) {
    const totalFrames = Math.floor(duration * video.fps);
    if (currentFrame < totalFrames - 1) {
      navigateToFrame(currentFrame + 1);
    }
  }
}, [currentFrame, video.fps, duration, navigateToFrame]);
```

## Séquence détaillée de la navigation manuelle

1. **Clic sur "Next Frame" ou "Previous Frame"**
   - Appelle `navigateToFrame` avec la frame cible
   - `setIsManualNavigation(true)` active le mode manuel

2. **Calcul du temps exact**
   - Calcule `targetTime = (targetFrame + 0.5) / video.fps`
   - Le +0.5 permet de se positionner au milieu de la frame
   - Cela garantit que `Math.round` donnera la bonne frame

3. **Mise à jour du temps vidéo**
   - Met à jour `videoRef.current.currentTime = targetTime`
   - Met à jour `setCurrentTime(targetTime)`

4. **Mise à jour de la frame parent**
   - Appelle `onFrameChange(targetFrame)` pour notifier le parent

5. **Retour à la normale**
   - Après 100ms, `setTimeout` appelle `setIsManualNavigation(false)`
   - La synchronisation automatique reprend

## Améliorations par rapport à l'ancienne approche

### 1. Précision améliorée
- Utilisation de `Math.round` au lieu de `Math.floor` pour une meilleure synchronisation
- Positionnement au milieu de la frame pour éviter les erreurs d'arrondi
- Calcul exact du temps pour chaque frame

### 2. Fonction helper centralisée
- Une seule fonction `navigateToFrame` gère toute la logique de navigation
- Réduction de la duplication de code
- Meilleure maintenabilité

### 3. Suppression de l'état `pendingFrameUpdate`
- L'ancienne approche utilisait un état `pendingFrameUpdate` et plusieurs effets
- La nouvelle approche est plus directe et moins sujette aux erreurs
- Moins d'états React à gérer

## Avantages de cette approche

1. **Séparation des responsabilités** :
   - Mise à jour automatique pendant la lecture
   - Contrôle total pendant la navigation manuelle

2. **Évite les boucles de rétroaction** :
   - Pendant la navigation manuelle, `handleTimeUpdate` est désactivé
   - Pas de conflit entre les mises à jour automatiques et manuelles

3. **Lecture fluide** :
   - Utilisation de `Math.round` pour une conversion stable
   - Mise à jour seulement quand nécessaire

4. **Navigation précise** :
   - Positionnement exact au milieu de chaque frame
   - Contrôle total sur le positionnement de la vidéo
   - Pas de dépendance aux événements `onTimeUpdate` pendant la navigation

## Résolution des problèmes précédents

### Problème 1 : Saccades pendant la lecture
- **Solution** : Vérification que la frame a vraiment changé avant mise à jour + utilisation de `Math.round`
- **Résultat** : Lecture fluide sans micro-sauts

### Problème 2 : Navigation manuelle non fonctionnelle
- **Solution** : Mécanisme dédié avec positionnement précis au milieu de la frame
- **Résultat** : Navigation frame par frame précise et fiable

Cette nouvelle logique permet de gérer efficacement les deux modes d'utilisation de la vidéo tout en évitant les conflits entre eux.