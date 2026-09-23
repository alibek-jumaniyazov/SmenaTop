import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  FileText,
  Heart,
  Send,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { list, useApi, useSession } from '../api';
import type { Application, Assignment, Catalog, Page, Shift } from '../api';
import { Empty, PageHeading, QueryState, Status, dateOnly, dateTime } from '../components';
import { useOrganization } from './Employer';
import { OrganizationOnboarding } from './EmployerForms';
import { workspaceCopy } from './workspace-copy';
import '../styles/product-workspace.css';

function QuickLink({
  to,
  title,
  text,
  icon: Icon,
}: {
  to: string;
  title: string;
  text: string;
  icon: LucideIcon;
}) {
  return (
    <Link to={to} className="hub-quick-link">
      <Icon />
      <strong>{title}</strong>
      <p>{text}</p>
    </Link>
  );
}
function useCurrentTime() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function WorkerDashboard() {
  const { t, i18n } = useTranslation();
  const copy = workspaceCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const session = useSession();
  const assignments = useApi<Page<Assignment>>('/worker/assignments');
  const applications = useApi<Page<Application>>('/worker/applications');
  const catalog = useApi<Catalog>('/catalog');
  const now = useCurrentTime();
  const profile = session.data?.workerProfile;
  const city = catalog.data?.cities.find((item) => item.id === profile?.cityId)?.[
    i18n.language === 'ru' ? 'nameRu' : 'nameUz'
  ];
  const upcoming = list(assignments.data)
    .filter(
      (item) =>
        item.status === 'CHECKED_IN' ||
        (item.status === 'CONFIRMED' && new Date(item.shift.endAt).getTime() > now),
    )
    .sort((a, b) => a.shift.startAt.localeCompare(b.shift.startAt));
  const pending = list(applications.data).filter((item) =>
    ['SUBMITTED', 'SHORTLISTED'].includes(item.status),
  );
  const offered = list(applications.data).filter(
    (item) =>
      item.status === 'OFFERED' &&
      item.shift.status === 'PUBLISHED' &&
      new Date(item.shift.startAt).getTime() > now &&
      item.offers.some(
        (offer) => offer.status === 'PENDING' && new Date(offer.expiresAt).getTime() > now,
      ),
  );
  const refresh = () => {
    void assignments.refetch();
    void applications.refetch();
  };
  return (
    <div className="product-workspace">
      <PageHeading
        eyebrow={dateOnly(new Date(now).toISOString(), i18n.language)}
        title={
          session.data?.user.name
            ? `${t('today')}, ${session.data.user.name.split(' ')[0]}`
            : copy.dashboardTitle
        }
        text={copy.dashboardText}
        action={
          <Link className="button button-primary" to="/worker/shifts">
            {t('findShift')}
            <ArrowUpRight size={18} />
          </Link>
        }
      />
      <QueryState
        pending={assignments.isPending || applications.isPending}
        error={assignments.error || applications.error}
        retry={refresh}
      >
        {offered.length > 0 && (
          <section className="hub-offer-banner">
            <div>
              <h2>
                {copy.pendingOffers} · {offered.length}
              </h2>
              <p>{copy.pendingOffersText}</p>
            </div>
            <Link className="button button-primary" to="/worker/applications?status=offers">
              {copy.reviewOffers}
              <ArrowRight size={17} />
            </Link>
          </section>
        )}
        <div className="hub-stat-grid">
          <Link to="/worker/applications?status=offers">
            <Send />
            <div>
              <strong>{offered.length}</strong>
              <span>{copy.offers}</span>
            </div>
          </Link>
          <Link to="/worker/applications?status=active">
            <FileText />
            <div>
              <strong>{pending.length}</strong>
              <span>{copy.inProgress}</span>
            </div>
          </Link>
          <Link to="/worker/assignments">
            <CalendarDays />
            <div>
              <strong>{upcoming.length}</strong>
              <span>{copy.nextShift}</span>
            </div>
          </Link>
        </div>
        <div className="hub-layout">
          <section>
            <div className="hub-title">
              <h2>{copy.nextShift}</h2>
              <Link to="/worker/assignments">{t('assignments')} ↗</Link>
            </div>
            {upcoming.length ? (
              <div className="hub-next-shifts">
                {upcoming.slice(0, 5).map((item) => (
                  <Link
                    className="hub-next-shift"
                    to={`/worker/assignments/${item.id}`}
                    key={item.id}
                  >
                    <div className="hub-date">
                      <strong>
                        {new Date(item.shift.startAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          timeZone: 'Asia/Tashkent',
                        })}
                      </strong>
                      <span>
                        {dateOnly(item.shift.startAt, i18n.language).split(' ').slice(1).join(' ')}
                      </span>
                    </div>
                    <div className="hub-shift-info">
                      <Status value={item.status} />
                      <h3>{item.shift.title}</h3>
                      <p>{item.shift.organization.name}</p>
                      <p>
                        {dateTime(item.shift.startAt, i18n.language)} →{' '}
                        {dateTime(item.shift.endAt, i18n.language)}
                      </p>
                    </div>
                    <ArrowUpRight size={20} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title={copy.noUpcoming}
                text={copy.noUpcomingText}
                action={
                  <Link className="button button-primary" to="/worker/shifts">
                    {t('findShift')}
                    <ArrowRight size={16} />
                  </Link>
                }
              />
            )}
          </section>
          <aside className="hub-profile-card">
            <div className="hub-profile-top">
              <span className="inbox-avatar">{session.data?.user.name?.slice(0, 1) || 'S'}</span>
              <div>
                <strong>{session.data?.user.name || t('worker')}</strong>
                <small>{city || t('profile')}</small>
              </div>
            </div>
            <Status value={profile?.verificationStatus || 'UNVERIFIED'} />
            <h3>{copy.profileReady}</h3>
            <p>{copy.profileHint}</p>
            <Link className="button button-outline" to="/worker/profile">
              {copy.profileLink}
              <ArrowRight size={16} />
            </Link>
            <div className="hub-divider" />
            <Link
              className="hub-side-link"
              to={`/worker/shifts${profile?.cityId ? '?cityId=' + encodeURIComponent(profile.cityId) : ''}`}
            >
              {profile?.cityId ? copy.searchForCity : t('findShift')}
              <ArrowUpRight size={17} />
            </Link>
            <Link className="hub-side-link" to="/worker/availability">
              {copy.manageTime}
              <Clock3 size={17} />
            </Link>
          </aside>
        </div>
      </QueryState>
      <div className="hub-quick-links" aria-label={copy.quickAccess}>
        <QuickLink
          to="/worker/applications"
          icon={FileText}
          title={t('applications')}
          text={copy.applicationsHint}
        />
        <QuickLink
          to="/worker/availability"
          icon={CalendarDays}
          title={copy.manageTime}
          text={copy.manageTimeHint}
        />
        <QuickLink to="/worker/favorites" icon={Heart} title={copy.saved} text={copy.savedHint} />
      </div>
    </div>
  );
}

export function EmployerDashboard() {
  const { t, i18n } = useTranslation();
  const copy = workspaceCopy[i18n.language === 'ru' ? 'ru' : 'uz'];
  const membership = useOrganization();
  const canReadShifts = !!membership?.permissions.includes('shift.read');
  const canReview = !!membership?.permissions.includes('application.review');
  const canCreate = !!membership?.permissions.includes('shift.create');
  const shifts = useApi<Page<Shift>>(
    `/organizations/${membership?.organizationId}/shifts`,
    canReadShifts,
  );
  const applications = useApi<Page<Application>>(
    `/organizations/${membership?.organizationId}/applications`,
    canReview,
  );
  const now = useCurrentTime();
  const items = list(shifts.data);
  const upcoming = items
    .filter(
      (item) =>
        ['PUBLISHED', 'IN_PROGRESS'].includes(item.status) && new Date(item.endAt).getTime() > now,
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (!membership) return <OrganizationOnboarding />;
  return (
    <div className="product-workspace">
      <PageHeading
        eyebrow={copy.companyWorkspace}
        title={membership.organization.name}
        text={copy.companyIntro}
        action={
          canCreate ? (
            <Link className="button button-primary" to="/employer/shifts/new">
              {t('newShift')}
              <ArrowUpRight size={18} />
            </Link>
          ) : (
            <Link className="button button-outline" to="/employer/profile">
              {copy.companyProfile}
            </Link>
          )
        }
      />
      <div className="hub-quick-links">
        <QuickLink
          to="/employer/profile"
          icon={Building2}
          title={copy.companyProfile}
          text={copy.companyProfileHint}
        />
        {canReview && (
          <QuickLink
            to="/employer/applications"
            icon={Users}
            title={copy.candidates}
            text={copy.candidatesHint}
          />
        )}{' '}
        {canReadShifts && (
          <QuickLink
            to="/employer/calendar"
            icon={CalendarDays}
            title={t('calendar')}
            text={copy.calendarHint}
          />
        )}
      </div>
      <QueryState
        pending={(canReadShifts && shifts.isPending) || (canReview && applications.isPending)}
        error={shifts.error || applications.error}
        retry={() => {
          void shifts.refetch();
          if (canReview) void applications.refetch();
        }}
      >
        <div className="hub-stat-grid">
          {canReadShifts && (
            <>
              <Link to="/employer/calendar">
                <CalendarDays />
                <div>
                  <strong>{upcoming.length}</strong>
                  <span>{copy.nextShift}</span>
                </div>
              </Link>
              <Link to="/employer/calendar">
                <Users />
                <div>
                  <strong>
                    {upcoming.reduce((sum, item) => sum + (item.filledCount || 0), 0)}
                  </strong>
                  <span>{t('filledPlaces')}</span>
                </div>
              </Link>
            </>
          )}
          {canReview && (
            <Link to="/employer/applications?status=active">
              <FileText />
              <div>
                <strong>
                  {
                    list(applications.data).filter((item) =>
                      ['SUBMITTED', 'SHORTLISTED'].includes(item.status),
                    ).length
                  }
                </strong>
                <span>{t('pendingApplications')}</span>
              </div>
            </Link>
          )}
        </div>
        {canReadShifts && (
          <>
            <div className="hub-title">
              <h2>{copy.nextShift}</h2>
              <Link to="/employer/calendar">{t('calendar')} ↗</Link>
            </div>
            {upcoming.length ? (
              <div className="hub-next-shifts">
                {upcoming.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    className="hub-next-shift"
                    to={canCreate ? `/employer/shifts/${item.id}/edit` : '/employer/calendar'}
                  >
                    <div className="hub-date">
                      <strong>
                        {new Date(item.startAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          timeZone: 'Asia/Tashkent',
                        })}
                      </strong>
                      <span>
                        {dateOnly(item.startAt, i18n.language).split(' ').slice(1).join(' ')}
                      </span>
                    </div>
                    <div className="hub-shift-info">
                      <Status value={item.status} />
                      <h3>{item.title}</h3>
                      <p>
                        {item.branch.name} · {item.filledCount || 0}/{item.headcount}
                      </p>
                      <p>
                        {dateTime(item.startAt, i18n.language)} →{' '}
                        {dateTime(item.endAt, i18n.language)}
                      </p>
                    </div>
                    <ArrowUpRight size={20} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title={copy.noUpcoming}
                action={
                  canCreate ? (
                    <Link className="button button-primary" to="/employer/shifts/new">
                      {t('newShift')}
                    </Link>
                  ) : undefined
                }
              />
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
