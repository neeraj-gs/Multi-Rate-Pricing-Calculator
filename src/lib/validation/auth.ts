import { z } from 'zod';
import { currencySchema, emailSchema, passwordSchema } from './common';

export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(120, 'Name must be 120 characters or fewer.'),
    email: emailSchema,
    password: passwordSchema,
    company: z.string().trim().max(160).optional().default(''),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    // Deliberately not `passwordSchema`: an existing account may predate a rule
    // change, and rejecting a login on format would leak which rules applied
    // when the account was created.
    password: z.string().min(1, 'Password is required.').max(200),
  })
  .strict();

export const updatePreferencesSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().max(160).optional(),
    currency: currencySchema.optional(),
    defaultTaxPercent: z
      .number()
      .min(0, 'Default tax cannot be negative.')
      .max(100, 'Default tax cannot exceed 100%.')
      .optional(),
    documentPrefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,8}$/, 'Prefix must be 1–8 letters or digits.')
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
