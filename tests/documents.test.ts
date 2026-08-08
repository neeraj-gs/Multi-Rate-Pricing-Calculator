import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clearDatabase, startTestDatabase, stopTestDatabase } from './helpers/db';
import { AuditLog, DocumentModel, User } from '@/lib/db';
import { toApiError } from '@/lib/api/errors';
import {
  addLine,
  createDocument,
  deleteDocument,
  duplicateDocument,
  finalizeDocument,
  loadOwnedDocument,
  removeLine,
  updateDocument,
  updateLine,
} from '@/lib/documents/service';
import { listDocuments } from '@/lib/documents/queries';
import { buildSummaryReport } from '@/lib/reports/summary';
import {
  createDocumentSchema,
  reportRangeSchema,
  updateDocumentSchema,
} from '@/lib/validation/documents';

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearDatabase);

async function makeUser(email = 'owner@example.com') {
  const user = await User.create({
    email,
    name: 'Test Owner',
    passwordHash: 'not-used-in-these-tests',
  });
  return String(user._id);
}

/** The brief's sample document, as it would arrive over the wire. */
const SAMPLE_PAYLOAD = {
  title: 'Q3 Proposal',
  customer: { name: 'Acme Trading LLC' },
  issueDate: '2026-08-08',
  currency: 'USD',
  lines: [
    {
      description: 'Widget A',
      quantity: 2,
      unitPrice: '100.00',
      discount: { type: 'percent' as const, value: 10 },
      taxPercent: 5,
    },
    { description: 'Widget B', quantity: 1, unitPrice: '50.00', taxPercent: 5 },
    {
      description: 'Service fee',
      quantity: 1,
      unitPrice: '200.00',
      discount: { type: 'fixed' as const, value: '20.00' },
    },
  ],
};

function parsePayload(overrides: Record<string, unknown> = {}) {
  return createDocumentSchema.parse({ ...SAMPLE_PAYLOAD, ...overrides });
}

/**
 * Asserts on the error a *caller of the API* would see.
 *
 * The service layer throws whatever is most precise — an `ApiError` for a
 * lifecycle violation, a `PricingError` from the engine for a numeric one — and
 * `toApiError` is the single normalisation step every route applies before
 * responding. Running the assertion through it means these tests cover the
 * translation as well as the rule, rather than asserting on an intermediate
 * shape no client ever receives.
 */
async function expectApiError(fn: () => Promise<unknown>, code: string, status?: number) {
  try {
    await fn();
  } catch (error) {
    const apiError = toApiError(error);
    expect(apiError.code, `unexpected error: ${String(error)}`).toBe(code);
    if (status) expect(apiError.status).toBe(status);
    return apiError;
  }
  throw new Error(`Expected an error mapping to ${code}, but nothing was thrown.`);
}

