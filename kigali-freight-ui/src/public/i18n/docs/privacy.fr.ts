import type { PrivacyDoc } from './privacy.en';

// French privacy policy.
//
// governingNote carries the line the English does not need: a translated
// legal document should say which version governs, or a discrepancy
// between the two becomes an argument instead of a typo.
export const privacyFr: PrivacyDoc = {
    eyebrow: 'Mentions légales',
    title: 'Politique de confidentialité',
    updatedPrefix: 'Dernière mise à jour',
    updated: '17 août 2026',
    governingNote:
        'Cette traduction est fournie pour votre confort. En cas de divergence, la version ' +
        'anglaise fait foi.',
    intro:
        'Inzira transporte du fret dans Kigali. Cette politique couvre à la fois le site que ' +
        'vous consultez et l’application mobile Inzira Driver utilisée par nos chauffeurs. ' +
        'Les deux collectent des choses différentes auprès de personnes différentes, et sont ' +
        'donc décrits séparément.',
    driverApp: {
        title: 'L’application chauffeur',
        intro:
            'Inzira Driver est un outil de travail, remis aux chauffeurs qui transportent du ' +
            'fret pour nous. Les comptes sont créés par notre équipe de régulation — il n’y a ' +
            'pas d’inscription publique — et l’application collecte les éléments suivants ' +
            'pendant son utilisation.',
        sharedWithLabel: 'Partagé avec :',
        rows: [
            { what: 'Localisation', why: 'Latitude, longitude et vitesse, afin que la régulation sache où se trouve une expédition et puisse le dire au client qui l’attend. Collectée uniquement entre le début et la fin d’un service, y compris lorsque l’application est en arrière-plan ou le téléphone verrouillé, car une livraison ne s’interrompt pas quand un chauffeur range son téléphone. Terminer un service ou se déconnecter arrête immédiatement la collecte.', shared: 'notre équipe de régulation uniquement' },
            { what: 'Identité', why: 'Nom et numéro de téléphone, qui sert également d’identifiant. Le code PIN n’est conservé que sous forme d’empreinte à sens unique et ne peut être relu par personne, nous compris.', shared: 'notre équipe de régulation uniquement' },
            { what: 'Documents réglementaires', why: 'Photographies des permis, assurances et certificats de contrôle technique qu’un chauffeur est légalement tenu de détenir, vérifiés par un administrateur avant que du fret ne lui soit confié.', shared: 'nos vérificateurs de conformité uniquement' },
            { what: 'Photos de livraison', why: 'Une photographie prise au moment de la remise comme preuve de livraison, rattachée à l’expédition concernée.', shared: 'notre équipe de régulation, et le client pour sa propre expédition' },
            { what: 'Diagnostics', why: 'Rapports de plantage et traces d’erreur, afin de repérer et corriger les défauts.', shared: 'Sentry, notre prestataire de supervision des erreurs' },
        ],
        biometricsStrong: 'Face ID, Touch ID et le déverrouillage par empreinte ne quittent jamais le téléphone.',
        biometricsRest:
            ' L’application demande à l’appareil de confirmer que c’est bien vous et ne reçoit ' +
            'qu’un oui ou un non. Aucune donnée biométrique ne nous est transmise, et aucune ' +
            'n’est conservée sur nos systèmes.',
        closing:
            'La localisation n’est pas collectée lorsqu’un chauffeur n’est pas en service. Elle ' +
            'n’est jamais vendue, jamais utilisée à des fins publicitaires, et jamais partagée ' +
            'en dehors de l’équipe de régulation qui coordonne le travail de ce chauffeur.',
    },
    customers: {
        title: 'Si vous commandez une livraison',
        body:
            'La commande sur ce site demande votre nom, un numéro de téléphone, éventuellement ' +
            'une adresse e-mail, ainsi que les adresses d’enlèvement et de livraison. Nous les ' +
            'utilisons pour effectuer la livraison et pour vous joindre à son sujet — le code ' +
            'de suivi envoyé par SMS, et un appel si le chauffeur ne trouve pas l’adresse.',
        body2:
            'Toute personne détenant le code de suivi peut voir l’avancement de cette ' +
            'expédition et le prénom de son chauffeur. Le code est la clé : traitez-le comme ' +
            'n’importe quelle autre référence d’un envoi qui vous est destiné.',
    },
    retention: {
        title: 'Durée de conservation',
        body:
            'Les dossiers d’expédition, photos de livraison comprises, sont conservés tant ' +
            'qu’ils peuvent servir à traiter une question ou une réclamation concernant cette ' +
            'livraison. L’historique de localisation des chauffeurs est une donnée ' +
            'opérationnelle, conservée uniquement le temps qu’elle reste utile à la ' +
            'coordination et à l’analyse du travail.',
    },
    rights: {
        title: 'Vos choix',
        body:
            'Vous pouvez nous demander ce que nous détenons à votre sujet, en demander la ' +
            'rectification ou la suppression, et nous y donnerons suite sauf obligation de ' +
            'conservation — par exemple les documents réglementaires qu’un transporteur agréé ' +
            'doit conserver.',
        body2:
            'Les chauffeurs peuvent révoquer l’accès à la localisation à tout moment dans les ' +
            'réglages de leur téléphone. Cela arrête la collecte, mais empêche aussi la ' +
            'régulation d’attribuer le travail de façon fiable : mieux vaut en parler d’abord ' +
            'avec le bureau.',
    },
    contact: {
        title: 'Contact',
        bodyBefore: 'Toute question sur cette politique, ou toute demande d’accès, de rectification ou de suppression de vos données, peut être adressée à ',
        bodyMiddle: ' ou au ',
        bodyAfter: '.',
        postal: 'Par courrier : Inzira, Zone industrielle de Gikondo, Kigali, Rwanda. Les chauffeurs peuvent également s’adresser directement à la régulation pour toute question sur leurs propres données. Notre ',
        supportLink: 'page d’assistance',
        postalAfter: ' couvre tout le reste.',
    },
};
