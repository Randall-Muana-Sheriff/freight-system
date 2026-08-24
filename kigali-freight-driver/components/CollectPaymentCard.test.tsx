import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { CollectPaymentCard } from './CollectPaymentCard';
import type { OrderDetail } from '../lib/api';

const mockRequestMomo = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockFetchStatus = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockRecordCash = jest.fn<(...a: unknown[]) => Promise<unknown>>();

jest.mock('../lib/api', () => ({
    requestMomoPayment: (...a: unknown[]) => mockRequestMomo(...a),
    fetchPaymentStatus: (...a: unknown[]) => mockFetchStatus(...a),
    recordCashPayment: (...a: unknown[]) => mockRecordCash(...a),
}));

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
    id: 42,
    status: 'ARRIVED',
    payment_status: 'UNPAID',
    price_total: 12000,
    currency: 'RWF',
    price_is_estimate: false,
    ...over,
} as OrderDetail);

// Confirms the destructive/committing dialog by pressing its non-cancel button.
const autoConfirm = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
    });

describe('CollectPaymentCard', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        mockRequestMomo.mockReset().mockResolvedValue({ reference: 'r1', reused: false, amount: 12000, message: 'Prompt sent. Ask the customer to enter their MoMo PIN.' });
        mockFetchStatus.mockReset().mockResolvedValue({ paymentStatus: 'PENDING', attempt: { reference: 'r1', status: 'PENDING', amount: 12000, currency: 'RWF', payer: '0788…', failureReason: null, requestedAt: '' } });
        mockRecordCash.mockReset().mockResolvedValue({ orderId: 42, amount: 12000, currency: 'RWF', platformFeeOwed: 1800, method: 'CASH', message: 'Cash recorded. 1800 RWF commission to hand in.' });
    });

    it('shows what to ask the customer for', async () => {
        await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);
        expect(screen.getByText('12,000 RWF')).toBeTruthy();
        expect(screen.getByLabelText('Ask for mobile money')).toBeTruthy();
        expect(screen.getByLabelText('Record cash taken')).toBeTruthy();
    });

    // The trap that printed "1496 null" at a driver on its first real run.
    describe('a price with no currency', () => {
        it('never renders the word null beside the amount', async () => {
            await render(<CollectPaymentCard order={order({ price_total: 1496, currency: null })} token="t" onSettled={() => {}} />);
            expect(screen.getByText('1,496')).toBeTruthy();
            expect(screen.queryByText(/null/i)).toBeNull();
        });

        // Cash is the fallback for exactly the jobs where something is
        // missing, so blocking both would strand the driver.
        it('blocks mobile money but still lets cash be recorded', async () => {
            await render(<CollectPaymentCard order={order({ currency: null })} token="t" onSettled={() => {}} />);
            expect(screen.queryByLabelText('Ask for mobile money')).toBeNull();
            expect(screen.getByLabelText('Record cash taken')).toBeTruthy();
            expect(screen.getByText(/cash can still be recorded/i)).toBeTruthy();
        });
    });

    it('offers nothing to charge against an estimate, and says why', async () => {
        await render(<CollectPaymentCard order={order({ price_is_estimate: true })} token="t" onSettled={() => {}} />);
        expect(screen.getByText(/estimate, not a final price/i)).toBeTruthy();
        expect(screen.queryByLabelText('Ask for mobile money')).toBeNull();
        expect(screen.queryByLabelText('Record cash taken')).toBeNull();
    });

    it('shows a paid job as settled, with no way to charge twice', async () => {
        await render(<CollectPaymentCard order={order({ payment_status: 'PAID', payment_method: 'MOMO' })} token="t" onSettled={() => {}} />);
        expect(screen.getByText('Paid by mobile money')).toBeTruthy();
        expect(screen.queryByLabelText('Ask for mobile money')).toBeNull();
    });

    // Recording money is a commitment, so it asks first.
    it('will not record cash on a single tap', async () => {
        const alert = autoConfirm();
        alert.mockImplementation(() => {});
        await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);

        await fireEvent.press(screen.getByLabelText('Record cash taken'));

        expect(mockRecordCash).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();
    });

    it('records the cash once confirmed and repeats what is owed back', async () => {
        autoConfirm();
        const onSettled = jest.fn();
        await render(<CollectPaymentCard order={order()} token="t" onSettled={onSettled} />);

        await fireEvent.press(screen.getByLabelText('Record cash taken'));

        await waitFor(() => expect(mockRecordCash).toHaveBeenCalledWith('t', 42));
        await waitFor(() => expect(screen.getByText(/commission to hand in/i)).toBeTruthy());
        expect(onSettled).toHaveBeenCalled();
    });

    describe('mobile money', () => {
        it('sends the prompt and then waits for the customer', async () => {
            await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);

            await fireEvent.press(screen.getByLabelText('Ask for mobile money'));

            await waitFor(() => expect(mockRequestMomo).toHaveBeenCalledWith('t', 42, undefined));
            await waitFor(() => expect(screen.getByText(/enter their MoMo PIN/i)).toBeTruthy());
            await waitFor(() => expect(screen.getByText(/Waiting for the customer/i)).toBeTruthy());
        });

        // The ordinary case, not an exception: they booked on Airtel and are
        // holding an MTN handset. A dead end here means cash or nothing.
        it('offers another number when the one on file is the wrong network', async () => {
            mockRequestMomo.mockRejectedValueOnce(Object.assign(
                new Error('07… is not an MTN number, so it cannot receive a MoMo prompt.'),
                { status: 400, code: 'PAYMENT_WRONG_NETWORK' },
            ));
            await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);

            await fireEvent.press(screen.getByLabelText('Ask for mobile money'));

            const input = await screen.findByLabelText("Customer's MTN number");
            await fireEvent.changeText(input, '0788123456');
            await fireEvent.press(screen.getByLabelText('Send the prompt to that number'));

            await waitFor(() => expect(mockRequestMomo).toHaveBeenLastCalledWith('t', 42, '0788123456'));
        });

        it('does not offer another number for a refusal a number cannot fix', async () => {
            mockRequestMomo.mockRejectedValueOnce(Object.assign(
                new Error('Mobile money is not set up on this server.'),
                { status: 503, code: 'PAYMENTS_NOT_CONFIGURED' },
            ));
            await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);

            await fireEvent.press(screen.getByLabelText('Ask for mobile money'));

            await waitFor(() => expect(screen.getByText(/not set up on this server/i)).toBeTruthy());
            expect(screen.queryByLabelText("Customer's MTN number")).toBeNull();
            // Cash is still there, which is what that message tells them to do.
            expect(screen.getByLabelText('Record cash taken')).toBeTruthy();
        });

        it('tells the parent to reload once the money actually arrives', async () => {
            mockFetchStatus.mockResolvedValue({ paymentStatus: 'PAID', attempt: null });
            const onSettled = jest.fn();
            await render(<CollectPaymentCard order={order()} token="t" onSettled={onSettled} />);

            await fireEvent.press(screen.getByLabelText('Ask for mobile money'));

            await waitFor(() => expect(onSettled).toHaveBeenCalled());
            await waitFor(() => expect(screen.getByText(/payment came through/i)).toBeTruthy());
        });

        it('surfaces a refusal from the customer rather than waiting for ever', async () => {
            mockFetchStatus.mockResolvedValue({
                paymentStatus: 'UNPAID',
                attempt: { reference: 'r1', status: 'FAILED', amount: 12000, currency: 'RWF', payer: null, failureReason: 'The customer rejected the prompt.', requestedAt: '' },
            });
            await render(<CollectPaymentCard order={order()} token="t" onSettled={() => {}} />);

            await fireEvent.press(screen.getByLabelText('Ask for mobile money'));

            await waitFor(() => expect(screen.getByText('The customer rejected the prompt.')).toBeTruthy());
            // And cash is still available as the way out.
            expect(screen.getByLabelText('Record cash taken')).toBeTruthy();
        });
    });

    // The order-of-operations gap: the server takes payment from IN_TRANSIT
    // and ARRIVED only, so closing the job first makes the fare unrecordable.
    it('warns instead of offering a doomed button once the job is closed unpaid', async () => {
        await render(<CollectPaymentCard order={order({ status: 'DELIVERED' })} token="t" onSettled={() => {}} />);
        expect(screen.getByText(/closed before the fare was recorded/i)).toBeTruthy();
        expect(screen.queryByLabelText('Record cash taken')).toBeNull();
    });

    it('stays off a job that has not been accepted', async () => {
        const { toJSON } = await render(<CollectPaymentCard order={order({ status: 'OFFERED' })} token="t" onSettled={() => {}} />);
        expect(toJSON()).toBeNull();
    });
});