describe('creating a document', () => {
  it('persists the brief’s sample document with the published totals', async () => {
    const userId = await makeUser();
    const document = await createDocument(userId, parsePayload());

    expect(document.totals).toMatchObject({
      subtotal: '450.00',
      totalDiscount: '40.00',
      totalTax: '11.50',
      grandTotal: '421.50',
    });
    expect(document.status).toBe('draft');
    expect(document.editable).toBe(true);
    expect(document.lines).toHaveLength(3);
    expect(document.lines[0].total).toBe('189.00');
  });

  it('stores totals as integers that survive a reload from the database', async () => {
    const userId = await makeUser();
    const created = await createDocument(userId, parsePayload());

    const reloaded = await DocumentModel.findById(created.id).lean();
    expect(reloaded?.totals).toMatchObject({
      subtotalMinor: 45_000,
      totalDiscountMinor: 4000,
      totalTaxMinor: 1150,
      grandTotalMinor: 42_150,
    });
  });

  it('assigns sequential per-user document numbers', async () => {
    const userId = await makeUser();
    const first = await createDocument(userId, parsePayload());
    const second = await createDocument(userId, parsePayload());

    expect(first.number).toBe('QT-0001');
    expect(second.number).toBe('QT-0002');
  });

  it('numbers each user independently', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');

    const aliceDoc = await createDocument(alice, parsePayload());
    const bobDoc = await createDocument(bob, parsePayload());

    expect(aliceDoc.number).toBe('QT-0001');
    expect(bobDoc.number).toBe('QT-0001');
  });

  it('hands out a unique number under concurrent creation', async () => {
    // The failure mode this guards: counting existing documents instead of
    // using an atomic $inc, which gives concurrent requests the same number.
    const userId = await makeUser();
    const documents = await Promise.all(
      Array.from({ length: 10 }, () => createDocument(userId, parsePayload())),
    );
    const numbers = documents.map((document) => document.number);
    expect(new Set(numbers).size).toBe(10);
  });

  /*
   * Editable numbers break the counter's guarantee.
   *
   * The atomic $inc means no two *minted* numbers collide, which used to be the
   * whole story. Once a number can be typed, a person can claim QT-0003 by hand
   * and the counter will walk straight into it — and the unique index turns that
   * into a duplicate-key error on an ordinary "New document" click.
   */
  it('steps past a number someone has already claimed by hand', async () => {
    const userId = await makeUser();
    const first = await createDocument(userId, parsePayload());
    await updateDocument(userId, first.id, { number: 'QT-0002' });

    // The counter's next value is 2, which is now taken.
    const second = await createDocument(userId, parsePayload());
    expect(second.number).toBe('QT-0003');

    const numbers = [first, second].map((document) => document.number);
    expect(new Set(numbers).size).toBe(2);
  });

  it('creates a document with no lines yet', async () => {
    // The normal way to start: create the document, then add lines in the
    // editor. This is a regression test — the new-document form used to send a
    // single blank placeholder line, which the schema rejected because a line
    // must have a description, so every create that was not the worked example
    // failed with a 400. Every other test happened to supply descriptions,
    // which is exactly why it went unnoticed.
    const userId = await makeUser();
    const document = await createDocument(userId, parsePayload({ lines: [] }));

    expect(document.lines).toEqual([]);
    expect(document.status).toBe('draft');
    expect(document.totals).toMatchObject({
      subtotal: '0.00',
      totalDiscount: '0.00',
      totalTax: '0.00',
      grandTotal: '0.00',
    });
  });

  it('rejects a line with no description', async () => {
    const userId = await makeUser();
    await expectApiError(
      () =>
        Promise.resolve().then(() =>
          createDocumentSchema.parse({
            ...SAMPLE_PAYLOAD,
            lines: [{ description: '', quantity: 1, unitPrice: '10.00' }],
          }),
        ),
      'VALIDATION_FAILED',
      400,
    );
    expect(userId).toBeTruthy();
  });

  it('rejects a fixed discount that exceeds its line subtotal', async () => {
    const userId = await makeUser();
    const error = await expectApiError(
      () =>
        createDocument(
          userId,
          parsePayload({
            lines: [
              {
                description: 'Over-discounted',
                quantity: 1,
                unitPrice: '50.00',
                discount: { type: 'fixed', value: '80.00' },
              },
            ],
          }),
        ),
      'UNPROCESSABLE',
      422,
    );
    expect(error.details[0].path).toBe('lines.0.discount.value');
  });
});

