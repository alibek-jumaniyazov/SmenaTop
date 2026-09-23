import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileCheck2, ShieldCheck, Upload } from 'lucide-react';
import { api, setCsrf, useAction, useApi } from '../api';
import { Empty, Feedback, PageHeading, PublicLayout, QueryState, Status } from '../components';

export function MfaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = useApi<{ enabled: boolean; verified: boolean; required: boolean }>('/auth/mfa');
  const setup = useAction<{ secret: string; uri: string; recoveryCodes: string[] }>(
    '/auth/mfa/setup',
  );
  const verify = useAction<{ verified: boolean; csrfToken: string }>('/auth/mfa/verify');
  const [code, setCode] = useState('');
  return (
    <PublicLayout>
      <div className="container narrow page-section">
        <PageHeading title={t('mfa')} text={t('mfaHint')} />
        <QueryState pending={query.isPending} error={query.error}>
          <section className="panel form-stack">
            <ShieldCheck size={35} />
            {!query.data?.enabled && !setup.data && (
              <button
                className="button button-primary"
                disabled={setup.isPending}
                onClick={() => setup.mutate({})}
              >
                {t('setupMfa')}
                <ArrowRight size={18} />
              </button>
            )}
            <Feedback error={setup.error} />
            {setup.data && (
              <>
                <p className="notice">{t('mfaRecoveryHint')}</p>
                <label>
                  {t('mfaSecret')}
                  <input value={setup.data.secret} readOnly />
                </label>
                <a className="text-link" href={setup.data.uri}>
                  {t('authenticator')}
                </a>
                <label>
                  {t('recoveryCodes')}
                  <textarea rows={8} readOnly value={setup.data.recoveryCodes.join('\n')} />
                </label>
              </>
            )}
            {(query.data?.enabled || setup.data) && (
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  verify.mutate(
                    { code },
                    {
                      onSuccess: (result) => {
                        setCsrf(result.csrfToken);
                        navigate('/context');
                      },
                    },
                  );
                }}
              >
                <label>
                  {t('mfaCode')}
                  <input
                    required
                    minLength={6}
                    maxLength={24}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
                <button className="button button-primary" disabled={verify.isPending}>
                  {t('confirm')}
                  <ShieldCheck size={18} />
                </button>
                <Feedback error={verify.error} />
              </form>
            )}
            {query.data?.verified && (
              <Link className="button button-outline" to="/context">
                {t('context')}
              </Link>
            )}
          </section>
        </QueryState>
      </div>
    </PublicLayout>
  );
}
interface FileAsset {
  id: string;
  originalName: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
export function PrivateFiles() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useApi<FileAsset[]>('/files');
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('required'));
      const body = new FormData();
      body.append('file', file);
      return api('/files', { method: 'POST', body });
    },
    onSuccess: async () => {
      setFile(null);
      await qc.invalidateQueries({ queryKey: ['api', '/files'] });
    },
  });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const result = await api<{ url: string }>(`/files/${id}/download`);
      const url = new URL(result.url, location.origin);
      if (url.origin !== location.origin) throw new Error('Unexpected file origin');
      location.assign(url.href);
    },
  });
  return (
    <section className="panel form-stack profile-form private-files">
      <PageHeading title={t('files')} text={t('fileHint')} />
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <label>
          {t('files')}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        </label>
        <button className="button button-outline align-start" disabled={upload.isPending || !file}>
          <Upload size={18} />
          {t('upload')}
        </button>
        <Feedback error={upload.error} success={upload.isSuccess} />
      </form>
      <QueryState pending={query.isPending} error={query.error}>
        {query.data?.length ? (
          <div className="record-list">
            {query.data.map((item) => (
              <div className="record-card" key={item.id}>
                <FileCheck2 size={22} />
                <div>
                  <strong>{item.originalName}</strong>
                  <p>{Math.round(item.sizeBytes / 1024)} KB</p>
                  <Status value={item.status} />
                </div>
                {item.status === 'CLEAN' && (
                  <button
                    className="button button-outline compact"
                    disabled={download.isPending}
                    onClick={() => download.mutate(item.id)}
                  >
                    {t('download')}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </QueryState>
      <Feedback error={download.error} />
    </section>
  );
}
