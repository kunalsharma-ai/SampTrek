'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VendorStatement, type Statement } from '@/components/finance/vendor-statement';
import { ErrorBox, Loading, PageHeader } from '@/components/ui';
import { get } from '@/lib/api';

/** One vendor's projects, unbilled completes, pending and paid invoices (feedback 2026-11-23). */
export default function VendorStatementPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Statement | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    get<Statement>(`/payables/vendors/${id}`).then(setS).catch(setError);
  }, [id]);
  if (!s) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <Link href="/payables" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Vendor payables</Link>
      <PageHeader title={s.vendor.name} subtitle={`Vendor ${s.vendor.code}: completed and invoiced projects, unbilled completes, pending and paid invoices`} help="page:/payables/vendors/[id]" actions={<Link className="btn-ghost" href={`/vendors/${s.vendor.id}`}>Vendor page</Link>} />
      <VendorStatement s={s} billHref={(b) => `/payables/${b}`} projectHref={(p) => `/projects/${p}`} />
    </>
  );
}
