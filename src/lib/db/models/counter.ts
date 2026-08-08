import { Schema, model, models, type Model } from 'mongoose';

/**
 * Per-user sequence generator for human-readable document numbers.
 *
 * Counting existing documents (`count + 1`) is the obvious approach and is
 * wrong: two requests arriving together both read the same count and mint the
 * same number, and deleting a draft makes the sequence go backwards. A single
 * atomic `$inc` with upsert hands out each value exactly once, whatever the
 * concurrency.
 */
const counterSchema = new Schema(
  {
    _id: { type: String, required: true }, // `${userId}:document`
    sequence: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

interface CounterDocument {
  _id: string;
  sequence: number;
}

export const Counter: Model<CounterDocument> =
  (models.Counter as Model<CounterDocument>) ??
  model<CounterDocument>('Counter', counterSchema);

/** Returns the next sequence value for a user, atomically. */
export async function nextSequence(userId: string): Promise<number> {
  const result = await Counter.findByIdAndUpdate(
    `${userId}:document`,
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return result?.sequence ?? 1;
}

/** Formats a sequence as a document number, e.g. `QT-0042`. */
export function formatDocumentNumber(prefix: string, sequence: number): string {
  const clean = (prefix || 'QT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'QT';
  return `${clean}-${String(sequence).padStart(4, '0')}`;
}
