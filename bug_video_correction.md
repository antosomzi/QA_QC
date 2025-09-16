# Analyse du Bug de la Navigation par Frames dans le Lecteur Vidéo

## Description du Problème

Lorsque la vidéo est en pause, le premier clic sur "Frame suivante" ou "Frame précédente" ne met pas à jour visuellement l'affichage de la vidéo, bien que les valeurs internes (currentTime, currentFrame) soient correctement mises à jour. Les clicks suivant marchent et mettent à jours la vidéo

Je viens de comprendre que quand je pause la vidéo, la frame affiché sur le compteur de frame n'est pas la bonne frame. La frame de la vidéo vaut frame affiché +1 donc quand je skip de frame, c'est normal que le visuelle de la vidéo ne change pas