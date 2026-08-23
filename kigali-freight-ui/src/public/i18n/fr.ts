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
        whatWeDo: 'Ce que nous faisons',
        howItWorks: 'Comment ça marche',
        talkToUs: 'Nous contacter',

        whatWeMove: 'Ce que nous transportons',
        pricing: 'Tarifs',
        forBusiness: 'Entreprises',
        theJourney: 'Le parcours de votre marchandise',
        theSystem: 'Le système',
        questions: 'Questions fréquentes',
        home: 'Accueil Inzira',
    },
    nav_desc: {
        whatWeMove: 'De l’enveloppe au chargement complet',
        pricing: 'La grille tarifaire, publiée en entier',
        forBusiness: 'Lignes régulières et lots complets',
        theJourney: 'De la commande à la signature, étape par étape',
        theSystem: 'Ce que chauffeur, régulateur et vous voyez',
        questions: 'Responsabilité, paiement, ce que nous prenons',
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
        idleTitle: 'Le code se trouve dans votre SMS de confirmation.',
        idleBody: 'Il ressemble à INZ-XXXXXXXX et arrive par SMS dès qu’une commande est passée. Sans compte, et sans rien à quoi se connecter.',
        idleNoCode: 'Vous n’avez encore rien commandé ?',
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
            deliveredNote: 'Réceptionnée, avec preuve enregistrée.',
        },
    },
    form: {
        name: 'Nom',
        phone: 'Téléphone',
        emailOptional: 'E-mail (facultatif)',
        whatMoved: 'Que devons-nous transporter ?',
        messageReceived: 'Message bien reçu.',
        weAnswer: 'Nous répondons au numéro que vous avez indiqué, en général le jour même.',
    },
    footer: {
        getMoving: 'Commencer',
        company: 'Société',
        questions: 'Questions fréquentes',
        tagline: 'Du fret à Kigali et dans tout le Rwanda, la position de chaque expédition visible par celui qui l’a envoyée.',
    },
    hero: {
        headline: 'Du fret à travers Kigali, visible d’un bout à l’autre',
        lead:
            'Livraison le jour même dans la ville, et chargements complets partout au Rwanda. '
            + 'Commandez en moins d’une minute, sans compte, puis suivez la marchandise de '
            + 'l’enlèvement à la signature.',
        trackPrompt: 'Suivez votre marchandise',
    },
    services: {
        eyebrow: 'Ce que nous transportons',
        headline: 'Six façons de l’acheminer',
        items: [
            { name: 'Livraison le jour même', spec: 'Jusqu’à 1 t · Kigali', body: 'Commandée avant midi, sur la route dans l’heure et suivie d’un bout à l’autre. Nos fourgons desservent tous les quartiers de la ville.' },
            { name: 'Fret en vrac', spec: '1 – 12 t · tout le pays', body: 'Charges palettisées ou en vrac, en camion ou en gros porteur, avec des chauffeurs qui chargent et arriment eux-mêmes plutôt que de vous regarder faire.' },
            { name: 'Transport sécurisé', spec: 'Scellé · incident consigné', body: 'Marchandises de valeur sous scellés inviolables, photographiées au départ et à l’arrivée, avec un rapport écrit si un scellé est rompu entre les deux.' },
            { name: 'Lignes régulières', spec: 'Réglé une fois · roule tous les jours', body: 'Une liaison fixe entre deux points, tarifée à la ligne et non à la course, pour ne plus commander le même trajet chaque matin.' },
            { name: 'De dépôt à dépôt', spec: 'Nyabugogo · Kimironko · Gikondo', body: 'Laissez la marchandise dans l’un de nos trois dépôts et nous l’acheminons jusqu’au dépôt d’arrivée. C’est la façon la moins chère d’expédier ce qui n’est pas urgent.' },
            { name: 'Coursier de documents', spec: 'Signature à l’arrivée', body: 'Contrats et certificats acheminés le jour même, avec une chaîne de responsabilité horodatée que vous pouvez présenter à un client.' },
        ],
    },
    pricing: {
        eyebrow: 'Ce que cela coûte',
        headline: 'Notre grille tarifaire, en public',
        intro:
            'Ici, le fret se négocie au téléphone : le prix dépend de qui le demande. Pas le nôtre. '
            + 'Chacun de nos devis est établi sur cette grille : un forfait de départ, la distance '
            + 'routière, le poids, et un plancher sous les petites courses.',
        columns: {
            vehicle: 'Véhicule',
            payload: 'Charge utile',
            base: 'Forfait',
            perKm: 'Au km',
            perKg: 'Au kg',
            minimum: 'Minimum',
        },
        rows: [
            { vehicle: 'Fourgon léger', payload: 'Jusqu’à 1 t', base: '8 000', perKm: '700', perKg: '8', minimum: '15 000' },
            { vehicle: 'Camion moyen', payload: '1 – 8 t', base: '18 000', perKm: '900', perKg: '6', minimum: '40 000' },
            { vehicle: 'Gros porteur', payload: '8 – 12 t', base: '60 000', perKm: '1 500', perKg: '3,5', minimum: '120 000' },
        ],
        unitNote: 'Montants en RWF. Le véhicule est choisi d’après le poids que vous indiquez, vous n’avez donc pas à savoir lequel il faut.',
        examplesTitle: 'Ce que cela donne',
        examples: [
            { job: '400 kg, de Nyabugogo à Kimironko', detail: '15 km par la route', price: '25 700' },
            { job: '3 tonnes, dix kilomètres en ville', detail: '16 km par la route', price: '57 900' },
            { job: '4 tonnes, de Kigali à Rubavu', detail: '157 km par la route', price: '231 400' },
        ],
        notesTitle: 'Ce qui fait bouger le prix',
        notes: [
            { title: 'La distance se mesure par la route', body: 'Pas à vol d’oiseau sur la carte. Au-delà de 25 km, le tarif au kilomètre baisse pour le reste du trajet : un kilomètre de grand axe ne coûte pas ce que coûte un kilomètre en ville.' },
            { title: 'La première heure d’attente est offerte', body: 'Ensuite, le temps de chargement et de déchargement est facturé à l’heure : 3 800 RWF pour un fourgon, 8 500 pour un camion, 19 400 pour un gros porteur. Une remise normale n’y arrive jamais.' },
            { title: 'Plus lourd et plus loin, sur devis', body: 'Au-delà de 12 tonnes, et pour tout passage de frontière, le prix est établi à la main plutôt que sur cette grille. Dites-nous de quoi il s’agit et nous revenons vers vous avec un chiffre.' },
        ],
        closing:
            'Ce sont des exemples chiffrés, pas un devis. Le formulaire calcule le prix de votre '
            + 'course avant tout engagement, et un régulateur le confirme une fois l’enlèvement et '
            + 'la livraison pointés sur la carte.',
        cta: 'Obtenir un devis',
    },
    explore: {
        eyebrow: 'Pour aller plus loin',
        headline: 'Le reste',
        items: [
            { title: 'Tarifs', body: 'La grille complète : forfait de départ, au kilomètre, au kilogramme, plus trois courses réelles chiffrées de bout en bout.', cta: 'Voir les prix' },
            { title: 'Entreprises', body: 'Lignes régulières et lots complets, tarifés à la ligne plutôt qu’à la course, sur un seul compte.', cta: 'Lignes régulières' },
            { title: 'Comment ça marche', body: 'De la commande à la signature, étape par étape, et ce que voient le chauffeur, le régulateur et vous.', cta: 'Du début à la fin' },
            { title: 'Questions fréquentes', body: 'Responsabilité, paiement, délais d’enlèvement, et ce que nous ne transportons pas.', cta: 'Lire les réponses' },
        ],
    },
    journey: {
        eyebrow: 'Du début à la fin',
        headline: 'Ce qui arrive à votre chargement',
        stops: [
            { name: 'Vous passez commande', body: 'Enlèvement, destination, nature de la marchandise. Sans compte, sans appel, et avec un prix avant tout engagement, jusqu’à douze tonnes. Au-delà, nous établissons le devis à la main.' },
            { name: 'Un régulateur la prend en charge', body: 'Chaque commande est confiée à un chauffeur par une personne, qui vous appelle en cas de doute. Rien ici ne s’expédie tout seul. Aucune marchandise ne part chez un chauffeur parce qu’une machine en a décidé ainsi.' },
            { name: 'Un chauffeur la prend', body: 'Un chauffeur vérifié, choisi parmi les plus proches disponibles. Son permis et l’assurance de son véhicule doivent être validés et encore valables, sinon le système refuse purement et simplement d’inscrire votre marchandise sur sa feuille de route.' },
            { name: 'Vous la suivez', body: 'Votre code indique l’étape atteinte par votre marchandise : reçue, attribuée, enlevée, livrée. Il donne aussi le prénom du chauffeur qui la transporte. Actualisez autant que vous voulez.' },
            { name: 'Signée à la porte', body: 'Preuve prise à la remise et horodatée, soit une photo, soit un code relu par la personne qui a réceptionné. Dans les deux cas la livraison est consignée, pas seulement mémorisée.' },
        ],
    },
    about: {
        eyebrow: 'Le système',
        headline: 'Tout le monde regarde le même dossier',
        intro:
            'La plupart des transporteurs fonctionnent au téléphone et au carnet : ce qu’on vous dit dépend ' +
            'de qui vous demandez et de sa dernière vérification. Inzira est un seul système. Le téléphone du ' +
            'chauffeur, l’écran du régulateur et votre page de suivi sont trois vues de la même expédition, ' +
            'et elles se mettent à jour ensemble.',
        views: [
            { title: 'Ce que vous voyez', body: 'Commandez avec un nom et un numéro, sans compte. Vous recevez un code indiquant l’étape où en est votre marchandise, son lieu d’enlèvement et sa destination, le prénom du chauffeur une fois assigné, et la preuve prise à la remise, soit une photo, soit un code relu par la personne qui a réceptionné.' },
            { title: 'Ce que porte le chauffeur', body: 'Une application ne contenant que ses propres courses. Elle transmet la position du véhicule pendant le service, prend la preuve à la porte et signale pannes et dommages depuis le bord de la route. Dans un coin de la ville sans réseau, elle garde la confirmation jusqu’au retour de la connexion. Elle déplace aussi la photo hors du cache de l’appareil photo vers son propre stockage, pour que le téléphone ne puisse pas effacer discrètement votre preuve de livraison pendant l’attente.' },
            { title: 'Ce que surveille la régulation', body: 'Tous les véhicules en service sur une carte en direct, avec des zones réglementées et des limitations de vitesse qui déclenchent une alerte dès qu’un véhicule y entre ou roule trop vite pour la route. Les commandes sont attribuées par une personne, et la course est proposée à un chauffeur nommément désigné que le système a classé comme le plus proche. Elle n’est jamais diffusée au premier qui répond.' },
        ],
        closing:
            'Rien de tout cela ne se voit de l’extérieur, et c’est bien l’intérêt : c’est pourquoi le code ' +
            'que nous vous envoyons peut être cru sur parole.',
    },
    business: {
        eyebrow: 'Pour les entreprises',
        headline: 'Du fret que vous n’avez pas à commander chaque matin',
        intro:
            'Une livraison ponctuelle se commande avec le formulaire ci-dessus. Acheminer la même '
            + 'chose sur la même route chaque semaine est un autre arrangement, et cela ne devrait '
            + 'pas se tarifer comme l’appel d’un inconnu.',
        offers: [
            { name: 'Lignes régulières', body: 'Une liaison entre deux points fixes, selon un calendrier que vous fixez. Convenue une fois, puis elle roule, et elle se tarife au volume plutôt qu’à la course.' },
            { name: 'Lots complets', body: 'Des mouvements réguliers en véhicule complet, y compris les trajets au départ de Kigali. Tarifés à la ligne une fois connus le poids, la fréquence et la route.' },
            { name: 'Un compte, un registre', body: 'Chaque expédition du compte réunie au même endroit plutôt qu’éparpillée entre les reçus des chauffeurs, avec son code de suivi et sa photo de livraison rattachés à la ligne correspondante. Le paiement reste à la course, par mobile money, pour l’instant.' },
        ],
        closing:
            'Dites-nous la forme que cela prend : ce qui circule, à quelle fréquence et entre quels '
            + 'points. Nous revenons vers vous avec un tarif pour la ligne.',
        cta: 'Parlons de votre ligne',
    },
    faq: {
        eyebrow: 'Avant de commander',
        headline: 'Les questions à poser d’abord',
        items: [
            {
                q: 'Que se passe-t-il si ma marchandise est endommagée ou perdue ?',
                a: 'Nous sommes transporteur et non assureur : nous ne couvrons pas la valeur de ce que nous transportons. L’assurance de la marchandise revient à l’expéditeur, et pour tout ce qui a de la valeur, elle s’impose. Ce dont nous répondons, c’est de la preuve : une photo à la remise, un scellé inviolable sur les envois sécurisés, et un rapport d’incident rédigé depuis le bord de la route plutôt que reconstitué après coup. En cas de problème, vous saurez ce qui s’est passé, quand, et qui transportait.',
            },
            {
                q: 'Qui conduit ma marchandise ?',
                a: 'Un chauffeur dont nous avons vérifié le permis et l’identité, dans un véhicule dont nous avons vérifié l’assurance et le contrôle technique. Ce n’est pas une promesse sur nos recrutements. C’est un verrou dans le système. Si une attestation d’assurance expire dans la nuit, le lendemain matin le système refuse simplement de confier de la marchandise à ce chauffeur tant qu’elle n’est pas renouvelée, et il nous prévient trois semaines avant toute échéance, si bien que cela arrive rarement.',
            },
            {
                q: 'Comment payer ?',
                a: 'Par mobile money, à la course, une fois le prix confirmé par un régulateur. Aucune carte à saisir, rien à configurer à l’avance.',
            },
            {
                q: 'Faut-il un compte ?',
                a: 'Non. Un nom et un numéro de téléphone suffisent. Le code de suivi arrive par SMS et c’est tout ce qu’il faut pour suivre la marchandise. Rien où se connecter, aucun mot de passe à perdre.',
            },
            {
                q: 'Le prix affiché est-il ferme ?',
                a: 'Le montant indiqué au formulaire est calculé sur le seul poids tant que l’enlèvement et la livraison ne sont pas pointés sur la carte ; il est ensuite établi sur la distance routière réelle. Un régulateur le confirme avant tout départ. Seul le temps d’attente peut s’y ajouter ensuite, et uniquement au-delà de la première heure offerte.',
            },
            {
                q: 'Y a-t-il des marchandises que vous ne prenez pas ?',
                a: 'Le formulaire de commande énumère les types que nous traitons. Si ce que vous expédiez n’y figure pas, posez la question avant de commander plutôt qu’après : la conversation est courte et vaut mieux au départ.',
            },
            {
                q: 'Sous quel délai l’enlèvement a-t-il lieu ?',
                a: 'Vous pouvez commander à n’importe quelle heure. La prise de commande ne ferme jamais. Une course du jour passée avant midi part généralement dans l’heure. Au-delà, ou pour un chargement complet quittant la ville, l’organisation se règle avec vous lorsque le régulateur appelle pour confirmer, et cet appel a lieu entre six heures du matin et dix heures du soir.',
            },
        ],
        closing: 'Pour tout ce qui n’est pas traité ici, demandez-nous. Le téléphone est décroché de six heures du matin à dix heures du soir, tous les jours.',
    },
    contact: {
        eyebrow: 'Parlez-nous',
        headline: 'Dites-nous ce que vous transportez',
        body:
            'Une ligne à tarifer, un chargement que notre grille tarifaire ne couvre pas, ou une '
            + 'question avant de commander. Vous joignez une personne, pas une file d’attente, '
            + 'et nous répondons le jour ouvré même.',
        address: 'Zone industrielle de Gikondo \u00b7 Kigali',
        hoursTitle: 'Nos horaires',
        hours: [
            { label: 'Commande et suivi', time: 'À toute heure, tous les jours', note: 'Le site enregistre les commandes, trouve le chauffeur et vous indique où en est votre marchandise, à n’importe quelle heure, tous les jours de l’année. Rien ici ne ferme.' },
            { label: 'Assistance', time: '6h \u2013 22h, tous les jours', note: 'Une personne au téléphone, du premier chargement du matin à la dernière livraison en retard.' },
            { label: 'Comptes entreprises', time: 'Du lundi au vendredi, 8h \u2013 17h', note: 'Lignes régulières, lots complets et tout ce qui se règle sur compte.' },
        ],
    },

    order: {
        waitingNotice: 'Si le chargement ou le déchargement retient le chauffeur plus de {minutes} minutes, le temps supplémentaire est facturé {rate} RWF de l\'heure. Rien n\'est ajouté pour une remise normale.',
        detention: 'Temps d\'attente',
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
        neededBy: 'Pour quand ? (facultatif)',
        instructions: 'À signaler au chauffeur (facultatif)',
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
        kmToRun: '{km} km restants',
        eta: 'Arrivée dans {minutes} min',
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
        titleOrder: 'Commander une livraison',
        titleTrack: 'Suivre une expédition',
        titlePrivacy: 'Politique de confidentialité',
        titleSupport: 'Assistance',
        titlePricing: 'Tarifs',
        titleHow: 'Comment ça marche',
        titleBusiness: 'Entreprises',
        titleFaq: 'Questions fréquentes',
        descOrder: 'Commandez du fret à Kigali et dans tout le pays en moins d’une minute. Enlèvement, destination et nature de la marchandise. Tarifé sur une grille publiée, sans compte, avec un code de suivi par SMS dès la commande passée.',
        descTrack: 'Saisissez le code reçu par SMS pour voir à quelle étape en est votre expédition Inzira, qui la conduit, et la photo prise à la remise.',
        descPrivacy: 'Ce que le site Inzira et l’application Inzira Driver collectent, pourquoi, avec qui c’est partagé, et comment demander vos données.',
        descSupport: 'Aide pour une livraison ou pour l’application Inzira Driver. Téléphone, e-mail, et réponses aux problèmes les plus courants des chauffeurs.',
        descPricing: 'Ce que coûte le fret à Kigali et dans tout le Rwanda, publié en entier : forfait, au kilomètre et au kilogramme pour fourgons, camions et gros porteurs, avec des exemples chiffrés.',
        descHow: 'Ce qui arrive à votre marchandise, de la commande à la signature à la porte, et ce que voient le chauffeur, le régulateur et vous pendant le trajet.',
        descBusiness: 'Lignes régulières et lots complets pour les entreprises qui expédient régulièrement à Kigali et au Rwanda, tarifés à la ligne plutôt qu’à la livraison.',
        descFaq: 'Responsabilité, paiement, délais d’enlèvement et ce que nous ne transportons pas. Les questions à poser avant de commander du fret chez Inzira.',
        descDefault: 'Fret le jour même et en vrac à Kigali et dans tout le Rwanda, à grille tarifaire publiée. Commandez en moins d’une minute sans compte, puis suivez votre marchandise de l’enlèvement à la signature avec un code de suivi.',
    },

    coming: {
        theWay: 'la voie',
        openingPrefix: 'Ouverture',
        headlineTop: 'Du fret dans tout Kigali,',
        headlineBottom: 'sans rien cacher.',
        body:
            'Nous construisons un service de fret où celui qui a expédié la marchandise peut ' +
            'la suivre d’un bout à l’autre. Pas encore ouvert au public : ' +
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
        WEIGHT_NEEDS_QUOTE: 'Ce chargement dépasse ce que nous pouvons tarifer en ligne. Parlez-nous-en et nous reviendrons avec un prix.',
        ORDER_CREATE_FAILED: 'Nous n’avons pas pu enregistrer votre commande pour le moment. Merci de réessayer.',
        TRACK_FAILED: 'Nous n’avons pas pu effectuer cette recherche pour le moment. Merci de réessayer.',
        CONTACT_FAILED: 'Nous n’avons pas pu envoyer votre message pour le moment. Merci de réessayer.',
        TOKEN_COLLISION: 'Un problème est survenu lors de la génération de votre code de suivi. Merci de réessayer.',
        UNREADABLE: 'Le serveur a renvoyé une réponse illisible. Merci de réessayer.',
        GENERIC: 'Une erreur est survenue. Merci de réessayer.',
    },

    steps: {
        heading: 'Que transportons-nous ?',
        cargo: 'Marchandise',
        contact: 'Contact',
        check: 'Vérification',
        continue: 'Continuer',
        keepCode: 'Gardez ce code.',
        keepCodeBody: 'C’est ainsi que vous suivrez l’avancement de votre marchandise. Un régulateur vérifie les détails et vous appellera si quelque chose doit être confirmé.',
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
        thanks: 'Merci. Nous vous enverrons un SMS le jour de l’ouverture.',
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
        bookBody: 'Enlèvement, destination, ce que vous envoyez. Il suffit d’un nom et d’un numéro de téléphone, et aucun compte à créer.',
        trackTitle: 'Déjà envoyé quelque chose ?',
        trackBody: 'Saisissez ici le code reçu par SMS pour voir où votre marchandise est arrivée.',
    },

    entries: {
        bookTitle: 'Commander une livraison',
        bookBody: 'En moins d’une minute, sans compte.',
        trackTitle: 'Suivre une expédition',
        trackBody: 'Voyez l’étape atteinte.',
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
