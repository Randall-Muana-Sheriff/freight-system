import { describe, expect, it } from '@jest/globals';
import { toDriverAssignmentCard } from './assignments';

const order = {
    id: 7,
    cargo_description: 'Cement bags',
    status: 'ASSIGNED',
    priority: 'normal' as const,
    origin_hub_name: 'Nyabugogo',
    delivery_address_text: 'Kimironko',
};

describe('pay on an assignment card', () => {
    it('carries the driver net through as a number', () => {
        // Postgres NUMERIC comes back from pg as a string, so a card that
        // passed it straight through would render "14650.00" and, worse,
        // would not survive toLocaleString grouping.
        const card = toDriverAssignmentCard({ ...order, driver_net_rwf: '14650.00', price_is_estimate: false });
        expect(card.payRwf).toBe(14650);
        expect(card.payIsEstimate).toBe(false);
    });

    it('marks pay as an estimate when the job has not been placed yet', () => {
        const card = toDriverAssignmentCard({ ...order, driver_net_rwf: 9350, price_is_estimate: true });
        expect(card.payRwf).toBe(9350);
        expect(card.payIsEstimate).toBe(true);
    });

    it('reports no pay rather than zero when a job has not been priced', () => {
        // Zero would render as "0 RWF to you", which reads as an offer of
        // nothing rather than as an absent figure.
        expect(toDriverAssignmentCard(order).payRwf).toBeNull();
        expect(toDriverAssignmentCard({ ...order, driver_net_rwf: null }).payRwf).toBeNull();
    });

    it('treats a missing estimate flag as a firm price, not an estimate', () => {
        // An older build of the API omits the field entirely. Saying "About"
        // over a price that is actually settled is the safer way round than
        // presenting a provisional one as final.
        expect(toDriverAssignmentCard({ ...order, driver_net_rwf: 100 }).payIsEstimate).toBe(false);
    });
});

describe('offers on the board', () => {
    it('marks a job the driver has not agreed to yet', () => {
        expect(toDriverAssignmentCard({ ...order, status: 'OFFERED' }).isOffer).toBe(true);
    });

    it('does not mark work already assigned as an offer', () => {
        // The whole distinction: a driver planning their day must not mistake
        // an offer for a job that is already theirs.
        for (const status of ['ASSIGNED', 'AT_PICKUP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED']) {
            expect(toDriverAssignmentCard({ ...order, status }).isOffer).toBe(false);
        }
    });

    it('reads the status case-insensitively, like everything else here', () => {
        expect(toDriverAssignmentCard({ ...order, status: 'offered' }).isOffer).toBe(true);
    });
});