describe('the finalized document is immutable', () => {
  async function makeFinalized() {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const finalized = await finalizeDocument(userId, draft.id, undefined);
    return { userId, id: draft.id, finalized };
  }

  it('marks the document read-only and stamps the time', async () => {
    const { finalized } = await makeFinalized();
    expect(finalized.status).toBe('finalized');
    expect(finalized.editable).toBe(false);
    expect(finalized.finalizedAt).toBeTruthy();
  });

  it('rejects metadata edits with 409 DOCUMENT_FINALIZED', async () => {
    const { userId, id } = await makeFinalized();
    await expectApiError(
      () => updateDocument(userId, id, { title: 'Sneaky rename' }),
      'DOCUMENT_FINALIZED',
      409,
    );
  });

  it('rejects replacing the line items', async () => {
    const { userId, id } = await makeFinalized();
    await expectApiError(
      () =>
        updateDocument(userId, id, {
          lines: [{ description: 'New', quantity: 1, unitPrice: '1.00', discount: null, taxPercent: null }],
        }),
      'DOCUMENT_FINALIZED',
      409,
    );
  });

  it('rejects adding, editing and removing a line', async () => {
    const { userId, id, finalized } = await makeFinalized();
    const lineId = finalized.lines[0].id;

    await expectApiError(
      () =>
        addLine(userId, id, {
          description: 'Extra',
          quantity: 1,
          unitPrice: '10.00',
          discount: null,
          taxPercent: null,
        }),
      'DOCUMENT_FINALIZED',
    );
    await expectApiError(
      () => updateLine(userId, id, lineId, { unitPrice: '1.00' }),
      'DOCUMENT_FINALIZED',
    );
    await expectApiError(() => removeLine(userId, id, lineId), 'DOCUMENT_FINALIZED');
  });

  it('rejects deletion, because reports depend on issued documents', async () => {
    const { userId, id } = await makeFinalized();
    await expectApiError(() => deleteDocument(userId, id), 'DOCUMENT_FINALIZED', 409);
  });

  /*
   * The number is the most immutable thing about an issued document, not the
   * least: it is the identity the customer's copy was sent under, and the
   * handle every audit entry and report row refers to. Renumbering after issue
   * is precisely the hole the lifecycle exists to close.
   */
  it('rejects renumbering, because the customer already has that number', async () => {
    const { userId, id } = await makeFinalized();
    const before = await DocumentModel.findById(id).lean();

    await expectApiError(
      () => updateDocument(userId, id, { number: 'INV-9999' }),
      'DOCUMENT_FINALIZED',
      409,
    );

    const after = await DocumentModel.findById(id).lean();
    expect(after?.number).toBe(before?.number);
  });

  it('rejects a second finalize rather than silently succeeding', async () => {
    const { userId, id } = await makeFinalized();
    await expectApiError(
      () => finalizeDocument(userId, id, undefined),
      'DOCUMENT_FINALIZED',
      409,
    );
  });

  it('leaves the stored figures untouched after every rejected attempt', async () => {
    const { userId, id } = await makeFinalized();
    const before = await DocumentModel.findById(id).lean();

    await updateDocument(userId, id, { title: 'x' }).catch(() => undefined);
    await removeLine(userId, id, String(before!.lines[0]._id)).catch(() => undefined);
    await deleteDocument(userId, id).catch(() => undefined);

    const after = await DocumentModel.findById(id).lean();
    expect(after?.title).toBe(before?.title);
    expect(after?.lines).toHaveLength(before!.lines.length);
    expect(after?.totals).toEqual(before?.totals);
    expect(after?.revision).toBe(before?.revision);
  });
});

describe('finalize validation', () => {
  it('refuses to finalize a document with no line items', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload({ lines: [] }));

    const error = await expectApiError(
      () => finalizeDocument(userId, draft.id, undefined),
      'UNPROCESSABLE',
      422,
    );
    expect(error.details[0].message).toMatch(/at least one line item/i);
  });

  it('refuses to finalize when a stored line has a non-positive quantity', async () => {
    // Written straight to the collection, bypassing validation, to prove the
    // finalize gate stands on its own rather than relying on the write path.
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    await DocumentModel.updateOne(
      { _id: draft.id },
      { $set: { 'lines.0.quantityScaled': 0 } },
    );

    const error = await expectApiError(
      () => finalizeDocument(userId, draft.id, undefined),
      'UNPROCESSABLE',
    );
    expect(error.details.some((detail) => /greater than zero/i.test(detail.message))).toBe(
      true,
    );
  });
});

