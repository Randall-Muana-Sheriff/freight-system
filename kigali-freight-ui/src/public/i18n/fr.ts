import type { Strings } from './en';

// French — complete, and written rather than transliterated.
//
// One of Rwanda's official languages and the one much of Kigali's business
// correspondence still runs in, so the register here is commercial French,
// not tourist French: "expédition" and "enlèvement" rather than "paquet"
// and "ramassage", "chargement" for cargo, "affréteur" avoided in favour
// of "régulateur" since the dispatcher here coordinates rather than
// charters.
//
// Typed as the complete Strings, so a key added to en.ts and forgotten
// here fails the build. Kinyarwanda is allowed to be partial; French is
// not, because there is no reason for it to be.
export const fr: Strings = {
    nav: {
        whatWeMove: 'Ce que nous transportons',
        howItWorks: 'Comment ça marche',
        theSystem: 'Le système',
        talkToUs: 'Nous contacter',
        home: 'Accueil Inzira',
    },
    actions: {
        book: 'Commander une livraison',
        track: 'Suivre une expédition',
        trackSubmit: 'Suivre',
        looking: 'Recherche…',
        placing: 'Envoi…',
        placeOrder: 'Valider la commande',
        showMeAround: 'Faites-moi visiter',
        standingRoutes: 'Lignes régulières',
        staffSignIn: 'Espace personnel',
        support: 'Assistance',
        privacy: 'Confidentialité',
        skipToContent: 'Aller au contenu',
        bookInstead: 'Commander une livraison →',
    },
    track: {
        title: 'Où est-elle ?',
        eyebrow: 'Suivi',
        codeLabel: 'Code de suivi',
        finding: 'Recherche de votre expédition',
        collectFrom: 'Enlèvement à',
        deliverTo: 'Livraison à',
        driver: 'Chauffeur',
        placed: 'Commandée le',
        statusInProgress: 'En cours',
        statusDelivered: 'Livrée',
        statusCancelled: 'Annulée',
        proofTitle: 'Preuve de livraison',
        notYet: 'Pas encore',
        milestones: {
            received: 'Commande reçue',
            receivedNote: 'En cours de vérification par un régulateur.',
            assigned: 'Chauffeur assigné',
            assignedNote: 'Inscrite sur la feuille de route d’un chauffeur.',
            collected: 'Enlevée',
            collectedNote: 'Le chargement est à bord.',
            delivered: 'Livrée',
            deliveredNote: 'Réceptionnée, avec photo à l’appui.',
        },
    },
    form: {
        name: 'Nom',
        phone: 'Téléphone',
        emailOptional: 'E-mail — facultatif',
        whatMoved: 'Que devons-nous transporter ?',
        messageReceived: 'Message bien reçu.',
        weAnswer: 'Nous répondons au numéro que vous avez indiqué, en général le jour même.',
    },
    footer: {
        getMoving: 'Commencer',
        company: 'Société',
        tagline: 'Du fret dans tout Kigali, avec la position de chaque expédition visible par celui qui l’a envoyée.',
    },
    hero: {
        eyebrow: 'Du fret dans tout Kigali',
        headlineTop: 'Sachez où',
        headlineBottom: 'se trouve votre chargement.',
        body:
            'La plupart des transporteurs deviennent muets dès que la marchandise quitte votre portail. ' +
            'Pas nous : chaque expédition porte un code qui vous montre sa position jusqu’à la signature.',
    },
    services: {
        eyebrow: 'Ce que nous transportons',
        headline: 'Six façons de l’acheminer.',
        items: [
            { name: 'Livraison le jour même', spec: 'Commandez avant midi', body: 'Partout dans Kigali, sur la route dans l’heure, suivie d’un bout à l’autre.' },
            { name: 'Fret en vrac', spec: 'Charges palettisées', body: 'Une flotte de gros porteurs, avec des chauffeurs qui chargent et arriment eux-mêmes.' },
            { name: 'Transport sécurisé', spec: 'Scellé et vérifié', body: 'Marchandises de valeur sous scellés inviolables, avec rapport d’incident si l’on y touche.' },
            { name: 'Lignes régulières', spec: 'Réglé une fois, roule tous les jours', body: 'Une liaison fixe entre deux points, pour ne plus commander la même course chaque matin.' },
            { name: 'De dépôt à dépôt', spec: 'Déposez et repartez', body: 'Laissez la marchandise dans l’un de nos dépôts et nous l’acheminons jusqu’au dépôt d’arrivée.' },
            { name: 'Coursier de documents', spec: 'Signature à l’arrivée', body: 'Contrats et certificats, avec une chaîne de responsabilité présentable à un client.' },
        ],
    },
    journey: {
        eyebrow: 'Du début à la fin',
        headline: 'Ce qui arrive à votre chargement.',
        stops: [
            { name: 'Vous passez commande', body: 'Enlèvement, destination, nature de la marchandise. Sans compte, sans appel, sans attendre un devis pour pouvoir commander.' },
            { name: 'Un régulateur la confirme', body: 'Une personne vérifie les adresses et vous appelle en cas de doute. Rien ne part chez un chauffeur sans contrôle.' },
            { name: 'Un chauffeur la prend', body: 'Le chauffeur vérifié le plus proche en service, votre marchandise sur sa feuille de route et son véhicule sur notre carte.' },
            { name: 'Vous la suivez', body: 'Votre code montre où se trouve la marchandise, pas seulement qu’elle est partie. Actualisez autant que vous voulez.' },
            { name: 'Signée et photographiée', body: 'Preuve prise à la porte et horodatée : la livraison est consignée, pas seulement racontée.' },
        ],
    },
    about: {
        eyebrow: 'Le système',
        headline: 'Tout le monde regarde le même dossier.',
        intro:
            'La plupart des transporteurs fonctionnent au téléphone et au carnet : ce qu’on vous dit dépend ' +
            'de qui vous demandez et de sa dernière vérification. Inzira est un seul système. Le téléphone du ' +
            'chauffeur, l’écran du régulateur et votre page de suivi sont trois vues de la même expédition, ' +
            'et elles se mettent à jour ensemble.',
        views: [
            { title: 'Ce que vous voyez', body: 'Commandez avec un nom et un numéro — sans compte. Vous recevez un code indiquant l’étape où en est votre marchandise, son lieu d’enlèvement et sa destination, le prénom du chauffeur une fois assigné, et la photo prise à la remise.' },
            { title: 'Ce que porte le chauffeur', body: 'Une application ne contenant que ses propres courses. Elle transmet la position du véhicule pendant le service, prend la photo de preuve à la porte et signale pannes et dommages depuis le bord de la route. Dans un coin de la ville sans réseau, elle garde la confirmation et l’envoie au retour de la connexion.' },
            { title: 'Ce que surveille la régulation', body: 'Tous les véhicules en service sur une carte en direct, avec des zones de livraison délimitées qui déclenchent une alerte si un véhicule transportant votre marchandise en sort. Les nouvelles commandes sont vérifiées par une personne, et le système propose le chauffeur disponible le plus proche plutôt que le premier à répondre.' },
        ],
        closing:
            'Rien de tout cela ne se voit de l’extérieur, et c’est bien l’intérêt : c’est pourquoi le code ' +
            'que nous vous envoyons peut être cru sur parole.',
    },
    contact: {
        eyebrow: 'Nous contacter',
        headline: 'Vous expédiez régulièrement ?',
        body:
            'Les lignes régulières et les gros volumes sont tarifés par entreprise plutôt qu’à la course. ' +
            'Dites-nous ce que cela représente et nous revenons vers vous avec un chiffre.',
        address: 'Zone industrielle de Gikondo · Kigali',
    },
    language: {
        label: 'Langue',
        english: 'Anglais',
        kinyarwanda: 'Kinyarwanda',
    },
};
