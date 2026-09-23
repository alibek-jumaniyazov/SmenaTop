import { localToolsEnabled } from '../environment';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Code2, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, useAction, useSession } from '../api';
import type { Session } from '../api';
import { ErrorState, Feedback, Logo, PageHeading, PublicLayout, QueryState } from '../components';

export const phoneSchema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) });
export const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [challenge, setChallenge] = useState<string>();
  const [phone, setPhone] = useState('');
  const [devKey, setDevKey] = useState('');
  const [inbox, setInbox] = useState<unknown>();
  const [inboxError, setInboxError] = useState<unknown>();
  const request = useAction<{ challengeId: string; expiresAt: string }>('/auth/otp/request');
  const verify = useAction<Session>('/auth/otp/verify');
  const phoneForm = useForm({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '+998' },
  });
  const otpForm = useForm({ resolver: zodResolver(otpSchema), defaultValues: { code: '' } });
  return (
    <PublicLayout>
      <div className="container auth-layout">
        <div className="auth-story">
          <span className="eyebrow">SMENATOP / SALOM</span>
          <h1>{t('authTitle')}</h1>
          <div className="auth-time-art" aria-hidden="true">
            <span>09:00</span>
            <i />
            <strong>17:00</strong>
            <div>
              <CheckMark />
              {t('yourDay')}
            </div>
          </div>
          <p>{t('workerPayNote')}</p>
        </div>
        <section className="auth-card panel">
          <div className="auth-icon">
            <Smartphone size={28} />
          </div>
          <h2>{challenge ? t('otp') : t('login')}</h2>
          <p>{challenge ? t('otpSent') : t('authText')}</p>
          {!challenge ? (
            <form
              className="form-stack"
              onSubmit={phoneForm.handleSubmit((data) => {
                setPhone(data.phone);
                request.mutate(data, { onSuccess: (result) => setChallenge(result.challengeId) });
              })}
            >
              <label>
                {t('phone')}
                <input
                  autoFocus
                  type="tel"
                  aria-label={t('phone')}
                  aria-invalid={!!phoneForm.formState.errors.phone}
                  aria-describedby={phoneForm.formState.errors.phone ? 'phone-error' : undefined}
                  autoComplete="tel"
                  placeholder="+998 90 123 45 67"
                  {...phoneForm.register('phone')}
                />
                {phoneForm.formState.errors.phone && (
                  <span id="phone-error" className="field-error" role="alert">
                    {t('invalidPhone')}
                  </span>
                )}
              </label>
              <button className="button button-primary" disabled={request.isPending}>
                {t('sendCode')}
                <ArrowRight size={18} />
              </button>
              <Feedback error={request.error} />
            </form>
          ) : (
            <form
              className="form-stack"
              onSubmit={otpForm.handleSubmit((data) =>
                verify.mutate(
                  { challengeId: challenge, code: data.code },
                  {
                    onSuccess: async (result) => {
                      setCsrf(result.csrfToken);
                      qc.setQueryData(['session'], result);
                      if (result.user.platformPermissions.length) {
                        const mfa = await api<{ required: boolean; verified: boolean }>(
                          '/auth/mfa',
                        );
                        if (mfa.required && !mfa.verified) {
                          navigate('/auth/mfa');
                          return;
                        }
                      }
                      const next = params.get('next');
                      navigate(
                        next?.startsWith('/') && !next.startsWith('//')
                          ? next
                          : params.get('intent') === 'employer'
                            ? '/employer/onboarding'
                            : '/context',
                        { replace: true },
                      );
                    },
                  },
                ),
              )}
            >
              <label>
                {t('otp')}
                <input
                  autoFocus
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  {...otpForm.register('code')}
                />
                {otpForm.formState.errors.code && (
                  <span className="field-error">{t('invalidCode')}</span>
                )}
              </label>
              <button className="button button-primary" disabled={verify.isPending}>
                {t('continue')}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setChallenge(undefined);
                  otpForm.reset();
                }}
              >
                {t('changePhone')}
              </button>
              <Feedback error={verify.error} />
            </form>
          )}
          <div className="auth-assurance">
            <ShieldCheck size={18} />
            <span>{t('phoneVerified')}</span>
          </div>
          {localToolsEnabled && challenge && (
            <details className="dev-inbox">
              <summary>{t('devInbox')}</summary>
              <p className="small">{t('devHint')}</p>
              <label>
                {t('devKey')}
                <input
                  type="password"
                  autoComplete="off"
                  value={devKey}
                  onChange={(event) => setDevKey(event.target.value)}
                />
              </label>
              <button
                className="button button-outline compact"
                onClick={async () => {
                  try {
                    setInboxError(undefined);
                    setInbox(
                      await api(`/developer/inbox?phone=${encodeURIComponent(phone)}`, {
                        headers: { 'x-dev-key': devKey },
                      }),
                    );
                  } catch (error) {
                    setInboxError(error);
                  }
                }}
              >
                {t('loadInbox')}
              </button>
              {inbox !== undefined && (
                <pre className="data-code">{JSON.stringify(inbox, null, 2)}</pre>
              )}
              {inboxError !== undefined && <ErrorState error={inboxError} />}
            </details>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
function CheckMark() {
  return <ShieldCheck size={22} />;
}
export function ContextPage() {
  const { t } = useTranslation();
  const query = useSession();
  return (
    <PublicLayout>
      <section className="container page-section">
        <PageHeading title={t('context')} text={t('contextHint')} />
        <QueryState pending={query.isPending} error={query.error}>
          <div className="context-grid">
            <Link
              className="context-card"
              to={query.data?.workerProfile ? '/worker' : '/worker/profile'}
            >
              <Users />
              <h2>{t('worker')}</h2>
              <p>{t('findShift')}</p>
              <ArrowRight />
            </Link>
            {query.data?.memberships.map((membership) => (
              <Link
                className="context-card"
                key={membership.organizationId}
                to={`/employer?org=${membership.organizationId}`}
                onClick={() => sessionStorage.setItem('smenatop-org', membership.organizationId)}
              >
                <Building2 />
                <h2>{membership.organization.name}</h2>
                <p>{t(`status_${membership.role}`, { defaultValue: membership.role })}</p>
                <ArrowRight />
              </Link>
            ))}
            <Link className="context-card new-context" to="/employer/onboarding">
              <Building2 />
              <h2>{t('createOrg')}</h2>
              <p>{t('forBusiness')}</p>
              <ArrowRight />
            </Link>
            {query.data?.user.platformPermissions.some((p) => !p.startsWith('developer.')) && (
              <Link
                className="context-card"
                to={
                  query.data?.user.platformPermissions.includes('verification.review')
                    ? '/admin'
                    : query.data?.user.platformPermissions.includes('billing.reconcile')
                      ? '/admin/billing'
                      : '/admin/support'
                }
              >
                <ShieldCheck />
                <h2>{t('admin')}</h2>
                <ArrowRight />
              </Link>
            )}
            {localToolsEnabled && (
              <Link className="context-card" to="/developer">
                <Code2 />
                <h2>{t('developer')}</h2>
                <ArrowRight />
              </Link>
            )}
          </div>
        </QueryState>
      </section>
    </PublicLayout>
  );
}
export function InvitationPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const mutation = useAction('/invitations/accept');
  return (
    <PublicLayout>
      <div className="container narrow page-section">
        <Logo />
        <PageHeading title={t('acceptInvite')} />
        <form
          className="panel form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ token });
          }}
        >
          <label>
            {t('token')}
            <input required value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
          <button className="button button-primary" disabled={mutation.isPending}>
            {t('acceptInvite')}
          </button>
          <Feedback error={mutation.error} success={mutation.isSuccess} />
          {mutation.isSuccess && <Link to="/context">{t('context')}</Link>}
        </form>
      </div>
    </PublicLayout>
  );
}