describe('renumbering a draft', () => {
  it('renames the document and leaves every figure alone', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());

    const renamed = await updateDocument(userId, draft.id, { number: 'INV-2026-014' });

    expect(renamed.number).toBe('INV-2026-014');
    expect(renamed.totals.grandTotal).toBe('421.50');
    expect(renamed.lines).toHaveLength(3);
  });

  it('uppercases the number, so two documents cannot look identical in a list', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());

    const parsed = updateDocumentSchema.parse({ number: '  inv-2026/014  ' });
    const renamed = await updateDocument(userId, draft.id, parsed);

    expect(renamed.number).toBe('INV-2026/014');
  });

  it('refuses a number another document already holds', async () => {
    const userId = await makeUser();
    const first = await createDocument(userId, parsePayload());
    const second = await createDocument(userId, parsePayload());

    const error = await expectApiError(
      () => updateDocument(userId, second.id, { number: first.number }),
      'NUMBER_TAKEN',
      409,
    );
    expect(error.details[0].path).toBe('number');

    // The rejected write leaves the document as it was, rather than half-applied.
    const reloaded = await DocumentModel.findById(second.id).lean();
    expect(reloaded?.number).toBe(second.number);
  });

  it('lets two users hold the same number, because numbering is per account', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    const aliceDoc = await createDocument(alice, parsePayload());
    const bobDoc = await createDocument(bob, parsePayload());

    await updateDocument(alice, aliceDoc.id, { number: 'SHARED-01' });
    const renamed = await updateDocument(bob, bobDoc.id, { number: 'SHARED-01' });

    expect(renamed.number).toBe('SHARED-01');
  });

  it('rejects a number with characters that break filenames and URLs', async () => {
    for (const bad of ['', 'INV 2026', 'INV,2026', '-LEADING', 'INV#1']) {
      expect(updateDocumentSchema.safeParse({ number: bad }).success).toBe(false);
    }
    for (const good of ['QT-0042', 'INV-2026-014', '2026/Q3/007', 'A.1_2']) {
      expect(updateDocumentSchema.safeParse({ number: good }).success).toBe(true);
    }
  });

  it('records the rename in the audit log', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    await updateDocument(userId, draft.id, { number: 'INV-0007' });

    const entry = await AuditLog.findOne({
      entityId: draft.id,
      action: 'document.update',
    }).lean();

    expect(entry?.changes).toMatchObject({
      number: { from: 'QT-0001', to: 'INV-0007' },
    });
  });
});

