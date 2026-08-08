import { NextResponse } from 'next/server';
import { SUPPORTED_CURRENCIES } from '@/lib/pricing';

export const runtime = 'nodejs';

/**
 * The API's own description, served from the API.
 *
 * Written by hand rather than generated, because a generated spec documents
 * what the code *is* while a written one documents what the API *promises* —
 * including the rounding policy and the lifecycle rules, which no generator
 * would infer. Browse it at `/api-docs`.
 */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Tessera API',
    version: '1.0.0',
    description: [
      'Multi-rate pricing calculator for quotes, proposals and billing documents.',
      '',
      '## Money',
      'No monetary value is ever transmitted as a JSON number. Amounts appear as a',
      'formatted decimal string (`"189.00"`) for display and as an integer count of',
      'minor units (`18900`) under `amounts` for comparison. Inputs accept either a',
      'string or a number; strings are lossless and preferred.',
      '',
      '## Rounding',
      'Half-up, applied per line at each step, to the currency’s minor unit. Document',
      'totals are sums of already-rounded line values, so',
      '`subtotal - totalDiscount + totalTax === grandTotal` holds exactly.',
      '',
      '## Order of operations',
      '`subtotal = qty x unitPrice` → discount → tax on the **discounted** amount →',
      '`lineTotal = discounted + tax`.',
      '',
      '## Lifecycle',
      'A `draft` is fully editable. A `finalized` document is permanently read-only:',
      'every write returns `409 DOCUMENT_FINALIZED`. Duplicate it into a new draft to',
      'make changes.',
      '',
      '## Idempotency',
      'Send an `Idempotency-Key` header on `POST /documents`, `/finalize` and',
      '`/duplicate`. A retry with the same key returns the original response instead',
      'of acting twice.',
    ].join('\n'),
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'Auth' },
    { name: 'Documents' },
    { name: 'Line items' },
    { name: 'Reports' },
    { name: 'Pricing' },
    { name: 'Audit' },
    { name: 'System' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'tsa_session',
        description: 'httpOnly JWT session cookie, set by /auth/login and /auth/signup.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND',
                  'CONFLICT', 'DOCUMENT_FINALIZED', 'REVISION_MISMATCH', 'EMAIL_TAKEN',
                  'INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'RATE_LIMITED',
                  'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'UNPROCESSABLE',
                  'PAYLOAD_TOO_LARGE', 'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', example: 'lines.0.quantity' },
                    message: { type: 'string' },
                    code: { type: 'string' },
                  },
                },
              },
              requestId: { type: 'string' },
            },
          },
        },
      },
      Discount: {
        type: 'object',
        nullable: true,
        required: ['type', 'value'],
        properties: {
          type: { type: 'string', enum: ['percent', 'fixed'] },
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
            description:
              'Percent 0–100 when type is "percent"; an amount in major units when "fixed". A fixed discount above the line subtotal is rejected with 422.',
          },
        },
      },
      LineInput: {
        type: 'object',
        required: ['description', 'quantity', 'unitPrice'],
        properties: {
          description: { type: 'string', maxLength: 500 },
          quantity: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
            description: 'At least 1, up to 3 decimal places.',
          },
          unitPrice: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
            description: 'Zero or greater, at the currency’s precision.',
          },
          discount: { $ref: '#/components/schemas/Discount' },
          taxPercent: {
            oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
            description: 'Applied to the discounted line amount.',
          },
        },
      },
      Line: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          position: { type: 'integer' },
          quantity: { type: 'string', example: '2' },
          unitPrice: { type: 'string', example: '100.00' },
          discount: { $ref: '#/components/schemas/Discount' },
          taxPercent: { type: 'string', nullable: true, example: '5' },
          subtotal: { type: 'string', example: '200.00' },
          discountAmount: { type: 'string', example: '20.00' },
          discountedAmount: { type: 'string', example: '180.00' },
          taxAmount: { type: 'string', example: '9.00' },
          total: { type: 'string', example: '189.00' },
          amounts: {
            type: 'object',
            description: 'The same figures as exact integer minor units.',
            properties: {
              subtotalMinor: { type: 'integer', example: 20000 },
              discountAmountMinor: { type: 'integer', example: 2000 },
              discountedAmountMinor: { type: 'integer', example: 18000 },
              taxAmountMinor: { type: 'integer', example: 900 },
              totalMinor: { type: 'integer', example: 18900 },
            },
          },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          number: { type: 'string', example: 'QT-0007' },
          title: { type: 'string' },
          customer: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              address: { type: 'string' },
            },
          },
          issueDate: { type: 'string', format: 'date', example: '2026-08-08' },
          dueDate: { type: 'string', format: 'date', nullable: true },
          status: { type: 'string', enum: ['draft', 'finalized'] },
          currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
          lines: { type: 'array', items: { $ref: '#/components/schemas/Line' } },
          totals: {
            type: 'object',
            properties: {
              subtotal: { type: 'string', example: '450.00' },
              totalDiscount: { type: 'string', example: '40.00' },
              totalTax: { type: 'string', example: '11.50' },
              grandTotal: { type: 'string', example: '421.50' },
            },
          },
          editable: { type: 'boolean' },
          revision: { type: 'integer' },
          finalizedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    '/auth/signup': {
      post: {
        tags: ['Auth'], summary: 'Create an account and start a session', security: [],
        responses: { 201: { description: 'Created' }, 409: { description: 'Email already registered' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Sign in', security: [],
        responses: {
          200: { description: 'Signed in' },
          401: { description: 'Invalid credentials' },
          423: { description: 'Account temporarily locked after repeated failures' },
        },
      },
    },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Sign out', responses: { 200: { description: 'Signed out' } } } },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', responses: { 200: { description: 'OK' } } },
      patch: { tags: ['Auth'], summary: 'Update profile and preferences', responses: { 200: { description: 'OK' } } },
    },
    '/documents': {
      get: {
        tags: ['Documents'], summary: 'List documents (summaries, no line items)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'finalized', 'all'] } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Matches title, customer name or number.' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['issueDate', '-issueDate', 'updatedAt', '-updatedAt', 'total', '-total'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Documents'], summary: 'Create a draft',
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        responses: {
          201: { description: 'Created' },
          400: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { description: 'A fixed discount exceeds its line subtotal' },
        },
      },
    },
    '/documents/{id}': {
      get: { tags: ['Documents'], summary: 'Fetch one document with its line items', responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } } },
      patch: {
        tags: ['Documents'], summary: 'Edit a draft',
        responses: {
          200: { description: 'OK' },
          409: { description: 'Finalized (DOCUMENT_FINALIZED) or stale revision (REVISION_MISMATCH)' },
        },
      },
      delete: {
        tags: ['Documents'], summary: 'Delete a draft',
        responses: { 200: { description: 'Deleted' }, 409: { description: 'Finalized documents are permanent' } },
      },
    },
    '/documents/{id}/finalize': {
      post: {
        tags: ['Documents'], summary: 'Issue a document, freezing it permanently',
        responses: {
          200: { description: 'Finalized' },
          409: { description: 'Already finalized' },
          422: { description: 'Not ready — no lines, missing customer, or an invalid quantity or price' },
        },
      },
    },
    '/documents/{id}/duplicate': {
      post: { tags: ['Documents'], summary: 'Copy any document into a new draft', responses: { 201: { description: 'Created' } } },
    },
    '/documents/{id}/share': {
      post: { tags: ['Documents'], summary: 'Mint a public read-only link', responses: { 201: { description: 'Created' } } },
    },
    '/documents/{id}/lines': {
      post: {
        tags: ['Line items'], summary: 'Add a line to a draft; returns the recalculated document',
        responses: { 201: { description: 'Created' }, 409: { description: 'Finalized' } },
      },
    },
    '/documents/{id}/lines/{lineId}': {
      patch: { tags: ['Line items'], summary: 'Edit a line; returns the recalculated document', responses: { 200: { description: 'OK' }, 409: { description: 'Finalized' } } },
      delete: { tags: ['Line items'], summary: 'Remove a line; returns the recalculated document', responses: { 200: { description: 'OK' }, 409: { description: 'Finalized' } } },
    },
    '/documents/{id}/audit': {
      get: { tags: ['Audit'], summary: 'Activity for one document', responses: { 200: { description: 'OK' } } },
    },
    '/audit': { get: { tags: ['Audit'], summary: 'Account-wide audit trail', responses: { 200: { description: 'OK' } } } },
    '/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Totals over an issue-date range (both bounds inclusive)',
        description: 'Sums are grouped by currency, because adding AED to USD produces a meaningless number.',
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'finalized', 'all'] } },
          { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/export': { get: { tags: ['Reports'], summary: 'CSV of the documents behind a summary', responses: { 200: { description: 'text/csv' } } } },
    '/pricing/preview': {
      post: {
        tags: ['Pricing'],
        summary: 'Calculate totals without persisting anything',
        description: 'Lets the editor show live totals while keeping the server the only thing that computes money.',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/customers': { get: { tags: ['Documents'], summary: 'Distinct customers', responses: { 200: { description: 'OK' } } } },
    '/health': { get: { tags: ['System'], summary: 'Liveness and database reachability', security: [], responses: { 200: { description: 'OK' }, 503: { description: 'Database unreachable' } } } },
  },
};

export function GET() {
  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
