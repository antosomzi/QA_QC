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
    const frame = Math.floor(time * video.fps);
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
- Calcule la frame actuelle à partir du temps
- Ne met à jour que si la frame a vraiment changé
- Désactivé pendant la navigation manuelle

### 2. Navigation manuelle frame par frame

#### États utilisés :
```
const [isManualNavigation, setIsManualNavigation] = useState(false);
const [pendingFrameUpdate, setPendingFrameUpdate] = useState<number | null>(null);
```

#### Fonction de navigation :
```
const goToNextFrame = useCallback(() => {
  if (video.fps && duration) {
    const totalFrames = Math.floor(duration * video.fps);
    if (currentFrame < totalFrames - 1) {
      setIsManualNavigation(true);
      setPendingFrameUpdate(currentFrame + 1);
      // Réactiver la mise à jour automatique après un court délai
      setTimeout(() => setIsManualNavigation(false), 100);
    }
  }
}, [currentFrame, video.fps, duration]);
```

#### Effet pour mettre à jour le temps vidéo :
```
useEffect(() => {
  if (videoRef.current && video.fps && isManualNavigation && pendingFrameUpdate !== null) {
    const timeInSeconds = pendingFrameUpdate / video.fps;
    videoRef.current.currentTime = timeInSeconds;
    setCurrentTime(timeInSeconds);
  }
}, [pendingFrameUpdate, video.fps, isManualNavigation]);
```

#### Effet pour mettre à jour la frame parent :
```
useEffect(() => {
  if (pendingFrameUpdate !== null) {
    onFrameChange(pendingFrameUpdate);
    setPendingFrameUpdate(null);
  }
}, [pendingFrameUpdate, onFrameChange]);
```

## Séquence détaillée de la navigation manuelle

1. **Clic sur "Next Frame"**
   - `setIsManualNavigation(true)` active le mode manuel
   - `setPendingFrameUpdate(currentFrame + 1)` définit la frame cible

2. **Effet de mise à jour du temps vidéo**
   - Déclenché par le changement de `pendingFrameUpdate`
   - Calcule `timeInSeconds = (currentFrame + 1) / video.fps`
   - Met à jour `videoRef.current.currentTime`
   - Met à jour `setCurrentTime`

3. **Effet de mise à jour de la frame parent**
   - Déclenché par le changement de `pendingFrameUpdate`
   - Appelle `onFrameChange(currentFrame + 1)`
   - Réinitialise `pendingFrameUpdate` à `null`

4. **Retour à la normale**
   - Après 100ms, `setTimeout` appelle `setIsManualNavigation(false)`
   - La synchronisation automatique reprend

## Avantages de cette approche

1. **Séparation des responsabilités** :
   - Mise à jour automatique pendant la lecture
   - Contrôle total pendant la navigation manuelle

2. **Évite les boucles de rétroaction** :
   - Pendant la navigation manuelle, `handleTimeUpdate` est désactivé
   - Pas de conflit entre les mises à jour automatiques et manuelles

3. **Lecture fluide** :
   - Utilisation de `Math.floor` pour une conversion stable
   - Mise à jour seulement quand nécessaire

4. **Navigation précise** :
   - Contrôle total sur le positionnement de la vidéo
   - Pas de dépendance aux événements `onTimeUpdate` pendant la navigation

## Résolution des problèmes précédents

### Problème 1 : Saccades pendant la lecture
- **Solution** : Vérification que la frame a vraiment changé avant mise à jour
- **Résultat** : Lecture fluide sans micro-sauts

### Problème 2 : Navigation manuelle non fonctionnelle
- **Solution** : Mécanisme dédié avec états et effets séparés
- **Résultat** : Navigation frame par frame précise et fiable

Cette nouvelle logique permet de gérer efficacement les deux modes d'utilisation de la vidéo tout en évitant les conflits entre eux.