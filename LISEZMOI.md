# Z, première version de démonstration

Payer avec son visage, sans téléphone ni carte. Argent simulé, tout reste sur cet ordinateur.

## Lancer

Double-cliquez sur `lancer.bat` (Node.js doit être installé), ou dans un terminal :

    node server.js

Puis ouvrez http://localhost:5173 dans Chrome et autorisez la caméra.

## Déroulé conseillé devant un jury (3 minutes)

1. **Enrôler un client** : nom, code PIN, dépôt, puis le visage. Deux gestes sont demandés au hasard.
2. **Encaisser** 2 500 FCFA : le client regarde la caméra, le paiement passe sans rien toucher.
3. **Encaisser** 15 000 FCFA : le code PIN est demandé.
4. **Attaque par photo** : montrez une photo du client sur un téléphone. Le geste demandé n'est pas fait, le paiement est refusé.
5. **Payer un particulier** : enrôlez une deuxième personne, choisissez-la dans « Qui reçoit l'argent ? », et la première la paie avec son visage.
6. **Voyage impossible** : choisissez « Quincaillerie du Nord, Parakou » et encaissez tout de suite après un paiement à Cotonou. Le paiement passe avec le PIN, sans rien montrer d'anormal.
7. **Signalements** : ouvrez l'onglet. Le paiement précédent y figure avec ses motifs, prêt à être transmis.
8. **Suivi des fraudes** : cliquez « Ajouter une semaine d'activité simulée » et montrez les alertes expliquées.
9. **Vérifier un document** : déposez une photo de pièce, puis la même retouchée.

## Règles de décision

- Score de 30 ou plus, ou montant de 10 000 FCFA ou plus : code PIN exigé.
- Score de 60 ou plus : le paiement n'est pas bloqué, il est inscrit au registre des signalements, sans que le payeur ni le bénéficiaire le voient.
- Trois codes PIN faux, ou geste anti-usurpation non fait : paiement refusé.

## Ce que cette version ne fait pas encore

- Aucun argent réel, aucune connexion à un opérateur. Aucun signalement n'est réellement transmis.
- L'anti-usurpation arrête une photo ou une vidéo simple, pas un deepfake soigné.
- Les modèles sont génériques, pas encore réentraînés sur des visages africains.
- Le score de fraude repose sur des règles et des statistiques, pas encore sur un modèle de graphe.
- Pas d'empreinte digitale (il faut un lecteur).

Les trois points du milieu sont le programme de la phase GPU.

## Organisation du code

- `public/js/face.js` : caméra, défis anti-usurpation, identification.
- `public/js/fraud.js` : score de risque et données simulées.
- `public/js/docs.js` : contrôle des pièces d'identité.
- `public/js/app.js` : les écrans.
