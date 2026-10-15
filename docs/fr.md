# deCONZ / Phoscon

Vous avez une clé **ConBee** ou une carte **RaspBee** avec **deCONZ** et
l'application **Phoscon**, et vous ne voulez pas tout réappairer dans
Zigbee2MQTT ? Cette intégration connecte Gladys à votre passerelle telle
qu'elle est : vos lampes, prises, volets, thermostats, capteurs et
télécommandes apparaissent dans l'onglet **Découverte** de Gladys, leurs
changements arrivent en direct et vos commandes partent vers la passerelle.
Tout reste sur votre réseau local.

Intégration non officielle, sans lien avec dresden elektronik (éditeur de
deCONZ, Phoscon, ConBee et RaspBee).

> **Version de développement (0.1).** Développée et testée contre des réponses
> de l'API deCONZ reproduites fidèlement, pas encore contre une vraie
> passerelle. Vos retours sont les bienvenus sur le dépôt GitHub.

## Ce que vous obtenez

| Dans deCONZ                                         | Dans Gladys                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Lampes (couleur, température de couleur, variables) | lampe : marche/arrêt, luminosité, température de couleur (mireds), couleur     |
| Prises, relais, « On/Off light »                    | interrupteur (et puissance, tension, courant, énergie si la prise les mesure)  |
| Volets (`Window covering device`)                   | volet : ouvrir, fermer, stop, position (100 % = ouvert)                        |
| `ZHAThermostat` (têtes thermostatiques)             | thermostat : température, consigne, mode (arrêt, chauffe, auto), activité      |
| `ZHATemperature`, `ZHAHumidity`, `ZHAPressure`      | capteurs de température (°C), d'humidité (%), de pression (hPa)                |
| `ZHAOpenClose`, `ZHAPresence`                       | capteur d'ouverture, détecteur de mouvement                                    |
| `ZHAWater`, `ZHAFire`, `ZHACarbonMonoxide`          | détecteurs de fuite d'eau, de fumée, de monoxyde de carbone                    |
| `ZHALightLevel`                                     | luminosité (lux)                                                               |
| `ZHAPower`, `ZHAConsumption`                        | puissance (W), tension (V), courant (A), énergie (kWh, index pour un compteur) |
| `ZHAVibration`, `ZHAMoisture`, `ZHAAirQuality`      | vibration et inclinaison, humidité du sol, COV (ppb)                           |
| `ZHABattery` et la pile de chaque capteur           | batterie (%) de l'appareil                                                     |
| `ZHASwitch` (télécommandes, interrupteurs)          | bouton, et déclencheur de scène **Bouton de télécommande deCONZ**              |

deCONZ découpe souvent un appareil en plusieurs « ressources » (un capteur
Xiaomi = température + humidité + pression) : l'intégration les regroupe en
**un seul appareil Gladys** grâce à l'adresse Zigbee, avec une seule batterie.
Son nom est celui de la lampe, sinon du capteur principal, dans Phoscon.

L'état « joignable » de chaque appareil s'affiche sur son badge de connexion.

## Installation

1. deCONZ tourne et l'application Phoscon s'ouvre dans votre navigateur (par
   exemple `http://192.168.1.20`).
2. Dans la configuration de l'intégration, saisissez l'**adresse de la
   passerelle** : l'adresse IP de la machine où tourne deCONZ, vue depuis la
   machine Gladys (pas `localhost` : l'intégration tourne dans son propre
   conteneur). Laissez le champ vide, ou utilisez **Trouver la passerelle**,
   pour que Gladys la cherche sur le réseau (SSDP).
3. Le **port** est celui de l'application Phoscon : 80 par défaut, sinon celui
   de son adresse (par exemple 8080 pour deCONZ sous Docker). Enregistrez.
4. **Clé d'API** : dans Phoscon, ouvrez **Paramètres → Passerelle → Avancé** et
   cliquez sur **Authentifier l'application**. Dans les 60 secondes, utilisez le
   bouton **Obtenir une clé d'API** de l'intégration : la clé est enregistrée et
   la connexion démarre. (Une clé déjà créée ailleurs peut aussi être collée
   dans le champ « Clé d'API ».)
5. Ouvrez **Découverte** et ajoutez vos appareils. Le bouton **Tester la
   connexion** résume ce que la passerelle contient.

Les événements en direct passent par le **WebSocket** de deCONZ, sur le port
qu'il annonce (souvent 443 sur un Raspberry Pi, 8081 sous Docker) : ce port
doit aussi être joignable depuis la machine Gladys.

## Télécommandes et interrupteurs

Chaque appui d'une télécommande déclenche la scène **Bouton de télécommande
deCONZ**, que vous pouvez filtrer par appareil, par **numéro de bouton** et par
**geste** : clic (`short_release`), appui, maintien, relâché après maintien,
double, triple ou quadruple clic, secousse, chute, inclinaison, rotation. Les
variables `button`, `event`, `code` et `gesture` sont disponibles dans les
actions de la scène.

deCONZ code chaque appui `bouton × 1000 + geste` : `1002` = bouton 1, clic ;
`2001` = bouton 2, maintenu ; `4003` = bouton 4, relâché après maintien. Par
exemple, sur un variateur Hue, 1 = allumer, 2 = plus fort, 3 = moins fort,
4 = éteindre. Pour connaître le numéro d'un bouton, appuyez dessus et regardez
la variable `button` (ou les logs de l'intégration).

Le **cube Aqara** donne la face (`button`) et son geste : retourné de 90° ou
180°, poussé, double tape, secoué, lâché, tourné (l'angle × 100 est dans
`code`). Le **Hue Tap** donne ses boutons 1 à 4.

L'appareil a aussi une fonctionnalité **Bouton** qui prend la valeur du dernier
geste (sans le numéro du bouton) : pratique pour une télécommande à un bouton ;
pour plusieurs boutons, préférez le déclencheur de scène.

## Bon à savoir

- Les **groupes** et les **scènes** de deCONZ ne sont pas encore repris, ni les
  serrures, sirènes et ventilateurs : ils sont ignorés (voir les logs).
- Un thermostat accepte les modes qu'il connaît : un mode refusé par la tête
  renvoie l'erreur de deCONZ.
- Les identifiants des appareils dans Gladys viennent de l'adresse Zigbee : ils
  ne changent pas si deCONZ renumérote ses ressources.
- La passerelle doit être en HTTP sur votre réseau local (le cas par défaut).

## Dépannage

- **« La passerelle deCONZ est injoignable »** : vérifiez l'adresse et le port
  (ceux de Phoscon), et que deCONZ tourne.
- **« La passerelle a refusé la clé d'API »** : la clé a été supprimée dans
  Phoscon (Paramètres → Passerelle → Avancé, liste des applications) : refaites
  l'étape 4.
- **Pas de changements en direct, ou « connexion aux événements perdue »** : le
  port WebSocket de deCONZ n'est pas joignable depuis Gladys (pare-feu, port
  non publié par le conteneur deCONZ).
- **Trouver la passerelle ne trouve rien** : certaines installations (Docker,
  VLAN) ne répondent pas au SSDP ; saisissez l'adresse à la main.
