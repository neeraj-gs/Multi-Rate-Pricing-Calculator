import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