describe('editing a draft', () => {
  it('recalculates document totals when a line changes', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());

    const updated = await updateLine(userId, draft.id, draft.lines[1].id, {
      unitPrice: '150.00',
    });

    // Widget B: 150.00 + 5% tax = 157.50, replacing 52.50.
    expect(updated.lines[1].total).toBe('157.50');
    expect(updated.totals.grandTotal).toBe('526.50');
    expect(updated.totals.subtotal).toBe('550.00');
  });

  it('keeps the totals identity after every kind of edit', async () => {
    const userId = await makeUser();
    let document = await createDocument(userId, parsePayload());

    document = await addLine(userId, document.id, {
      description: 'Extra',
      quantity: '3.5',
      unitPrice: '19.99',
      discount: { type: 'percent', value: '7.5' },
      taxPercent: '5',
    });
    document = await updateLine(userId, document.id, document.lines[0].id, {
      discount: { type: 'fixed', value: '15.00' },
    });
    document = await removeLine(userId, document.id, document.lines[1].id);

    const { subtotalMinor, totalDiscountMinor, totalTaxMinor, grandTotalMinor } =
      document.totals.amounts;
    expect(subtotalMinor - totalDiscountMinor + totalTaxMinor).toBe(grandTotalMinor);
    expect(
      document.lines.reduce((sum, line) => sum + line.amounts.totalMinor, 0),
    ).toBe(grandTotalMinor);
  });

  it('changes currency while keeping the values as entered', async () => {
    // The failure this guards: amounts are stored as integer minor units, so
    // naively swapping the currency reinterprets every one of them — 45000 is
    // 450.00 in USD but 45.000 in KWD. Prices must survive as the decimals the
    // user typed.
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    expect(draft.totals.subtotal).toBe('450.00');

    const moved = await updateDocument(userId, draft.id, { currency: 'AED' });

    expect(moved.currency).toBe('AED');
    expect(moved.totals.subtotal).toBe('450.00');
    expect(moved.totals.grandTotal).toBe('421.50');
    expect(moved.lines[0].unitPrice).toBe('100.00');
    expect(moved.lines[2].discount).toEqual({ type: 'fixed', value: '20.00' });
  });

  it('re-prices at the new currency’s precision', async () => {
    // KWD has three decimal places, so the stored integers must be rescaled,
    // not reused: 100.00 becomes 100.000, i.e. 100000 fils rather than 10000.
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const moved = await updateDocument(userId, draft.id, { currency: 'KWD' });

    expect(moved.currency).toBe('KWD');
    expect(moved.lines[0].unitPrice).toBe('100.000');
    expect(moved.lines[0].amounts.unitPriceMinor).toBe(100_000);
    expect(moved.totals.grandTotal).toBe('421.500');
  });

  it('moves whole-unit prices into a zero-decimal currency', async () => {
    // Every price in the sample is a whole number, and trailing zeros carry no
    // information — so 100.00 is representable in yen as 100. The move should
    // succeed rather than being refused on the shape of the string.
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const moved = await updateDocument(userId, draft.id, { currency: 'JPY' });

    expect(moved.currency).toBe('JPY');
    expect(moved.lines[0].unitPrice).toBe('100');

    /*
     * 422, not 421 — and the difference is the whole point of rounding per
     * currency rather than to a hardcoded two places.
     *
     * Widget B's tax is 5% of 50, which is exactly 2.50. USD keeps that as
     * 2.50; yen has no minor unit, so it rounds half-up to 3 and the line
     * comes to 53 rather than 52.50.
     *
     *   189 + 53 + 180 = 422
     *
     * A currency move is a re-pricing, not a relabelling.
     */
    expect(moved.lines[1].taxAmount).toBe('3');
    expect(moved.lines[1].total).toBe('53');
    expect(moved.totals.grandTotal).toBe('422');

    // And the identity still holds in the new currency.
    const { subtotalMinor, totalDiscountMinor, totalTaxMinor, grandTotalMinor } =
      moved.totals.amounts;
    expect(subtotalMinor - totalDiscountMinor + totalTaxMinor).toBe(grandTotalMinor);
  });

  it('refuses a currency an existing price genuinely cannot fit', async () => {
    // 19.99 has no representation in yen, which has no minor unit. Truncating
    // to 19 or 20 would silently change a price, so the move is rejected and
    // the offending line is named.
    const userId = await makeUser();
    const draft = await createDocument(
      userId,
      parsePayload({
        lines: [
          { description: 'Odd price', quantity: 1, unitPrice: '19.99', taxPercent: 5 },
        ],
      }),
    );

    const error = await expectApiError(
      () => updateDocument(userId, draft.id, { currency: 'JPY' }),
      'VALIDATION_FAILED',
      400,
    );
    expect(error.details[0].path).toBe('lines.0.unitPrice');
    expect(error.message).toMatch(/decimal place/i);

    // And the document is untouched by the failed attempt.
    const after = await loadOwnedDocument(userId, draft.id);
    expect(after.currency).toBe('USD');
  });

  it('will not change the currency of a finalized document', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    await finalizeDocument(userId, draft.id, undefined);

    await expectApiError(
      () => updateDocument(userId, draft.id, { currency: 'AED' }),
      'DOCUMENT_FINALIZED',
      409,
    );
  });

  it('bumps the revision and rejects a write based on a stale one', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    expect(draft.revision).toBe(1);

    const updated = await updateDocument(userId, draft.id, { title: 'First edit' });
    expect(updated.revision).toBe(2);

    await expectApiError(
      () => updateDocument(userId, draft.id, { title: 'Second tab', revision: 1 }),
      'REVISION_MISMATCH',
      409,
    );
  });

  it('deletes a draft', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());

    await deleteDocument(userId, draft.id);
    await expectApiError(() => loadOwnedDocument(userId, draft.id), 'NOT_FOUND', 404);
  });
});

describe('duplicating', () => {
  it('copies a finalized document into an editable draft', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const finalized = await finalizeDocument(userId, draft.id, undefined);

    const copy = await duplicateDocument(userId, finalized.id);

    expect(copy.status).toBe('draft');
    expect(copy.editable).toBe(true);
    expect(copy.id).not.toBe(finalized.id);
    expect(copy.number).not.toBe(finalized.number);
    expect(copy.duplicatedFromId).toBe(finalized.id);
    expect(copy.totals.grandTotal).toBe(finalized.totals.grandTotal);
    expect(copy.lines).toHaveLength(finalized.lines.length);
  });

  it('leaves the original finalized and untouched', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const finalized = await finalizeDocument(userId, draft.id, undefined);
    await duplicateDocument(userId, finalized.id);

    const original = await loadOwnedDocument(userId, finalized.id);
    expect(original.status).toBe('finalized');
  });

  it('makes the copy independently editable', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    const finalized = await finalizeDocument(userId, draft.id, undefined);
    const copy = await duplicateDocument(userId, finalized.id);

    const edited = await updateLine(userId, copy.id, copy.lines[0].id, {
      unitPrice: '250.00',
    });

    expect(edited.totals.grandTotal).not.toBe(finalized.totals.grandTotal);
    const original = await loadOwnedDocument(userId, finalized.id);
    expect(original.totals.grandTotalMinor).toBe(42_150);
  });
});

