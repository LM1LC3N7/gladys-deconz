// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, buttons), in English and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const UNLOCK = {
  en: 'in Phoscon, open Settings → Gateway → Advanced and press "Authenticate app"',
  fr: "dans Phoscon, ouvrez Paramètres → Passerelle → Avancé et cliquez sur « Authentifier l'application »",
};

export const T = {
  notConfigured: {
    en: 'Type the address of your deCONZ gateway (the Phoscon address, e.g. 192.168.1.20) in the configuration, or press "Find the gateway".',
    fr: "Saisissez l'adresse de votre passerelle deCONZ (celle de Phoscon, par ex. 192.168.1.20) dans la configuration, ou utilisez « Trouver la passerelle ».",
  },
  badHost: {
    en: 'The gateway address is not valid: type an IP address or a host name (192.168.1.20, phoscon.lan), optionally followed by :port.',
    fr: "L'adresse de la passerelle n'est pas valide : saisissez une adresse IP ou un nom d'hôte (192.168.1.20, phoscon.lan), éventuellement suivi de :port.",
  },
  searching: {
    en: 'Looking for a deCONZ gateway on the network…',
    fr: "Recherche d'une passerelle deCONZ sur le réseau…",
  },
  severalFound: (list) => ({
    en: `Several deCONZ gateways answered (${list}): type the address of yours in the configuration.`,
    fr: `Plusieurs passerelles deCONZ ont répondu (${list}) : saisissez l'adresse de la vôtre dans la configuration.`,
  }),
  noApiKey: (host) => ({
    en: `Gateway ${host}: to get an API key, ${UNLOCK.en}, then press "Get an API key" within 60 seconds.`,
    fr: `Passerelle ${host} : pour obtenir une clé d'API, ${UNLOCK.fr}, puis utilisez « Obtenir une clé d'API » dans les 60 secondes.`,
  }),
  keyRefused: {
    en: `The gateway refused the API key (deleted in Phoscon?): ${UNLOCK.en}, then press "Get an API key" again.`,
    fr: `La passerelle a refusé la clé d'API (supprimée dans Phoscon ?) : ${UNLOCK.fr}, puis utilisez à nouveau « Obtenir une clé d'API ».`,
  },
  connecting: (host) => ({
    en: `Connecting to the gateway ${host}…`,
    fr: `Connexion à la passerelle ${host}…`,
  }),
  connected: (name, devices) => ({
    en: `Connected to ${name}: ${plural(devices, 'device', 'devices')}. Open Discovery to add them.`,
    fr: `Connecté à ${name} : ${plural(devices, 'appareil', 'appareils')}. Ouvrez Découverte pour les ajouter.`,
  }),
  unreachable: (reason) => ({
    en: `The deCONZ gateway is unreachable (${reason}): check that deCONZ runs and its address. Retrying automatically.`,
    fr: `La passerelle deCONZ est injoignable (${reason}) : vérifiez que deCONZ tourne et son adresse. Nouvel essai automatique.`,
  }),
  socketLost: (reason) => ({
    en: `The event connection (WebSocket) of the gateway is lost (${reason}). Reconnecting…`,
    fr: `La connexion aux événements (WebSocket) de la passerelle est perdue (${reason}). Reconnexion…`,
  }),
  notConnected: {
    en: 'Not connected to the gateway yet: check the configuration and the status above.',
    fr: "Pas encore connecté à la passerelle : vérifiez la configuration et l'état ci-dessus.",
  },
  find: {
    none: {
      en: 'No deCONZ gateway answered on the network. Type its address in the configuration (Phoscon shows it in Settings → Gateway).',
      fr: "Aucune passerelle deCONZ n'a répondu sur le réseau. Saisissez son adresse dans la configuration (Phoscon l'affiche dans Paramètres → Passerelle).",
    },
    saved: (gateway) => ({
      en: `Gateway found at ${gateway} and saved. Next: ${UNLOCK.en}, then press "Get an API key" within 60 seconds.`,
      fr: `Passerelle trouvée à l'adresse ${gateway} et enregistrée. Ensuite : ${UNLOCK.fr}, puis utilisez « Obtenir une clé d'API » dans les 60 secondes.`,
    }),
    same: (gateway) => ({
      en: `Gateway found at ${gateway}: it is the one configured.`,
      fr: `Passerelle trouvée à l'adresse ${gateway} : c'est celle configurée.`,
    }),
    unavailable: (reason) => ({
      en: `The network scan is not available (${reason}): type the address of the gateway in the configuration.`,
      fr: `La recherche sur le réseau n'est pas disponible (${reason}) : saisissez l'adresse de la passerelle dans la configuration.`,
    }),
  },
  apiKey: {
    noHost: {
      en: 'Type the address of the gateway first (or press "Find the gateway"), and save.',
      fr: "Saisissez d'abord l'adresse de la passerelle (ou utilisez « Trouver la passerelle »), et enregistrez.",
    },
    ok: {
      en: 'API key received and saved: connecting to the gateway. Your devices appear in Discovery in a few seconds.',
      fr: "Clé d'API reçue et enregistrée : connexion à la passerelle. Vos appareils apparaissent dans Découverte dans quelques secondes.",
    },
    locked: {
      en: `The gateway is locked: ${UNLOCK.en}, then press this button again within 60 seconds.`,
      fr: `La passerelle est verrouillée : ${UNLOCK.fr}, puis utilisez à nouveau ce bouton dans les 60 secondes.`,
    },
  },
  test: {
    ok: (name, version, devices, lights, sensors) => ({
      en: `Connection OK: ${name}${version ? ` (deCONZ ${version})` : ''}, ${plural(devices, 'device', 'devices')} (${plural(lights, 'light', 'lights')}, ${plural(sensors, 'sensor', 'sensors')}).`,
      fr: `Connexion OK : ${name}${version ? ` (deCONZ ${version})` : ''}, ${plural(devices, 'appareil', 'appareils')} (${plural(lights, 'lampe ou prise', 'lampes ou prises')}, ${plural(sensors, 'capteur', 'capteurs')}).`,
    }),
    unsupported: (count) => ({
      en: ` ${plural(count, 'resource is', 'resources are')} not supported yet (see the logs).`,
      fr: ` ${plural(count, "ressource n'est", 'ressources ne sont')} pas encore prise${count === 1 ? '' : 's'} en charge (voir les logs).`,
    }),
  },
};

/** The status of a REST failure. */
export function failureText(err) {
  if (err?.reason === 'unauthorized') {
    return T.keyRefused;
  }
  if (err?.reason === 'locked') {
    return T.apiKey.locked;
  }
  return T.unreachable(err?.message ?? 'error');
}
