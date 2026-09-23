import { appEnvironment, localToolsEnabled } from './environment';
import { Component, Suspense, lazy, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from './api';
import { ErrorState, Loading, Shell } from './components';
import { Landing as Public } from './pages/Landing';

const Mfa = lazy(() => import('./pages/Security').then((m) => ({ default: m.MfaPage })));
const Auth = lazy(() => import('./pages/Auth').then((m) => ({ default: m.AuthPage })));
const Context = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ContextPage })));
const Invitation = lazy(() => import('./pages/Auth').then((m) => ({ default: m.InvitationPage })));
const Search = lazy(() => import('./pages/Public').then((m) => ({ default: m.ShiftSearch })));
const Shift = lazy(() => import('./pages/Public').then((m) => ({ default: m.ShiftDetail })));
const Pricing = lazy(() => import('./pages/Public').then((m) => ({ default: m.Pricing })));
const Info = lazy(() => import('./pages/Public').then((m) => ({ default: m.InfoPage })));
const NotFound = lazy(() => import('./pages/Public').then((m) => ({ default: m.NotFound })));
const Worker = lazy(() =>
  import('./pages/Dashboards').then((m) => ({ default: m.WorkerDashboard })),
);
const Profile = lazy(() =>
  import('./pages/Worker').then((m) => ({ default: m.WorkerProfilePage })),
);
const Availability = lazy(() =>
  import('./pages/Worker').then((m) => ({ default: m.AvailabilityPage })),
);
const Applications = lazy(() =>
  import('./pages/ApplicationInbox').then((m) => ({ default: m.ApplicationInbox })),
);
const Assignments = lazy(() =>
  import('./pages/Worker').then((m) => ({ default: m.AssignmentsPage })),
);
const Favorites = lazy(() => import('./pages/Worker').then((m) => ({ default: m.FavoritesPage })));
const Settings = lazy(() => import('./pages/Worker').then((m) => ({ default: m.SettingsPage })));
const OrganizationSettings = lazy(() =>
  import('./pages/Management').then((m) => ({ default: m.OrganizationSettings })),
);
const Employer = lazy(() =>
  import('./pages/Dashboards').then((m) => ({ default: m.EmployerDashboard })),
);
const Onboarding = lazy(() =>
  import('./pages/Employer').then((m) => ({ default: m.OrganizationOnboarding })),
);
const ShiftForm = lazy(() => import('./pages/Employer').then((m) => ({ default: m.ShiftForm })));
const Calendar = lazy(() => import('./pages/Employer').then((m) => ({ default: m.CalendarPage })));
const Candidates = Applications;
const Team = lazy(() => import('./pages/Employer').then((m) => ({ default: m.TeamPage })));
const Analytics = lazy(() =>
  import('./pages/Employer').then((m) => ({ default: m.AnalyticsPage })),
);
const AssignmentDetail = lazy(() =>
  import('./pages/Operations').then((m) => ({ default: m.AssignmentDetail })),
);
const Wages = lazy(() => import('./pages/Operations').then((m) => ({ default: m.WagePage })));
const Messages = lazy(() =>
  import('./pages/Operations').then((m) => ({ default: m.MessagesPage })),
);
const Notifications = lazy(() =>
  import('./pages/Operations').then((m) => ({ default: m.NotificationsPage })),
);
const Billing = lazy(() => import('./pages/Operations').then((m) => ({ default: m.BillingPage })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminQueue })));
const AdminBilling = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminBilling })));
const AdminData = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminData })));
const Developer = lazy(() => import('./pages/Admin').then((m) => ({ default: m.DeveloperPage })));

