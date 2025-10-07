# Bug de navigation frame par frame - Explication et correction

## Description du bug

Lors de la navigation frame par frame après une pause, la vidéo ne se met pas toujours à jour visuellement, bien que les frames et les temps soient correctement calculés.

## Cause du bug

Le bug provient d'une incohérence temporelle entre le moment où la vidéo est mise en pause et le moment où la navigation frame par frame est déclenchée :

1. **Au moment de la pause** :
   - La vidéo est mise en pause à un temps `t` qui peut être n'importe où dans une frame
   - Ce temps `t` n'est pas nécessairement au début de la frame
   - L'état `currentFrame` est calculé à partir de ce temps `t` via `Math.round(t * fps)`

2. **Lors de la navigation frame par frame** :
   - On calcule le temps cible comme `targetTime = targetFrame / fps`
   - Ce `targetTime` correspond exactement au début de la frame suivante
   - Mais le temps actuel `t` peut être très proche de ce `targetTime` (puisqu'il n'est pas au début de la frame)
   - La différence entre `t` et `targetTime` peut être inférieure au seuil nécessaire pour forcer un changement visuel

## Exemple concret

```
[BEFORE SKIP] Current Frame: 107, Current Time: 3.575591s  ←  pas au début
[SKIP] Target Frame: 108, Target Time: 3.600000s  ← Début exact de frame 108
```

La différence entre 3.575591s et 3.600000s peut être insuffisante pour forcer l'affichage de la nouvelle frame.

## Solution

La solution actuelle utilise un décalage de 0.5 frames lors du calcul du temps cible :

```javascript
const targetTime = (targetFrame + 0.5) / video.fps;
```

Cette approche :
1. Place le curseur temporel au milieu de la frame cible
2. Garantit une distance suffisante par rapport au temps actuel
3. Force le navigateur à mettre à jour l'affichage visuel

## Solution alternative potentielle

Une autre approche pourrait consister à synchroniser le temps de la vidéo avec le début de la frame courante lors de la pause :

```
const togglePlayPause = useCallback(() => {
  if (videoRef.current) {
    if (isPlaying) {
      videoRef.current.pause();
      // Synchroniser avec le début de la frame courante
      const startTime = currentFrame / video.fps;
      videoRef.current.currentTime = startTime;
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }
}, [isPlaying, currentFrame, video.fps]);
```

Cette approche :
1. Garantirait que la vidéo est toujours positionnée au début d'une frame lorsqu'elle est en pause
2. Rendrait la navigation frame par frame plus prévisible
3. Éliminerait le besoin du +0.5 dans certains cas

## Référence


