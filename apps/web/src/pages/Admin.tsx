import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, FileCheck2, Search, ShieldCheck, Wallet } from 'lucide-react';
import { useApi, useSession } from '../api';
import { Action, Empty, PageHeading, QueryState, Status, dateTime, money } from '../components';
import { TextForm } from './Operations';

interface Verification {
  id: string;
  subjectType: string;
  subjectId: string;
  subjectName?: string | null;
  status: string;
  createdAt: string;
  notes?: string;
  submittedById: string;
}
interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  category?: string;
}
interface Queue {
  verifications: Verification[];
  disputes: Ticket[];
  tickets: Ticket[];
}
function SkillReviewQueue() {
  const { t, i18n } = useTranslation();
  const query = useApi<
    {
      id: string;
      status: string;
      skill: { nameUz: string; nameRu: string };
      workerProfile: { user: { name: string } };
    }[]
  >('/admin/worker-skills');
  return (
    <details className="panel skill-review">
      <summary>
        {t('skillReview')} · {query.data?.length || 0}
      </summary>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {query.data?.length ? (
          <div className="record-list">
            {query.data.map((item) => (
              <article className="record-card" key={item.id}>
                <ShieldCheck size={22} />
                <div>
                  <h3>{item.workerProfile.user.name}</h3>
                  <p>{item.skill[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}</p>
                  <Status value={item.status} />
                </div>
                <Action
                  reason
                  path={`/admin/worker-skills/${item.id}/verify`}
                  label={t('confirm')}
                  body={{ status: 'VERIFIED' }}
                />
                <Action
                  reason
                  path={`/admin/worker-skills/${item.id}/verify`}
                  label={t('reject')}
                  body={{ status: 'REJECTED' }}
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </details>
  );
}
export function AdminQueue({ support = false }: { support?: boolean }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const permissions = session.data?.user.platformPermissions ?? [];
  const query = useApi<Queue>('/admin/queue');
  const [selectedTab, setTab] = useState<'verifications' | 'disputes' | 'tickets'>(
    support ? 'tickets' : 'verifications',
  );
  const tabs = (
    [
      ['verifications', 'verification.review', 'verification'],
      ['disputes', 'dispute.resolve', 'dispute'],
      ['tickets', 'support.manage', 'support'],
    ] as const
  ).filter(([, permission]) => permissions.includes(permission));
  const tab = tabs.some(([value]) => value === selectedTab)
    ? selectedTab
    : (tabs[0]?.[0] ?? 'tickets');
  const [q, setQ] = useState('');
  const search = q.trim().toLowerCase();
  const verifications =
    query.data?.verifications.filter((item) =>
      `${item.subjectName || ''} ${item.notes || ''}`.toLowerCase().includes(search),
    ) ?? [];
  const tickets =
    tab === 'verifications'
      ? []
      : (query.data?.[tab] ?? []).filter((item) =>
          `${item.subject || ''} ${item.description || ''} ${item.category || ''}`
            .toLowerCase()
            .includes(search),
        );
  return (
    <>
      <PageHeading eyebrow="SMENATOP" title={t(support ? 'support' : 'queue')} />
      {!support && permissions.includes('verification.review') && <SkillReviewQueue />}
      <div className="stat-grid admin-stat-grid">
        {permissions.includes('verification.review') && (
          <div className="stat-card">
            <ShieldCheck />
            <span>{t('verification')}</span>
            <strong>{query.data?.verifications.length || 0}</strong>
          </div>
        )}
        {permissions.includes('dispute.resolve') && (
          <div className="stat-card">
            <FileCheck2 />
            <span>{t('dispute')}</span>
            <strong>{query.data?.disputes.length || 0}</strong>
          </div>
        )}
        {permissions.includes('support.manage') && (
          <div className="stat-card">
            <Activity />
            <span>{t('support')}</span>
            <strong>{query.data?.tickets.length || 0}</strong>
          </div>
        )}
      </div>
      <div className="queue-toolbar">
        <div className="filter-chips">
          {tabs.map(([value, , label]) => (
            <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
              {t(label)}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={17} />
          <span className="sr-only">{t('search')}</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t('search')}
          />
        </label>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {tab === 'verifications' ? (
          verifications.length ? (
            <div className="record-list">
              {verifications.map((item) => (
                <article className="panel verification-row" key={item.id}>
                  <div>
                    <span className="eyebrow">
                      {t(item.subjectType === 'ORGANIZATION' ? 'organizationProfile' : 'profile')}
                    </span>
                    <h3>
                      {item.subjectName ||
                        t(item.subjectType === 'ORGANIZATION' ? 'organizationProfile' : 'profile')}
                    </h3>
                    <p>{dateTime(item.createdAt, i18n.language)}</p>
                    <Status value={item.status} />
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <div className="form-actions">
                    <Action
                      reason
                      path={`/admin/verification/${item.id}`}
                      label={t('confirm')}
                      body={{ status: 'VERIFIED' }}
                      className="button button-primary compact"
                    />
                    <Action
                      reason
                      path={`/admin/verification/${item.id}`}
                      label={t('reject')}
                      body={{ status: 'REJECTED' }}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty />
          )
        ) : tickets.length > 0 ? (
          <div className="record-list">
            {tickets.map((item) => (
              <article className="panel" key={item.id}>
                <div className="record-heading">
                  <h2>{item.subject || item.category}</h2>
                  <Status value={item.status} />
                </div>
                <p>{item.description}</p>
                <small>{dateTime(item.createdAt, i18n.language)}</small>
                <details className="admin-resolution">
                  <summary>{t('resolve')}</summary>
                  <TextForm
                    path={`/admin/${tab === 'tickets' ? 'support' : 'disputes'}/${item.id}/resolve`}
                    label={t('resolve')}
                    fields={[{ name: 'resolution', label: 'reason', type: 'textarea' }]}
                  />
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
interface FinanceQueue {
  pending: {
    id: string;
    status: string;
    provider: string;
    amountMinor: string;
    createdAt: string;
  }[];
  cases: {
    id: string;
    kind: string;
    status: string;
    invoiceId: string;
    transactionId: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    status: string;
    reason: string;
    amountMinor: string;
    createdAt: string;
  }[];
}
export function AdminBilling() {
  const { t, i18n } = useTranslation();
  const query = useApi<FinanceQueue>('/admin/billing');
  return (
    <>
      <PageHeading eyebrow="SMENATOP" title={t('billing')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className="section-heading compact-heading">
          <h2>{t('reconciliation')}</h2>
          <span>{query.data?.cases.length || 0}</span>
        </div>
        {query.data?.cases.length ? (
          <div className="record-list">
            {query.data.cases.map((item) => (
              <article className="record-card" key={item.id}>
                <FileCheck2 size={23} />
                <div>
                  <h3>{item.kind}</h3>
                  <p>Invoice · {item.invoiceId.slice(0, 12)}</p>
                  <p>{dateTime(item.createdAt, i18n.language)}</p>
                  <Status value={item.status} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
        <div className="section-heading compact-heading">
          <h2>{t('pendingPayments')}</h2>
        </div>
        <div className="record-list">
          {(query.data?.pending || []).map((item) => (
            <article className="record-card" key={item.id}>
              <Wallet size={24} />
              <div>
                <h3>
                  {item.provider} · {item.id.slice(0, 8)}
                </h3>
                <Status value={item.status} />
                <p>{dateTime(item.createdAt, i18n.language)}</p>
              </div>
              <strong>
                {money(item.amountMinor, i18n.language)} {t('currency')}
              </strong>
            </article>
          ))}
        </div>
        {!query.data?.pending.length && <Empty />}
        <div className="section-heading compact-heading">
          <h2>{t('refundHistory')}</h2>
        </div>
        {query.data?.refunds.length ? (
          <div className="record-list">
            {query.data.refunds.map((item) => (
              <article className="record-card" key={item.id}>
                <Wallet size={22} />
                <div>
                  <Status value={item.status} />
                  <p>{item.reason}</p>
                  <small>{dateTime(item.createdAt, i18n.language)}</small>
                </div>
                <strong>
                  {money(item.amountMinor, i18n.language)} {t('currency')}
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
    </>
  );
}
export { AdminData } from './Management';
