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
        trackPrompt: 'Suivez votre marchandise',
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

    order: {
        price: 'Prix',
        priceEstimate: 'Prix estimé',
        estimateNote: 'Une estimation basée sur le poids seul. Nous la confirmons dès que l\'enlèvement et la livraison sont localisés.',
        priceQuoting: 'Calcul en cours…',
        eyebrow: 'Commande · sans compte',
        received: 'Commande reçue',
        collectFrom: 'Enlèvement à',
        collectPlaceholder: 'Zone industrielle de Gikondo, portail 3',
        deliverTo: 'Livraison à',
        deliverPlaceholder: 'Marché de Kimironko, boutique 14',
        whatIsIt: 'De quoi s’agit-il',
        choose: 'Choisir…',
        weight: 'Poids en kg',
        weightPlaceholder: '150',
        neededBy: 'Pour quand — facultatif',
        instructions: 'À signaler au chauffeur — facultatif',
        instructionsPlaceholder: 'Fragile. Demander Claudine au portail.',
        yourName: 'Votre nom',
        namePlaceholder: 'Jean Mutabazi',
        phonePlaceholder: '0788 000 000',
        emailPlaceholder: 'vous@entreprise.rw',
        failed: 'Impossible d’enregistrer votre commande.',
        codeCopied: 'Code de suivi copié',
    },
    hero_art: {
        alt: 'Illustration d’une expédition allant de Gikondo à Kimironko à travers le réseau de dépôts Inzira',
        inTransit: 'En transit',
        sampleShipment: 'Exemple d’expédition',
    },
    misc: {
        closeTour: 'Fermer la visite',
        reference: 'Référence',
        haveACode: 'Vous avez un code ?',
        codePlaceholder: 'INZ-XXXXXXXX',
        enquiryPlaceholder: 'Deux palettes par semaine de Gikondo à Musanze…',
        address: 'Zone industrielle de Gikondo',
        cityCountry: 'Kigali, Rwanda',
    },
    meta: {
        titleOrder: 'Passer une commande',
        titleTrack: 'Suivre une expédition',
        titlePrivacy: 'Politique de confidentialité',
        titleSupport: 'Assistance',
        descOrder: 'Commandez du fret dans Kigali en moins d’une minute. Enlèvement, destination et nature de la marchandise — sans compte, et un code de suivi par SMS dès la commande passée.',
        descTrack: 'Saisissez le code reçu par SMS pour voir où se trouve votre expédition Inzira, à quelle étape elle en est et qui la conduit.',
        descPrivacy: 'Ce que le site Inzira et l’application Inzira Driver collectent, pourquoi, avec qui c’est partagé, et comment demander vos données.',
        descSupport: 'Aide pour une livraison ou pour l’application Inzira Driver — téléphone, e-mail, et réponses aux problèmes les plus courants des chauffeurs.',
        descDefault: 'Fret le jour même et en vrac dans tout Kigali. Commandez en moins d’une minute sans compte, puis suivez votre marchandise de l’enlèvement à la signature avec un code de suivi.',
    },

    coming: {
        theWay: 'la voie',
        openingPrefix: 'Ouverture',
        headlineTop: 'Du fret dans tout Kigali,',
        headlineBottom: 'sans rien cacher.',
        body:
            'Nous construisons un service de fret où celui qui a expédié la marchandise voit ' +
            'exactement où elle se trouve, d’un bout à l’autre. Pas encore ouvert au public — ' +
            'laissez-nous votre numéro et nous vous préviendrons le jour venu.',
        days: 'Jours',
        hours: 'Heures',
        minutes: 'Min',
        seconds: 'Sec',
        opensOn: 'Inzira ouvre en',
        notifyMe: 'Prévenez-moi',
    },

    cargo: {
        'General goods': 'Marchandises générales',
        'Retail stock': 'Stock de détail',
        'Construction materials': 'Matériaux de construction',
        'Perishables': 'Denrées périssables',
        'Documents': 'Documents',
        'Fragile / high-value': 'Fragile / de valeur',
        'Other': 'Autre',
    },
    neededBy: {
        today: 'Aujourd’hui',
        tomorrow: 'Demain',
        this_week: 'Cette semaine',
        flexible: 'Peu importe',
    },
    review: {
        collectFrom: 'Enlèvement à',
        deliverTo: 'Livraison à',
        cargo: 'Marchandise',
        weight: 'Poids',
        needed: 'Pour',
        contact: 'Contact',
        notes: 'Remarques',
    },

    errors: {
        NOT_FOUND: 'Aucune expédition ne correspond à ce code. Vérifiez le code reçu par SMS.',
        MISSING_CODE: 'Saisissez un code de suivi.',
        MISSING_FIELDS: 'Merci d’indiquer les adresses d’enlèvement et de livraison, ainsi que la nature de la marchandise.',
        MISSING_LOCATIONS: 'Merci d’indiquer à la fois une adresse d’enlèvement et une adresse de livraison.',
        MISSING_CONTACT: 'Merci d’indiquer un nom et un numéro de téléphone pour que nous puissions vous joindre.',
        INVALID_CARGO_TYPE: 'Choisissez un type de marchandise dans la liste.',
        INVALID_NEEDED_BY: 'Choisissez l’une des échéances proposées, ou laissez le champ vide.',
        INVALID_PHONE: 'Ce numéro ne ressemble pas à un mobile rwandais.',
        INVALID_WEIGHT: 'Indiquez le poids en kilogrammes, en chiffres.',
        ORDER_CREATE_FAILED: 'Nous n’avons pas pu enregistrer votre commande pour le moment. Merci de réessayer.',
        TRACK_FAILED: 'Nous n’avons pas pu effectuer cette recherche pour le moment. Merci de réessayer.',
        CONTACT_FAILED: 'Nous n’avons pas pu envoyer votre message pour le moment. Merci de réessayer.',
        TOKEN_COLLISION: 'Un problème est survenu lors de la génération de votre code de suivi. Merci de réessayer.',
        UNREADABLE: 'Le serveur a renvoyé une réponse illisible. Merci de réessayer.',
        GENERIC: 'Une erreur est survenue. Merci de réessayer.',
    },

    steps: {
        heading: 'Où va-t-elle ?',
        cargo: 'Marchandise',
        contact: 'Contact',
        check: 'Vérification',
        continue: 'Continuer',
        keepCode: 'Gardez ce code.',
        keepCodeBody: 'C’est ainsi que vous verrez où se trouve votre marchandise. Un régulateur vérifie les détails et vous appellera si quelque chose doit être confirmé.',
        trackItNow: 'Suivre maintenant',
        done: 'Terminé',
        neededByNote: 'Cela aide le régulateur à organiser votre course. Il confirmera ce qui est possible lors de son appel.',
        phoneNote: 'Votre code de suivi est envoyé à ce numéro, et c’est également celui que le régulateur appelle si l’adresse d’enlèvement doit être vérifiée.',
    },
    trackExtra: {
        cancelledNote: 'Cette expédition a été annulée. Appelez-nous si cela vous surprend.',
        photographedAt: 'Photographiée à la remise',
        onDate: 'le',
        byDriver: 'par',
    },
    comingExtra: {
        thanks: 'Merci — nous vous enverrons un SMS le jour de l’ouverture.',
    },

    buttons: {
        send: 'Envoyer le message',
        sending: 'Envoi…',
        copyCode: 'Copier le code',
        copied: 'Copié',
        cancel: 'Annuler',
        back: '← Retour',
        gotIt: 'Compris',
        next: 'Suivant',
    },
    tour: {
        bookTitle: 'Commandez ici',
        bookBody: 'Enlèvement, destination, ce que vous envoyez. Il suffit d’un nom et d’un numéro de téléphone — aucun compte à créer.',
        trackTitle: 'Déjà envoyé quelque chose ?',
        trackBody: 'Saisissez ici le code reçu par SMS pour voir où votre marchandise est arrivée.',
    },

    entries: {
        bookTitle: 'Commander une livraison',
        bookBody: 'En moins d’une minute, sans compte.',
        trackTitle: 'Suivre une expédition',
        trackBody: 'Voyez où est votre marchandise.',
        standingTitle: 'Lignes régulières',
        standingBody: 'Liaisons régulières, tarifées par entreprise.',
    },
    nav_mobile: {
        open: 'Ouvrir le menu',
        close: 'Fermer le menu',
    },
    journeyExtra: {
        stopLabel: 'Étape',
    },
    backToTop: {
        label: 'Haut de page',
    },
    language: {
        label: 'Langue',
        english: 'Anglais',
        kinyarwanda: 'Kinyarwanda',
    },
};
