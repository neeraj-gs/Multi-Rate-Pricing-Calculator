import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/PageHeader';
import { DocumentsList } from '@/components/documents/DocumentsList';

export const metadata: Metadata = { title: 'Documents' };

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Every quote and proposal you have created, with the totals the server computed for each."
        actions={
          <Button asChild variant="primary">
            <Link href="/documents/new">
              <Plus className="size-4" />
              New document
            </Link>
          </Button>
        }
      />
      <DocumentsList />
    </div>
  );
}
