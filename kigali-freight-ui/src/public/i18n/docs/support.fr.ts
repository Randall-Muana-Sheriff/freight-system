import type { SupportDoc } from './support.en';

// French support page. Register is the same as the English: plain,
// instructional, addressed to a driver who is standing next to a truck
// with a problem — not to a reader of a manual.
export const supportFr: SupportDoc = {
    eyebrow: 'Aide',
    title: 'Assistance',
    intro:
        'Un problème avec une livraison, ou avec l’application Inzira Driver ? Contactez-nous ' +
        'directement — aux heures ouvrables le téléphone est plus rapide que l’e-mail, et si la ' +
        'marchandise est en route, appelez.',
    phoneLabel: 'Téléphone',
    emailLabel: 'E-mail',
    drivers: {
        title: 'Chauffeurs',
        intro:
            'Les comptes sont créés par la régulation — il n’y a pas d’inscription dans ' +
            'l’application. Si votre numéro n’est pas reconnu, c’est qu’il n’a pas encore été ' +
            'enregistré, et la régulation peut le faire en un instant.',
        answers: [
            {
                problem: 'Le code de vérification n’arrive jamais',
                body:
                    'Les codes sont envoyés par SMS et peuvent mettre une minute sur un réseau ' +
                    'chargé. Vérifiez que le numéro saisi est bien celui enregistré par la ' +
                    'régulation, puis demandez un nouveau code. Si rien n’arrive après deux ' +
                    'tentatives, appelez-nous et nous vous le dicterons.',
            },
            {
                problem: 'J’ai oublié mon code PIN',
                body:
                    'Appelez la régulation. Elle peut le réinitialiser, et l’application vous ' +
                    'guidera pour en choisir un nouveau à la prochaine connexion.',
            },
            {
                problem: 'La régulation dit ne pas voir où je suis',
                body:
                    'La position n’est transmise que pendant un service actif : vérifiez que ' +
                    'l’écran d’accueil indique bien que vous êtes en service. Si c’est le cas, ' +
                    'ouvrez les réglages de votre téléphone pour Inzira Driver et assurez-vous ' +
                    'que l’autorisation de localisation est sur Toujours — « Lorsque l’app est ' +
                    'active » cesse de transmettre dès que l’écran se verrouille, c’est-à-dire ' +
                    'la majeure partie d’une journée de conduite.',
            },
            {
                problem: 'Je n’arrive pas à envoyer la photo de livraison',
                body:
                    'La photo a besoin d’une connexion de données pour parvenir au bureau. Dans ' +
                    'une zone mal couverte, terminez l’arrêt une fois reparti — la course reste ' +
                    'sur votre liste jusqu’à ce que l’envoi passe.',
            },
            {
                problem: 'L’application dit que mes documents posent problème',
                body:
                    'L’un de vos permis, assurances ou certificats de contrôle technique est ' +
                    'manquant, refusé ou expiré, et aucune course ne peut vous être attribuée ' +
                    'avant validation. L’écran Profil indique lequel. Photographiez à nouveau le ' +
                    'document sous un bon éclairage et renvoyez-le.',
            },
        ],
    },
    customers: {
        title: 'Clients',
        bodyBefore: 'Si vous attendez une expédition, le code de suivi reçu par SMS indique où elle en est sur notre ',
        trackingLink: 'page de suivi',
        bodyAfter: '. Si le code ne fonctionne pas, ou si la livraison a du retard, appelez le numéro ci-dessus avec le code sous les yeux.',
    },
    data: {
        title: 'Vos données',
        bodyBefore: 'Ce que nous collectons, pourquoi, et comment en demander une copie ou la suppression est détaillé dans notre ',
        privacyLink: 'politique de confidentialité',
        bodyAfter: '.',
    },
};
