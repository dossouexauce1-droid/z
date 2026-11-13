# Z : ce qu'il faut entraîner sur les GPU, et ce qu'il faut présenter

Le formulaire du challenge demande une solution qui « exploite pleinement la puissance des GPU ».
La démo actuelle tourne avec des modèles génériques et des règles. Ce document dit quoi entraîner,
avec quelles données, comment mesurer le résultat, et quoi montrer au jury les 25 et 26 novembre.

Les jeux de données cités sont publics à ma connaissance, mais vérifiez pour chacun la licence et
les conditions d'accès avant de vous engager : plusieurs demandent une inscription ou un accord de recherche.

## Ordre de priorité

Si le temps de GPU est court, faites dans cet ordre. Le modèle 1 seul suffit à justifier les GPU.

| Priorité | Modèle | Pourquoi c'est lui d'abord |
|---|---|---|
| 1 | Anti-usurpation du visage | Sans lui, le paiement par visage n'est pas crédible. C'est la première question du jury. |
| 2 | Reconnaissance fiable sur visages africains | C'est l'argument local, et il se mesure avec un chiffre simple. |
| 3 | Détection de fraude par graphe | Relie le projet au cas d'usage « fraude sur paiements instantanés ». |
| 4 | Pièces d'identité falsifiées | Bonus. À ne faire que si les trois premiers sont terminés. |

## Modèle 1 : anti-usurpation (photo, vidéo, masque, deepfake)

- **But** : à partir de quelques images de la caméra, répondre « visage réel » ou « attaque ».
- **Aujourd'hui dans la démo** : un défi de gestes (tourner la tête, ouvrir la bouche). Il arrête une photo, pas une vidéo bien préparée ni un deepfake.
- **Données** : CelebA-Spoof, OULU-NPU, SiW, CASIA-FASD. Ajoutez vos propres attaques : filmez les quatre membres de l'équipe en vrai, puis rejouez ces vidéos sur téléphone, tablette et papier imprimé. Ces données maison, tournées avec des téléphones d'ici, sont un argument fort.
- **Entraînement** : partir d'un réseau de vision pré-entraîné (ConvNeXt ou ViT de petite taille) et l'affiner en classification binaire. Augmentations : flou, compression, reflets, changement de luminosité.
- **Mesure** : taux d'attaques acceptées et taux de vrais visages refusés, sur des personnes et des écrans jamais vus à l'entraînement. Objectif réaliste : moins de 5 % d'erreur de chaque côté.
- **Usage du GPU** : quelques heures d'affinage, puis réponse en moins de 50 ms par image.

## Modèle 2 : reconnaissance réentraînée sur visages africains

- **But** : réduire les erreurs d'identification sur les peaux foncées, où les modèles génériques sont moins bons.
- **Données** : CASIA-Face-Africa, et pour la mesure d'équité RFW (Racial Faces in the Wild) et BUPT-Balancedface.
- **Entraînement** : affiner un modèle de reconnaissance existant (famille ArcFace) sur ces données. Ne pas repartir de zéro : c'est trop long pour un challenge.
- **Mesure** : le même test avant et après affinage, par groupe de population. Le chiffre à montrer : « taux de fausses acceptations sur visages africains divisé par N ».
- **Usage du GPU** : c'est l'entraînement le plus lourd du projet, plusieurs heures à plusieurs jours selon la carte.
- **Recherche rapide parmi des millions de clients** : indexer les empreintes sur GPU (bibliothèque FAISS) et mesurer le temps de recherche pour 1 million d'empreintes synthétiques.

## Modèle 3 : fraude par graphe de transactions

- **But** : repérer les comptes complices et les circuits d'argent, pas seulement le paiement isolé.
- **Aujourd'hui dans la démo** : des règles et des statistiques par client.
- **Données** : PaySim (transactions mobile money simulées), IEEE-CIS Fraud Detection, et le jeu Elliptic pour s'exercer sur un graphe étiqueté. Demandez aussi aux partenaires du challenge s'ils fournissent des données.
- **Entraînement** : construire le graphe (un compte est un nœud, un paiement est un lien), puis entraîner un réseau de neurones sur graphe (GraphSAGE avec PyTorch Geometric). Comparer à un modèle classique (XGBoost sur GPU) pour prouver le gain.
- **Mesure** : précision et rappel sur la classe « fraude », et aire sous la courbe précision-rappel. Ne pas présenter le taux de bonnes réponses global : la fraude est rare, ce chiffre est trompeur.
- **Usage du GPU** : préparation des données avec RAPIDS cuDF, entraînement du graphe, score en temps réel.

## Modèle 4 : pièces d'identité falsifiées

- **Données** : MIDV-500 et MIDV-2020 (pièces d'identité fictives), DocTamper et CASIA v2 pour les retouches.
- **Entraînement** : un modèle de segmentation qui colore les zones modifiées.
- **Limite à dire au jury** : il n'existe pas de jeu public de cartes d'identité de la zone UEMOA. Le modèle sera générique tant qu'un partenaire n'en fournit pas.

## Ce qu'il faut présenter à la finale

1. **Le problème en une phrase** : payer sans téléphone ni carte, sans ouvrir la porte à la fraude.
2. **La démonstration en direct**, dans cet ordre : enrôlement, paiement par visage, attaque par photo refusée, attaque par vidéo refusée grâce au modèle 1, paiement suspect signalé.
3. **Un tableau avant / après GPU** : pour chaque modèle, le chiffre de départ (version actuelle) et le chiffre obtenu après entraînement. C'est la diapositive la plus importante.
4. **L'usage des GPU** : durée d'entraînement, taille des données, temps de réponse. Une capture de la carte en charge suffit.
5. **Les limites, dites franchement** : argent simulé, pas d'agrément, données biométriques à protéger, destinataire des signalements à valider avec un juriste.
6. **La suite** : pilote avec un partenaire fintech, lecteur d'empreinte digitale, agrément.

## Questions que le jury posera sûrement

- **« Et si on vous présente un deepfake ? »** Réponse : le modèle 1, avec son taux d'erreur mesuré.
- **« Où sont stockés les visages ? »** Réponse : aucune photo, seulement une empreinte numérique. Précisez qu'en production elle devra être chiffrée et que la loi béninoise sur les données personnelles impose une déclaration à l'autorité de protection des données.
- **« Pourquoi ne pas bloquer un paiement suspect ? »** Préparez votre réponse : le code PIN reste exigé dès qu'un paiement est inhabituel, et le signalement évite d'alerter le fraudeur.
- **« Qu'est-ce qui existe déjà ? »** Le paiement par visage existe en Chine et aux États-Unis. Votre différence : fonctionner avec le simple téléphone du commerçant, et être fiable sur les visages d'ici.

## Calendrier conseillé jusqu'au 25 novembre

- **Dès l'accès aux GPU** : télécharger les données du modèle 1 et lancer un premier entraînement court pour vérifier que tout fonctionne.
- **Formation en ligne** : tourner les vidéos d'attaque maison ; lancer le modèle 2 en tâche de fond.
- **Phase de développement** : brancher le modèle 1 dans l'application, puis le modèle 3.
- **Deux jours avant** : figer le code, répéter la démonstration trois fois, préparer une vidéo de secours au cas où la caméra ou le réseau lâche.