describe('tenant isolation', () => {
  it('does not let one user read, edit or delete another user’s document', async () => {
    const alice = await makeUser('alice@example.com');
    const mallory = await makeUser('mallory@example.com');
    const document = await createDocument(alice, parsePayload());

    // 404 rather than 403: confirming the document exists would itself leak.
    await expectApiError(() => loadOwnedDocument(mallory, document.id), 'NOT_FOUND', 404);
    await expectApiError(
      () => updateDocument(mallory, document.id, { title: 'Mine now' }),
      'NOT_FOUND',
    );
    await expectApiError(() => deleteDocument(mallory, document.id), 'NOT_FOUND');
    await expectApiError(
      () => finalizeDocument(mallory, document.id, undefined),
      'NOT_FOUND',
    );
    await expectApiError(() => duplicateDocument(mallory, document.id), 'NOT_FOUND');
  });

  it('keeps one user’s documents out of another’s list', async () => {
    const alice = await makeUser('alice@example.com');
    const mallory = await makeUser('mallory@example.com');
    await createDocument(alice, parsePayload());
    await createDocument(alice, parsePayload());

    const list = await listDocuments(mallory, {
      page: 1,
      limit: 20,
      status: 'all',
      sort: '-issueDate',
    });
    expect(list.data).toHaveLength(0);
    expect(list.pagination.total).toBe(0);
  });

  it('keeps one user’s documents out of another’s report', async () => {
    const alice = await makeUser('alice@example.com');
    const mallory = await makeUser('mallory@example.com');
    await createDocument(alice, parsePayload());

    const range = reportRangeSchema.parse({ from: '2026-01-01', to: '2026-12-31' });
    expect((await buildSummaryReport(mallory, range)).documentCount).toBe(0);
    expect((await buildSummaryReport(alice, range)).documentCount).toBe(1);
  });
});

