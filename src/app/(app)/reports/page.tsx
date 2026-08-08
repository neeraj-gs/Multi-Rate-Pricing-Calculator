import type { Metadata } from 'next';

import { PageHeader } from '@/components/app/PageHeader';
import { ReportView } from '@/components/reports/ReportView';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Summary report"
        description="Totals across an issue-date range. Grouped by currency, because adding AED to USD produces a number that means nothing."
      />
      <ReportView />
    </div>
  );
}