function Guard({
  zone,
  children,
}: {
  zone?: 'worker' | 'employer' | 'admin' | 'developer';
  children: ReactNode;
}) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Loading />;
  if (session.error) {
    if (session.error.message.includes('MFA_REQUIRED')) return <Navigate to="/auth/mfa" replace />;
    return <ErrorState error={session.error} />;
  }
  if (!session.data)
    return (
      <Navigate
        to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (zone === 'admin' && !session.data.user.platformPermissions.length)
    return <NotFound forbidden />;
  if (zone === 'developer' && !localToolsEnabled) return <NotFound forbidden />;
  if (zone) return <Shell zone={zone}>{children}</Shell>;
  return <>{children}</>;
}
function EmployerRoutes() {
  const session = useSession();
  const stored = sessionStorage.getItem('smenatop-org');
  const orgId =
    session.data?.memberships.find((m) => m.organizationId === stored)?.organizationId ||
    session.data?.memberships[0]?.organizationId;
  return (
    <Routes>
      <Route index element={<Employer />} />
      <Route path="onboarding" element={<Onboarding />} />
      <Route path="calendar" element={<Calendar />} />
      <Route path="shifts/new" element={<ShiftForm />} />
      <Route path="shifts/:id/edit" element={<ShiftForm />} />
      <Route path="applications" element={<Candidates employer />} />
      <Route path="assignments" element={<Assignments employer organizationId={orgId} />} />
      <Route path="assignments/:id" element={<AssignmentDetail employer />} />
      <Route path="wages" element={<Wages organizationId={orgId} />} />
      <Route path="messages" element={<Messages organizationId={orgId} />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="billing" element={orgId ? <Billing organizationId={orgId} /> : <Onboarding />} />
      <Route path="team" element={<Team />} />
      <Route path="analytics" element={<Analytics />} />
      <Route path="settings" element={<OrganizationSettings />} />
      <Route path="profile" element={<OrganizationSettings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* No PII or request payloads are emitted to the browser console. */
  }
  render() {
    return this.state.error ? (
      <div className="container page-section">
        <ErrorState error={this.state.error} retry={() => location.reload()} />
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        {t('skip')}
      </a>
      {localToolsEnabled && (
        <div className="environment-banner">
          {t(appEnvironment === 'staging' ? 'stagingBanner' : 'localBanner')}
        </div>
      )}
      {!online && (
        <div className="offline-banner" role="status">
          {t('offline')}
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Public />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/mfa" element={<Mfa />} />
          <Route path="/auth/session-expired" element={<Auth />} />
          <Route
            path="/context"
            element={
              <Guard>
                <Context />
              </Guard>
            }
          />
          <Route
            path="/invite"
            element={
              <Guard>
                <Invitation />
              </Guard>
            }
          />
          <Route path="/shifts" element={<Search />} />
          <Route path="/shifts/:id" element={<Shift />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/how-it-works" element={<Info kind="how" />} />
          <Route path="/workers" element={<Info kind="workers" />} />
          <Route path="/business" element={<Info kind="business" />} />
          {(['faq', 'help', 'privacy', 'terms'] as const).map((kind) => (
            <Route key={kind} path={`/${kind}`} element={<Info kind={kind} />} />
          ))}
          <Route
            path="/worker/*"
            element={
              <Guard zone="worker">
                <Routes>
                  <Route index element={<Worker />} />
                  <Route path="shifts" element={<Search worker />} />
                  <Route path="shifts/:id" element={<Shift worker />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="availability" element={<Availability />} />
                  <Route path="applications" element={<Applications />} />
                  <Route path="assignments" element={<Assignments />} />
                  <Route path="assignments/:id" element={<AssignmentDetail />} />
                  <Route path="favorites" element={<Favorites />} />
                  <Route path="wages" element={<Wages />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Guard>
            }
          />
          <Route
            path="/employer/*"
            element={
              <Guard zone="employer">
                <EmployerRoutes />
              </Guard>
            }
          />
          <Route
            path="/admin/*"
            element={
              <Guard zone="admin">
                <Routes>
                  <Route index element={<Admin />} />
                  <Route path="billing" element={<AdminBilling />} />
                  <Route path="support" element={<Admin support />} />
                  <Route path="audit" element={<AdminData kind="audit" />} />
                  <Route path="catalogs" element={<AdminData kind="catalogs" />} />
                  <Route path="health" element={<AdminData kind="health" />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Guard>
            }
          />
          <Route
            path="/developer/*"
            element={
              <Guard zone="developer">
                <Developer />
              </Guard>
            }
          />
          <Route path="/403" element={<NotFound forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