describe('summary report', () => {
  it('sums to exactly the same figures as the documents it covers', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ issueDate: '2026-03-05' }));
    await createDocument(userId, parsePayload({ issueDate: '2026-03-20' }));
    await createDocument(userId, parsePayload({ issueDate: '2026-04-02' }));

    const range = reportRangeSchema.parse({ from: '2026-03-01', to: '2026-03-31' });
    const report = await buildSummaryReport(userId, range);

    expect(report.documentCount).toBe(2);
    const usd = report.byCurrency.find((row) => row.currency === 'USD');
    expect(usd).toMatchObject({
      subtotal: '900.00', // 2 x 450.00
      totalDiscount: '80.00', // 2 x 40.00
      totalTax: '23.00', // 2 x 11.50
      grandTotal: '843.00', // 2 x 421.50
      documentCount: 2,
    });
  });

  it('includes documents issued on both boundary dates', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ issueDate: '2026-03-01' }));
    await createDocument(userId, parsePayload({ issueDate: '2026-03-31' }));

    const range = reportRangeSchema.parse({ from: '2026-03-01', to: '2026-03-31' });
    expect((await buildSummaryReport(userId, range)).documentCount).toBe(2);
  });

  it('separates currencies instead of adding them together', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ currency: 'USD' }));
    await createDocument(userId, parsePayload({ currency: 'AED' }));

    const range = reportRangeSchema.parse({ from: '2026-01-01', to: '2026-12-31' });
    const report = await buildSummaryReport(userId, range);

    expect(report.documentCount).toBe(2);
    expect(report.byCurrency).toHaveLength(2);
    expect(report.byCurrency.every((row) => row.grandTotal === '421.50')).toBe(true);
  });

  it('filters by status', async () => {
    const userId = await makeUser();
    const draft = await createDocument(userId, parsePayload());
    await createDocument(userId, parsePayload());
    await finalizeDocument(userId, draft.id, undefined);

    const range = { from: '2026-01-01', to: '2026-12-31' };
    const finalized = await buildSummaryReport(
      userId,
      reportRangeSchema.parse({ ...range, status: 'finalized' }),
    );
    const drafts = await buildSummaryReport(
      userId,
      reportRangeSchema.parse({ ...range, status: 'draft' }),
    );

    expect(finalized.documentCount).toBe(1);
    expect(drafts.documentCount).toBe(1);
    expect(finalized.byCurrency[0].grandTotal).toBe('421.50');
  });

  it('returns zeroes for an empty range rather than failing', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ issueDate: '2026-08-08' }));

    const range = reportRangeSchema.parse({ from: '2020-01-01', to: '2020-12-31' });
    const report = await buildSummaryReport(userId, range);

    expect(report.documentCount).toBe(0);
    expect(report.byCurrency).toEqual([]);
    expect(report.primaryCurrency).toBeNull();
  });

  /*
   * The aggregation returns only the periods that have documents. If a chart
   * plots those rows directly, a month with nothing in it disappears from the
   * axis and its neighbours are drawn touching — a gap rendered as continuity,
   * which is the one thing a time axis must never do.
   */
  it('spans every period in the range, including the empty ones', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ issueDate: '2026-01-15' }));
    await createDocument(userId, parsePayload({ issueDate: '2026-04-15' }));

    const report = await buildSummaryReport(
      userId,
      reportRangeSchema.parse({ from: '2026-01-01', to: '2026-04-30', groupBy: 'month' }),
    );

    expect(report.periods.map((entry) => entry.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    // February and March are absent from the aggregation — they are the axis's
    // job to supply, not the pipeline's.
    expect(report.timeseries.map((row) => row.period)).toEqual(['2026-01', '2026-04']);
    expect(report.periods[0].label).toBe('Jan 2026');
  });

  it('numbers weeks by ISO year, so a range crossing New Year stays ordered', async () => {
    const userId = await makeUser();
    const report = await buildSummaryReport(
      userId,
      reportRangeSchema.parse({ from: '2026-12-28', to: '2027-01-10', groupBy: 'week' }),
    );

    // 28 Dec 2026 is a Monday, and its week belongs to ISO year 2026 — while
    // 1 Jan 2027 falls inside that same week rather than starting a new one.
    expect(report.periods.map((entry) => entry.period)).toEqual([
      '2026-W53',
      '2027-W01',
    ]);
  });
});

describe('listing', () => {
  it('paginates, filters by status and searches', async () => {
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ title: 'Alpha proposal' }));
    await createDocument(userId, parsePayload({ title: 'Beta proposal' }));
    const third = await createDocument(userId, parsePayload({ title: 'Gamma proposal' }));
    await finalizeDocument(userId, third.id, undefined);

    const base = { page: 1, limit: 2, sort: '-issueDate' as const };

    const firstPage = await listDocuments(userId, { ...base, status: 'all' });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.pagination).toMatchObject({ total: 3, totalPages: 2, hasMore: true });

    const finalizedOnly = await listDocuments(userId, {
      ...base,
      limit: 20,
      status: 'finalized',
    });
    expect(finalizedOnly.data).toHaveLength(1);
    expect(finalizedOnly.data[0].title).toBe('Gamma proposal');

    const searched = await listDocuments(userId, {
      ...base,
      limit: 20,
      status: 'all',
      q: 'Beta',
    });
    expect(searched.data).toHaveLength(1);
  });

  it('treats a regex metacharacter in the search box as a literal', async () => {
    // `a+++b` compiled as a regex is a catastrophic-backtracking DoS.
    const userId = await makeUser();
    await createDocument(userId, parsePayload({ title: 'Normal title' }));

    const result = await listDocuments(userId, {
      page: 1,
      limit: 20,
      status: 'all',
      sort: '-issueDate',
      q: 'a+++++++++++++++b',
    });
    expect(result.data).toHaveLength(0);
  });
});
