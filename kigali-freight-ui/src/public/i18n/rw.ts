import type { PartialStrings } from './en';

// ─────────────────────────────────────────────────────────────────────
//  KINYARWANDA — DRAFT, NEEDS A NATIVE SPEAKER'S REVIEW BEFORE LAUNCH.
//
//  Written by an AI assistant that does not speak Kinyarwanda natively.
//  The interface vocabulary here is conventional and low-risk, but noun
//  classes, verb agreement and register are exactly where this kind of
//  draft gives itself away — and awkward Kinyarwanda on a Rwandan
//  company's own site costs more credibility than English-only would.
//
//  Everything is plain text in one file on purpose: correcting it needs
//  no programming, only the right words. Change the right-hand side of
//  any line and nothing else.
//
//  A few choices worth a second opinion in particular:
//    · "Mu nzira" for a consignment in progress — literally "on the way",
//      which plays on the company name. Deliberate, but a reviewer should
//      decide whether it reads as clever or as confusing.
//    · "Icyifuzo" for an order, following the usage familiar from
//      government e-services, rather than a loanword.
//    · "Ubwikorezi" for freight/carriage throughout — check it is the
//      term the trade actually uses in Kigali rather than the dictionary
//      one.
//    · "Amazina" rather than "Izina" for the name field, matching how
//      Rwandan forms usually ask for it.
//
//  STILL TO WRITE: the landing-page prose — hero, services, journey,
//  about, contact. Those keys are absent from this file on purpose and
//  fall back to English until someone writes them. They are not
//  translation work: rendering "Most freight goes quiet the moment it
//  leaves your gate" needs writing in Kinyarwanda, not translating from
//  English, and a literal rendering would read as flat as it sounds.
//  Copy the shape from en.ts, keep the keys, replace the words.
// ─────────────────────────────────────────────────────────────────────

export const rw: PartialStrings = {
    nav: {
        whatWeMove: 'Ibyo dutwara',
        howItWorks: 'Uko bikora',
        theSystem: 'Sisitemu',
        talkToUs: 'Twandikire',
        home: 'Ahabanza ha Inzira',
    },
    actions: {
        book: 'Saba ubwikorezi',
        track: 'Kurikirana umuzigo',
        trackSubmit: 'Kurikirana',
        looking: 'Turashakisha…',
        placing: 'Turimo kohereza…',
        placeOrder: 'Ohereza icyifuzo',
        showMeAround: 'Nyereka uko bikora',
        standingRoutes: 'Inzira zihoraho',
        staffSignIn: 'Injira nk’umukozi',
        support: 'Ubufasha',
        privacy: 'Ibanga ry’amakuru',
        skipToContent: 'Simbukira ku bikubiyemo',
        bookInstead: 'Saba ubwikorezi →',
    },
    track: {
        title: 'Uri he?',
        eyebrow: 'Gukurikirana',
        codeLabel: 'Kode yo gukurikirana',
        finding: 'Turashakisha umuzigo wawe',
        collectFrom: 'Aho bifatirwa',
        deliverTo: 'Aho bijyanwa',
        driver: 'Umushoferi',
        placed: 'Byasabwe',
        statusInProgress: 'Mu nzira',
        statusDelivered: 'Byagejejwe',
        statusCancelled: 'Byahagaritswe',
        proofTitle: 'Icyemezo cyo kugeza',
        notYet: 'Ntibiraba',
        milestones: {
            received: 'Icyifuzo cyakiriwe',
            receivedNote: 'Kiri ku mugenzuzi kugira ngo agisuzume.',
            assigned: 'Umushoferi yatoranyijwe',
            assignedNote: 'Kiri ku rutonde rw’umushoferi.',
            collected: 'Byatowe',
            collectedNote: 'Umuzigo uri mu modoka.',
            delivered: 'Byagejejwe',
            deliveredNote: 'Byakiriwe, hamwe n’ifoto y’ikimenyetso.',
        },
    },
    form: {
        name: 'Amazina',
        phone: 'Telefone',
        emailOptional: 'Imeyili — si itegeko',
        whatMoved: 'Ni iki ushaka gutwarwa?',
        messageReceived: 'Ubutumwa bwakiriwe.',
        weAnswer: 'Tuzagusubiza kuri nimero watanze, akenshi kuri uwo munsi.',
    },
    footer: {
        getMoving: 'Tangira',
        company: 'Ikigo',
        tagline: 'Ubwikorezi mu Kigali, aho umuzigo wawe ugeze bigaragarira uwawohereje.',
    },
    language: {
        label: 'Ururimi',
        english: 'Icyongereza',
        kinyarwanda: 'Ikinyarwanda',
    },
};
