import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAction, useApi } from '../api';
import type { Catalog, Organization } from '../api';
import { Empty, Feedback, PageHeading, QueryState, Status, dateTime } from '../components';
import { useOrganization } from './Employer';
import { TextForm } from './Operations';

interface Analytics {
  openShifts: number;
  confirmedAssignments: number;
  pendingApplications: number;
  pendingTimesheets: number;
  noShows: number;
  capacity: number;
  fillRate: number;
  denominator: number;
  period: string;
}
export function AnalyticsPage() {
  const { t } = useTranslation();
  const orgId = useOrganization()?.organizationId;
  const query = useApi<Analytics>(`/organizations/${orgId}/analytics`, !!orgId);
  const stats = query.data;
  return (
    <>
      <PageHeading title={t('analytics')} text={t('allTime')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {stats && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <CalendarDays />
                <span>{t('openShifts')}</span>
                <strong>{stats.openShifts}</strong>
              </div>
              <div className="stat-card">
                <Users />
                <span>{t('filledPlaces')}</span>
                <strong>{stats.confirmedAssignments}</strong>
              </div>
              <div className="stat-card">
                <Activity />
                <span>{t('fillRate')}</span>
                <strong>{Math.round(stats.fillRate * 100)}%</strong>
              </div>
            </div>
            <section className="panel analytics-fill">
              <div className="record-heading">
                <h2>{t('fillRate')}</h2>
                <strong>
                  {stats.confirmedAssignments} / {stats.denominator}
                </strong>
              </div>
              <div
                className="fill-track"
                role="meter"
                aria-label={t('fillRate')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(stats.fillRate * 100)}
              >
                <span style={{ width: `${Math.min(100, stats.fillRate * 100)}%` }} />
              </div>
              <p>{t('fillFormula')}</p>
              <small className="muted">{t('allTime')}</small>
            </section>
            <div className="analytics-queues">
              {[
                ['pendingApplications', stats.pendingApplications, '/employer/applications'],
                ['pendingTimesheets', stats.pendingTimesheets, '/employer/assignments'],
                ['noShows', stats.noShows, '/employer/assignments'],
              ].map(([label, value, path]) => (
                <Link className="panel" key={String(label)} to={String(path)}>
                  <span>{t(String(label))}</span>
                  <strong>{value}</strong>
                  <ArrowRight size={20} />
                </Link>
              ))}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
interface OrgWithRoles extends Organization {
  roles?: { id: string; name: string; permissions: string[] }[];
}
export function TeamPage() {
  const { t, i18n } = useTranslation();
  const membership = useOrganization();
  const orgId = membership?.organizationId;
  const query = useApi<OrgWithRoles>(`/organizations/${orgId}`, !!orgId);
  const catalog = useApi<Catalog>('/catalog');
  const invite = useAction<{ token: string }>(`/organizations/${orgId}/invitations`);
  const [tab, setTab] = useState<'members' | 'branches' | 'roles'>('members');
  const [phone, setPhone] = useState('+998');
  const [role, setRole] = useState('MANAGER');
  const [branch, setBranch] = useState('');
  const [city, setCity] = useState('');
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const customRole = useAction(`/organizations/${orgId}/roles`);
  return (
    <>
      <PageHeading title={t('team')} />
      <div className="filter-chips">
        {(['members', 'branches', 'roles'] as const).map((key) => (
          <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {t(key === 'branches' ? 'branchLimit' : key)}
          </button>
        ))}
      </div>
      <div className="split-content">
        <div>
          <QueryState pending={query.isPending} error={query.error}>
            {tab === 'members' ? (
              <div className="record-list">
                {query.data?.memberships?.map((member, index) => (
                  <div className="record-card" key={member.id || index}>
                    <Users size={22} />
                    <div>
                      <h3>{member.user?.name || member.user?.phone}</h3>
                      <Status value={member.role} />
                    </div>
                  </div>
                ))}
              </div>
            ) : tab === 'branches' ? (
              <div className="record-list">
                {query.data?.branches?.map((item) => (
                  <div className="panel" key={item.id}>
                    <Building2 size={21} />
                    <h3>{item.name}</h3>
                    <p>{item.area}</p>
                    <small>{item.address}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="record-list">
                {query.data?.roles?.length ? (
                  query.data.roles.map((item) => (
                    <div className="panel" key={item.id}>
                      <h3>{item.name}</h3>
                      <div className="permission-list">
                        {item.permissions.map((permission) => (
                          <code key={permission}>{permission}</code>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty />
                )}
              </div>
            )}
          </QueryState>
        </div>
        <section className="panel">
          <h2>{t(tab === 'members' ? 'invite' : tab === 'branches' ? 'branchName' : 'newRole')}</h2>
          {tab === 'members' ? (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                invite.mutate({
                  phone,
                  role,
                  branchIds:
                    role === 'MANAGER'
                      ? [branch || query.data?.branches?.[0]?.id].filter(Boolean)
                      : [],
                });
              }}
            >
              <label>
                {t('phone')}
                <input
                  type="tel"
                  pattern="\+[1-9][0-9]{7,14}"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              <label>
                {t('role')}
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  {['MANAGER', 'ADMIN', 'FINANCE'].map((item) => (
                    <option key={item} value={item}>
                      {t(`status_${item}`)}
                    </option>
                  ))}
                </select>
              </label>
              {role === 'MANAGER' && (
                <label>
                  {t('branch')}
                  <select
                    required
                    value={branch || query.data?.branches?.[0]?.id || ''}
                    onChange={(event) => setBranch(event.target.value)}
                  >
                    {query.data?.branches?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button button-primary" disabled={invite.isPending}>
                {t('invite')}
                <ArrowRight size={18} />
              </button>
              <Feedback error={invite.error} success={invite.isSuccess} />
              {invite.data && (
                <label>
                  {t('token')}
                  <textarea
                    readOnly
                    value={`${location.origin}/invite?token=${encodeURIComponent(invite.data.token)}`}
                  />
                </label>
              )}
            </form>
          ) : tab === 'branches' ? (
            <div className="form-stack">
              <label>
                {t('city')}
                <select
                  value={city || query.data?.cityId || ''}
                  onChange={(event) => setCity(event.target.value)}
                >
                  {catalog.data?.cities.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
                    </option>
                  ))}
                </select>
              </label>
              <TextForm
                path={`/organizations/${orgId}/branches`}
                label={t('save')}
                fields={[
                  { name: 'name', label: 'branchName' },
                  { name: 'address', label: 'address' },
                  { name: 'area', label: 'area' },
                ]}
                body={{ cityId: city || query.data?.cityId }}
              />
            </div>
          ) : (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                customRole.mutate({ name: roleName, permissions });
              }}
            >
              <label>
                {t('name')}
                <input
                  required
                  minLength={2}
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
              </label>
              <fieldset>
                <legend>{t('permissions')}</legend>
                <div className="permission-checks">
                  {membership?.permissions.map((permission) => (
                    <label className="check-label" key={permission}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(permission)}
                        onChange={(event) =>
                          setPermissions(
                            event.target.checked
                              ? [...permissions, permission]
                              : permissions.filter((p) => p !== permission),
                          )
                        }
                      />
                      <code>{permission}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="button button-primary" disabled={customRole.isPending}>
                {t('save')}
              </button>
              <Feedback error={customRole.error} success={customRole.isSuccess} />
            </form>
          )}
        </section>
      </div>
    </>
  );
}
export { OrganizationSettings } from './OrganizationProfile';
interface Audit {
  id: string;
  action: string;
  actorId: string | null;
  resourceId: string | null;
  reason: string | null;
  createdAt: string;
}
export function AdminData({ kind }: { kind: 'audit' | 'catalogs' | 'health' }) {
  const { t, i18n } = useTranslation();
  const query = useApi<unknown>(
    kind === 'health' ? '/health' : kind === 'catalogs' ? '/admin/catalog' : '/admin/audit',
  );
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(true);
  return (
    <>
      <PageHeading title={t(kind)} text={kind === 'catalogs' ? undefined : t('readOnly')} />
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        {kind === 'audit' ? (
          <>
            <label className="audit-search">
              {t('search')}
              <input value={filter} onChange={(event) => setFilter(event.target.value)} />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('action')}</th>
                    <th>{t('actor')}</th>
                    <th>{t('reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {((query.data as Audit[]) || [])
                    .filter((item) =>
                      `${item.action} ${item.actorId} ${item.reason}`
                        .toLowerCase()
                        .includes(filter.toLowerCase()),
                    )
                    .map((item) => (
                      <tr key={item.id}>
                        <td>{dateTime(item.createdAt, i18n.language)}</td>
                        <td>
                          <code>{item.action}</code>
                          <small>{item.resourceId?.slice(0, 12)}</small>
                        </td>
                        <td>
                          <code>{item.actorId?.slice(0, 12) || '—'}</code>
                        </td>
                        <td>{item.reason || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : kind === 'catalogs' ? (
          <div className="split-content">
            <div>
              {(['cities', 'categories', 'skills'] as const).map((key) => (
                <section className="panel catalog-panel" key={key}>
                  <h2>
                    {t(key === 'cities' ? 'city' : key === 'categories' ? 'category' : 'skills')}
                  </h2>
                  <div className="record-list">
                    {(query.data as Catalog)?.[key]?.map((item) => (
                      <div className="catalog-row" key={item.id}>
                        <span>{item.nameUz}</span>
                        <span>{item.nameRu}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <section className="panel form-stack align-start">
              <h2>{t('city')}</h2>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                {t('status_ACTIVE')}
              </label>
              <TextForm
                path="/admin/catalog/cities"
                label={t('save')}
                fields={[
                  { name: 'code', label: 'catalogCode' },
                  { name: 'nameUz', label: 'nameUz' },
                  { name: 'nameRu', label: 'nameRu' },
                  { name: 'reason', label: 'reason', type: 'textarea' },
                ]}
                body={{ active }}
              />
            </section>
          </div>
        ) : (
          <div className="health-grid">
            {Object.entries((query.data || {}) as Record<string, unknown>)
              .filter(([, value]) => typeof value !== 'object')
              .map(([key, value]) => (
                <section className="panel" key={key}>
                  <Activity size={23} />
                  <h2>{t(key, { defaultValue: key })}</h2>
                  <strong>{String(value)}</strong>
                </section>
              ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
void ShieldCheck;
