import { describe, it, expect } from '@jest/globals';
import {
  canSettleNow,
  explainSettlement,
  jobCommissionLabel,
  owedHeadline,
  validatePartial,
} from './cash';
import type { DriverCashSummary } from './api';

const summary = (over: Partial<DriverCashSummary> = {}): DriverCashSummary => ({
  collected: 40000,
  commissionOwed: 6000,
  commissionSettled: 0,
  commissionOwedUnknownJobs: 0,
  currency: 'RWF',
  byCurrency: [{
    currency: 'RWF', collected: 40000, commissionOwed: 6000,
    commissionSettled: 0, commissionOwedUnknownJobs: 0,
  }],
  jobs: [],
  ...over,
});

describe('explainSettlement', () => {
  it('does not call a timed-out prompt a failure', () => {
    // MTN may still settle it. Telling a driver the money is gone when it may
    // have left their wallet sends them to pay a second time.
    const meaning = explainSettlement({ status: 'TIMED_OUT' });
    expect(meaning.tone).not.toBe('bad');
    expect(meaning.detail).toMatch(/check your wallet/i);
  });

  it('says the debt survives a failed payment', () => {
    const meaning = explainSettlement({ status: 'FAILED', failure_reason: 'Not enough funds.' });
    expect(meaning.detail).toContain('Not enough funds.');
    expect(meaning.detail).toMatch(/still owe/i);
  });

  it('keeps polling only while the prompt is pending', () => {
    expect(explainSettlement({ status: 'PENDING' }).settled).toBe(false);
    expect(explainSettlement({ status: 'SUCCESSFUL' }).settled).toBe(true);
    expect(explainSettlement({ status: 'FAILED' }).settled).toBe(true);
  });

  it('renders a status it has never seen rather than crashing', () => {
    const meaning = explainSettlement({ status: 'REVERSED_BY_MTN' });
    expect(meaning.label).toBe('REVERSED_BY_MTN');
    expect(meaning.tone).toBe('neutral');
    // Never quietly called paid.
    expect(meaning.tone).not.toBe('good');
  });
});

describe('owedHeadline', () => {
  it('warns that the figure is a floor when a job has no commission worked out', () => {
    const head = owedHeadline(summary({ commissionOwedUnknownJobs: 2 }));
    expect(head.incomplete).toBe(true);
    expect(head.caveat).toMatch(/2 jobs have/);
    expect(head.caveat).toMatch(/may owe more/i);
  });

  it('says "job has" for one and "jobs have" for several', () => {
    expect(owedHeadline(summary({ commissionOwedUnknownJobs: 1 })).caveat).toMatch(/1 job has/);
  });

  it('refuses to show a single total across two currencies', () => {
    // 6000 RWF + 15 USD is not 6015 of anything.
    const head = owedHeadline(summary({
      commissionOwed: null,
      currency: null,
      byCurrency: [
        { currency: 'RWF', collected: 40000, commissionOwed: 6000, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
        { currency: 'USD', collected: 100, commissionOwed: 15, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
      ],
    }));
    expect(head.amount).toBeNull();
    expect(head.caveat).toMatch(/more than one currency/i);
  });

  // The bug the screen test caught: commissionOwed is 0 because nobody has
  // worked the fees out, and the hint said "You are square. Nothing
  // outstanding." A driver reading that spends money they owe.
  it('never calls a driver square when the zero is only an unknown', () => {
    const head = owedHeadline(summary({ commissionOwed: 0, commissionOwedUnknownJobs: 2 }));
    expect(head.tone).toBe('unknown');
    expect(head.hint).not.toMatch(/square/i);
    expect(head.hint).not.toMatch(/nothing outstanding/i);
    expect(head.hint).toMatch(/do not treat this as settled/i);
  });

  it('calls a driver square only when the zero is complete', () => {
    const head = owedHeadline(summary({ commissionOwed: 0, commissionOwedUnknownJobs: 0 }));
    expect(head.tone).toBe('clear');
    expect(head.hint).toMatch(/nothing outstanding/i);
  });

  it('is owing whenever there is a positive debt', () => {
    expect(owedHeadline(summary()).tone).toBe('owing');
    // Even with an unknown alongside it — a known debt plus an unknown is
    // still, definitely, a debt.
    expect(owedHeadline(summary({ commissionOwedUnknownJobs: 1 })).tone).toBe('owing');
  });

  it('has no caveat in the ordinary single-currency case', () => {
    const head = owedHeadline(summary());
    expect(head.amount).toBe(6000);
    expect(head.currency).toBe('RWF');
    expect(head.caveat).toBeNull();
  });
});

describe('canSettleNow', () => {
  it('offers the button when a single-currency debt is outstanding', () => {
    expect(canSettleNow(summary()).canSettle).toBe(true);
  });

  it('refuses across currencies, because one prompt cannot pay two', () => {
    const gate = canSettleNow(summary({
      commissionOwed: null,
      byCurrency: [
        { currency: 'RWF', collected: 1, commissionOwed: 6000, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
        { currency: 'USD', collected: 1, commissionOwed: 15, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
      ],
    }));
    expect(gate.canSettle).toBe(false);
    expect(gate.reason).toMatch(/dispatch/i);
  });

  it('tells a driver with unworked-out fees to ask, not that they owe nothing', () => {
    // The trap: commissionOwed is 0 because the fees are unknown, not because
    // the debt is clear. These must not read the same.
    const unknown = canSettleNow(summary({ commissionOwed: 0, commissionOwedUnknownJobs: 3 }));
    const clear = canSettleNow(summary({ commissionOwed: 0, commissionOwedUnknownJobs: 0 }));
    expect(unknown.canSettle).toBe(false);
    expect(clear.canSettle).toBe(false);
    expect(unknown.reason).not.toBe(clear.reason);
    expect(unknown.reason).toMatch(/not been worked out/i);
    expect(clear.reason).toMatch(/nothing outstanding/i);
  });
});

describe('jobCommissionLabel', () => {
  it('never renders an unknown commission as zero', () => {
    expect(jobCommissionLabel({ platformFee: null, currency: 'RWF' }))
      .toBe('Commission not worked out yet');
    expect(jobCommissionLabel({ platformFee: 0, currency: 'RWF' }))
      .toMatch(/^0 RWF/);
  });
});

describe('validatePartial', () => {
  it('accepts an amount typed with spaces or commas', () => {
    expect(validatePartial('2 000', 6000, 'RWF')).toEqual({ ok: true, amount: 2000 });
    expect(validatePartial('2,000', 6000, 'RWF')).toEqual({ ok: true, amount: 2000 });
  });

  it('refuses more than the debt, because this is not a way to send money', () => {
    const result = validatePartial('9000', 6000, 'RWF');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/cannot pay more/i);
  });

  it('allows paying the debt exactly', () => {
    expect(validatePartial('6000', 6000, 'RWF')).toEqual({ ok: true, amount: 6000 });
  });

  it('rejects nothing, zero, and nonsense', () => {
    for (const bad of ['', '0', '-5', 'abc']) {
      expect(validatePartial(bad, 6000, 'RWF').ok).toBe(false);
    }
  });
});
