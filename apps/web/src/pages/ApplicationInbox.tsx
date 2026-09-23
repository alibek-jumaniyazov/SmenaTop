import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  FileText,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { list, useApi } from '../api';
import type { Application, Catalog, Page } from '../api';
import { useUrlFilters } from '../use-url-filters';
import {
  Action,
  Empty,
  Modal,
  PageHeading,
  QueryState,
  Status,
  dateTime,
  money,
} from '../components';
import { useOrganization } from './Employer';
import { workspaceCopy } from './workspace-copy';
import '../styles/product-workspace.css';

const groups = {
  all: [],
  active: ['SUBMITTED', 'SHORTLISTED'],
  offers: ['OFFERED'],
  accepted: ['ACCEPTED'],
  closed: ['REJECTED', 'WITHDRAWN', 'EXPIRED'],
} as const;
type Group = keyof typeof groups;
const languageNames: Record<string, [string, string]> = {
  uz: ['O‘zbekcha', 'Узбекский'],
  ru: ['Ruscha', 'Русский'],
  en: ['Inglizcha', 'Английский'],
  tj: ['Tojikcha', 'Таджикский'],
  tg: ['Tojikcha', 'Таджикский'],
};

export function ApplicationInbox({ employer = false }: { employer?: boolean }) {
  const { t, i18n } = useTranslation();
  const copy = workspaceCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const membership = useOrganization();
  const canReview = !employer || !!membership?.permissions.includes('application.review');
  const query = useApi<Page<Application>>(
    employer ? `/organizations/${membership?.organizationId}/applications` : '/worker/applications',
    canReview,
  );
  const catalog = useApi<Catalog>('/catalog', employer);
  const [params, updateParams] = useUrlFilters();
  const requestedGroup = params.get('status');
  const group = (
    requestedGroup && Object.hasOwn(groups, requestedGroup) ? requestedGroup : 'all'
  ) as Group;
  const search = params.get('q') || '';
  const shift = params.get('shift') || '';
  const [selectedId, setSelectedId] = useState<string>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const items = list(query.data);
  const selected = items.find((item) => item.id === selectedId);
  const update = (key: string, value: string) => {
    updateParams(
      (next) => {
        if (value && value !== 'all') next.set(key, value);
        else next.delete(key);
      },
      { replace: true },
    );
  };
  const matches = (item: Application, key: Group) =>
    key === 'all' || (groups[key] as readonly string[]).includes(item.status);
  const filtered = items.filter(
    (item) =>
      matches(item, group) &&
      (!shift || item.shift.id === shift) &&
      `${item.worker?.name || ''} ${item.worker?.workerProfile?.experience || ''} ${item.shift.title} ${item.shift.organization.name}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const shifts = Array.from(new Map(items.map((item) => [item.shift.id, item.shift])).values());
  const clear = () => {
    updateParams(
      (next) => {
        ['status', 'q', 'shift'].forEach((key) => next.delete(key));
      },
      { replace: true },
    );
  };
  const nameOf = (kind: 'cities' | 'categories', id: string) =>
    catalog.data?.[kind].find((item) => item.id === id)?.[
      i18n.language === 'ru' ? 'nameRu' : 'nameUz'
    ];
  const help = (status: string) =>
    ({
      SUBMITTED: copy.submittedHelp,
      SHORTLISTED: copy.shortlistedHelp,
      OFFERED: copy.offeredHelp,
      ACCEPTED: copy.acceptedHelp,
      REJECTED: copy.rejectedHelp,
      WITHDRAWN: copy.withdrawnHelp,
      EXPIRED: copy.expiredHelp,
    })[status];
  const candidateProfile = selected?.worker?.workerProfile;
  if (!canReview) return <Empty title={t('forbidden')} />;
  return (
    <div className="product-workspace application-workspace">
      <PageHeading
        eyebrow={employer ? 'SMENATOP / TEAM' : 'SMENATOP / WORK'}
        title={employer ? copy.candidates : t('applications')}
        text={employer ? copy.candidateIntro : copy.applicationsIntro}
        action={
          <Link
            className="button button-outline"
            to={employer ? '/employer/profile' : '/worker/profile'}
          >
            <FileText size={17} />
            {employer ? copy.companyProfile : copy.profileLink}
          </Link>
        }
      />
      <div className="inbox-tabs" role="group" aria-label={t('status')}>
        {(Object.keys(groups) as Group[]).map((key) => (
          <button key={key} aria-pressed={group === key} onClick={() => update('status', key)}>
            <span>{copy[key]}</span>
            <strong>
              {query.isPending ? '—' : items.filter((item) => matches(item, key)).length}
            </strong>
          </button>
        ))}
      </div>
      <div className="inbox-search panel">
        <label>
          <Search size={19} />
          <span className="sr-only">
            {employer ? copy.candidateSearch : copy.applicationSearch}
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => update('q', event.target.value)}
            placeholder={employer ? copy.candidateSearch : copy.applicationSearch}
          />
        </label>
        <label className="inbox-shift-filter">
          <SlidersHorizontal size={18} />
          <span className="sr-only">{copy.allShifts}</span>
          <select value={shift} onChange={(event) => update('shift', event.target.value)}>
            <option value="">{copy.allShifts}</option>
            {shifts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()}>
        <div className="inbox-result-count" role="status">
          <span>
            {copy.shown}: <strong>{filtered.length}</strong>
          </span>
          {(search || shift || group !== 'all') && <button onClick={clear}>{copy.reset}</button>}
        </div>
        {filtered.length ? (
          <div className="inbox-cards">
            {filtered.map((item) => {
              const activeOffers = item.offers?.filter((offer) => offer.status === 'PENDING') || [];
              const offerable =
                ['SUBMITTED', 'SHORTLISTED'].includes(item.status) &&
                item.shift.status === 'PUBLISHED' &&
                new Date(item.shift.startAt).getTime() > now;
              return (
                <article className="application-card panel inbox-card" key={item.id}>
                  <div className="inbox-card-heading">
                    <div className="inbox-identity">
                      <span className="inbox-avatar">
                        {employer ? (
                          item.worker?.name?.slice(0, 1) || <Users size={22} />
                        ) : (
                          <BriefcaseBusiness size={23} />
                        )}
                      </span>
                      <div>
                        <span className="inbox-overline">
                          {employer ? item.shift.title : item.shift.organization.name}
                        </span>
                        <h2>
                          {employer ? (
                            <button
                              className="candidate-name"
                              onClick={() => setSelectedId(item.id)}
                            >
                              {item.worker?.name || copy.notProvided}
                            </button>
                          ) : (
                            <Link to={`/worker/shifts/${item.shift.id}`}>{item.shift.title}</Link>
                          )}
                        </h2>
                      </div>
                    </div>
                    <Status value={item.status} />
                  </div>
                  <div className="inbox-job-meta">
                    <span>
                      <CalendarDays size={16} />
                      {dateTime(item.shift.startAt, i18n.language)} →{' '}
                      {dateTime(item.shift.endAt, i18n.language)}
                    </span>
                    <span>
                      <MapPin size={16} />
                      {item.shift.branch?.area || item.shift.branch?.name}
                    </span>
                    <strong>
                      {money(item.shift.amountMinor, i18n.language)} {t('currency')}{' '}
                      <small>{t(item.shift.payType === 'HOURLY' ? 'perHour' : 'fixed')}</small>
                    </strong>
                  </div>
                  {employer && item.worker?.workerProfile && (
                    <div className="inbox-profile-summary">
                      <Status value={item.worker.workerProfile.verificationStatus} />
                      <p>{item.worker.workerProfile.experience || copy.notProvided}</p>
                    </div>
                  )}
                  {item.note && (
                    <p className="inbox-note">
                      <FileText size={16} />
                      {item.note}
                    </p>
                  )}
                  {!employer && <p className="inbox-status-help">{help(item.status)}</p>}
                  {activeOffers.map((offer) => {
                    const valid =
                      new Date(offer.expiresAt).getTime() > now &&
                      new Date(item.shift.startAt).getTime() > now &&
                      item.status === 'OFFERED' &&
                      item.shift.status === 'PUBLISHED';
                    return (
                      <div className="offer-panel inbox-offer" key={offer.id}>
                        <div>
                          <strong>{valid ? t('offer') : copy.expiredOffer}</strong>
                          <p>
                            {t('offerExpires')}: {dateTime(offer.expiresAt, i18n.language)}
                          </p>
                          <small>{t('offerNoReserve')}</small>
                        </div>
                        {employer ? (
                          <Action path={`/offers/${offer.id}/revoke`} label={t('revoke')} />
                        ) : valid ? (
                          <Action
                            path={`/offers/${offer.id}/accept`}
                            label={t('acceptOffer')}
                            className="button button-primary"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="inbox-card-actions">
                    {employer ? (
                      <>
                        <button
                          className="button button-outline"
                          onClick={() => setSelectedId(item.id)}
                        >
                          <FileText size={16} />
                          {copy.viewProfile}
                        </button>
                        {offerable && (
                          <Action
                            path={`/applications/${item.id}/offer`}
                            label={t('offer')}
                            body={{
                              expiresAt: new Date(
                                Math.min(
                                  new Date(item.shift.startAt).getTime(),
                                  now + 24 * 3600000,
                                ),
                              ).toISOString(),
                            }}
                            className="button button-primary"
                          />
                        )}
                        {['SUBMITTED', 'SHORTLISTED'].includes(item.status) && (
                          <Action path={`/applications/${item.id}/reject`} label={t('reject')} />
                        )}
                      </>
                    ) : (
                      <>
                        <Link
                          className="button button-outline"
                          to={
                            item.status === 'ACCEPTED'
                              ? '/worker/assignments'
                              : `/worker/shifts/${item.shift.id}`
                          }
                        >
                          {item.status === 'ACCEPTED' ? t('assignments') : t('details')}
                          <ArrowUpRight size={16} />
                        </Link>
                        {['SUBMITTED', 'SHORTLISTED', 'OFFERED'].includes(item.status) && (
                          <Action
                            reason
                            path={`/applications/${item.id}/withdraw`}
                            label={t('withdraw')}
                          />
                        )}
                      </>
                    )}
                  </div>
                  {employer && ['SUBMITTED', 'SHORTLISTED'].includes(item.status) && !offerable && (
                    <p className="inbox-status-help">{copy.unavailableHelp}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              items.length ? copy.noResults : employer ? copy.noCandidates : copy.noApplications
            }
            text={
              items.length
                ? copy.noResultsText
                : employer
                  ? copy.noCandidatesText
                  : copy.noApplicationsText
            }
            action={
              items.length ? (
                <button className="button button-outline" onClick={clear}>
                  {copy.reset}
                </button>
              ) : !employer || membership?.permissions.includes('shift.create') ? (
                <Link
                  className="button button-primary"
                  to={employer ? '/employer/shifts/new' : '/worker/shifts'}
                >
                  {t(employer ? 'newShift' : 'findShift')}
                  <ArrowRight size={17} />
                </Link>
              ) : membership?.permissions.includes('shift.read') ? (
                <Link className="button button-outline" to="/employer/calendar">
                  {t('calendar')}
                  <ArrowRight size={17} />
                </Link>
              ) : undefined
            }
          />
        )}
        {items.length >= (employer ? 200 : 100) && (
          <p className="small muted">{copy.recentLimit}</p>
        )}
      </QueryState>
      {selected && (
        <Modal
          open={!!selected}
          onClose={() => setSelectedId(undefined)}
          title={copy.profile}
          className="candidate-resume-dialog"
        >
          <div className="candidate-resume">
            <header>
              <span className="inbox-avatar large">
                {selected.worker?.name?.slice(0, 1) || 'S'}
              </span>
              <div>
                <h3>{selected.worker?.name || copy.notProvided}</h3>
                <p>{candidateProfile && nameOf('cities', candidateProfile.cityId)}</p>
                {candidateProfile && <Status value={candidateProfile.verificationStatus} />}
              </div>
            </header>
            <div className="candidate-application-context">
              <span>{copy.appliedFor}</span>
              <strong>{selected.shift.title}</strong>
              <p>
                {dateTime(selected.shift.startAt, i18n.language)} →{' '}
                {dateTime(selected.shift.endAt, i18n.language)}
              </p>
              <Status value={selected.status} />
            </div>
            <section>
              <h4>
                <BriefcaseBusiness size={17} />
                {copy.roles}
              </h4>
              <div className="resume-tags">
                {candidateProfile?.categoryIds?.length ? (
                  candidateProfile.categoryIds
                    .map((id) => nameOf('categories', id))
                    .filter(Boolean)
                    .map((name) => <span key={name}>{name}</span>)
                ) : (
                  <p>{copy.notProvided}</p>
                )}
              </div>
            </section>
            <section>
              <h4>
                <FileText size={17} />
                {copy.experience}
              </h4>
              <p className="resume-prose">{candidateProfile?.experience || copy.notProvided}</p>
            </section>
            <section>
              <h4>
                <CheckCheck size={17} />
                {copy.skills}
              </h4>
              <div className="resume-skills">
                {candidateProfile?.skills?.length ? (
                  candidateProfile.skills.map((skill) => (
                    <div key={skill.skillId}>
                      <strong>
                        {skill.skill?.[i18n.language === 'ru' ? 'nameRu' : 'nameUz'] ||
                          copy.notProvided}
                      </strong>
                      <Status value={skill.status} />
                    </div>
                  ))
                ) : (
                  <p>{copy.notProvided}</p>
                )}
              </div>
            </section>
            <section>
              <h4>{copy.languages}</h4>
              <div className="resume-tags">
                {candidateProfile?.languages?.length ? (
                  candidateProfile.languages.map((language) => (
                    <span key={language}>
                      {languageNames[language]?.[i18n.language === 'ru' ? 1 : 0] || language}
                    </span>
                  ))
                ) : (
                  <p>{copy.notProvided}</p>
                )}
              </div>
            </section>
            {selected.note && (
              <section>
                <h4>{copy.note}</h4>
                <p className="resume-prose">{selected.note}</p>
              </section>
            )}
            <p className="resume-privacy">
              <ShieldCheck size={18} />
              {copy.privacy}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
