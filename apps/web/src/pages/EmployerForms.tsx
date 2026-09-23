import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { useAction, useApi } from '../api';
import type { Catalog, Organization, Shift } from '../api';
import { Feedback, PageHeading } from '../components';
import { localToIso } from './Worker';
import { useOrganization } from './Employer';

const organizationSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().min(2),
  stir: z.string().refine((v) => v === '' || /^\d{9}$/.test(v)),
  cityId: z.string().min(1),
  branchName: z.string().min(2),
  address: z.string().min(3),
  area: z.string().min(2),
});
export function OrganizationOnboarding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const catalog = useApi<Catalog>('/catalog');
  const mutation = useAction<Organization>('/organizations');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      contactName: '',
      stir: '',
      cityId: '',
      branchName: '',
      address: '',
      area: '',
    },
  });
  return (
    <>
      <PageHeading title={t('createOrg')} text={t('noGuarantee')} />
      <form
        className="panel form-stack profile-form"
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            { ...data, ...(!data.stir ? { stir: undefined } : {}) },
            {
              onSuccess: (org) => {
                sessionStorage.setItem('smenatop-org', org.id);
                navigate('/employer');
              },
            },
          ),
        )}
      >
        <div className="form-grid">
          {(['name', 'contactName', 'stir', 'branchName', 'address', 'area'] as const).map(
            (field) => (
              <label key={field}>
                {t(field === 'name' ? 'orgName' : field)}
                <input aria-label={t(field === 'name' ? 'orgName' : field)} {...register(field)} />
                {errors[field] && <span className="field-error">{t('required')}</span>}
              </label>
            ),
          )}
          <label>
            {t('city')}
            <select aria-label={t('city')} {...register('cityId')}>
              <option value="">{t('select')}</option>
              {catalog.data?.cities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
                </option>
              ))}
            </select>
            {errors.cityId && <span className="field-error">{t('required')}</span>}
          </label>
        </div>
        <button className="button button-primary align-start" disabled={mutation.isPending}>
          {t('createOrg')}
          <ArrowRight size={17} />
        </button>
        <Feedback error={mutation.error} />
      </form>
    </>
  );
}
export const shiftSchema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    branchId: z.string().min(1),
    categoryId: z.string().min(1),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    amount: z
      .string()
      .refine(
        (value) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0,
      ),
    payType: z.enum(['HOURLY', 'FIXED']),
    headcount: z.string().refine((value) => Number.isInteger(Number(value)) && Number(value) > 0),
    breakMinutes: z
      .string()
      .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 0),
    paidBreak: z.boolean(),
    requirements: z.string(),
    requiredSkillIds: z.array(z.string()),
    applyDeadline: z.string(),
    clothing: z.string(),
    mealProvided: z.boolean(),
    transportProvided: z.boolean(),
  })
  .refine((value) => value.endAt > value.startAt, { path: ['endAt'], message: 'invalidInterval' })
  .refine(
    (value) =>
      (new Date(value.endAt).getTime() - new Date(value.startAt).getTime()) / 60000 >
      Number(value.breakMinutes),
    { path: ['breakMinutes'], message: 'invalidInterval' },
  );
const toLocalInput = (iso?: string) =>
  iso ? new Date(new Date(iso).getTime() + 5 * 3600000).toISOString().slice(0, 16) : '';
export function ShiftForm() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const orgId = useOrganization()?.organizationId;
  const catalog = useApi<Catalog>('/catalog');
  const org = useApi<Organization>(`/organizations/${orgId}`, !!orgId);
  const existing = useApi<Shift>(`/organizations/${orgId}/shifts/${id}`, !!id && !!orgId);
  const s = existing.data;
  const mutation = useAction<Shift>(
    `/organizations/${orgId}/shifts${id ? `/${id}` : ''}`,
    id ? 'PATCH' : 'POST',
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(shiftSchema),
    values: {
      title: s?.title || '',
      description: s?.description || '',
      branchId: s?.branchId || org.data?.branches?.[0]?.id || '',
      categoryId: s?.categoryId || '',
      startAt: toLocalInput(s?.startAt),
      endAt: toLocalInput(s?.endAt),
      amount: s ? String(Number(s.amountMinor) / 100) : '',
      payType: s?.payType || 'FIXED',
      headcount: String(s?.headcount || 1),
      breakMinutes: String(s?.breakMinutes ?? 30),
      paidBreak: s?.paidBreak || false,
      requirements: s?.requirements?.join('\n') || '',
      requiredSkillIds: s?.requiredSkillIds || [],
      applyDeadline: toLocalInput(s?.applyDeadline),
      clothing: s?.clothing || '',
      mealProvided: s?.mealProvided || false,
      transportProvided: s?.transportProvided || false,
    },
  });
  if (!orgId) return <OrganizationOnboarding />;
  return (
    <>
      <PageHeading title={t('newShift')} text={t('timeZone')} />
      <form
        className="panel form-stack"
        onSubmit={handleSubmit((data) => {
          const { amount, requirements, ...rest } = data;
          mutation.mutate(
            {
              ...rest,
              startAt: localToIso(data.startAt),
              endAt: localToIso(data.endAt),
              applyDeadline: localToIso(data.applyDeadline || data.startAt),
              amountMinor: String(Math.round(Number(amount) * 100)),
              headcount: Number(data.headcount),
              breakMinutes: Number(data.breakMinutes),
              requirements: requirements
                .split('\n')
                .map((v) => v.trim())
                .filter(Boolean),
              ...(id ? { version: s?.version } : {}),
            },
            { onSuccess: () => navigate('/employer/calendar') },
          );
        })}
      >
        <div className="form-grid">
          <label>
            {t('title')}
            <input aria-label={t('title')} {...register('title')} />
            {errors.title && <span className="field-error">{t('required')}</span>}
          </label>
          <label>
            {t('branch')}
            <select aria-label={t('branch')} {...register('branchId')}>
              <option value="">{t('select')}</option>
              {org.data?.branches?.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {errors.branchId && <span className="field-error">{t('required')}</span>}
          </label>
          <label>
            {t('category')}
            <select aria-label={t('category')} {...register('categoryId')}>
              <option value="">{t('select')}</option>
              {catalog.data?.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
                </option>
              ))}
            </select>
            {errors.categoryId && <span className="field-error">{t('required')}</span>}
          </label>
          <label>
            {t('start')}
            <input aria-label={t('start')} type="datetime-local" {...register('startAt')} />
            {errors.startAt && <span className="field-error">{t('required')}</span>}
          </label>
          <label>
            {t('end')}
            <input aria-label={t('end')} type="datetime-local" {...register('endAt')} />
            {errors.endAt && <span className="field-error">{t('invalidInterval')}</span>}
          </label>
          <label>
            {t('payType')}
            <select aria-label={t('payType')} {...register('payType')}>
              <option value="FIXED">{t('fixedPay')}</option>
              <option value="HOURLY">{t('hourly')}</option>
            </select>
          </label>
          <label>
            {t('amount')}
            <input
              aria-label={t('amount')}
              type="number"
              min="0"
              step="1"
              {...register('amount')}
            />
            {errors.amount && <span className="field-error">{t('required')}</span>}
          </label>
          <label>
            {t('headcount')}
            <input aria-label={t('headcount')} type="number" min="1" {...register('headcount')} />
          </label>
          <label>
            {t('break')} ({t('minute')})
            <input aria-label={t('break')} type="number" min="0" {...register('breakMinutes')} />
            {errors.breakMinutes && <span className="field-error">{t('invalidInterval')}</span>}
          </label>
          <label>
            {t('deadline')}
            <input
              aria-label={t('deadline')}
              type="datetime-local"
              {...register('applyDeadline')}
            />
          </label>
          <label>
            {t('outfit')}
            <input aria-label={t('outfit')} {...register('clothing')} />
          </label>
        </div>
        <label>
          {t('description')}
          <textarea aria-label={t('description')} rows={4} {...register('description')} />
          {errors.description && <span className="field-error">{t('required')}</span>}
        </label>
        <label>
          {t('requirements')}
          <textarea aria-label={t('requirements')} rows={3} {...register('requirements')} />
        </label>
        <fieldset>
          <legend>{t('skills')}</legend>
          <div className="checkbox-grid">
            {catalog.data?.skills.map((skill) => (
              <label className="checkbox-card" key={skill.id}>
                <input type="checkbox" value={skill.id} {...register('requiredSkillIds')} />
                {skill[i18n.language === 'ru' ? 'nameRu' : 'nameUz']}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          {(['paidBreak', 'mealProvided', 'transportProvided'] as const).map((field) => (
            <label className="check-label" key={field}>
              <input type="checkbox" {...register(field)} />
              {t(
                field === 'mealProvided'
                  ? 'meal'
                  : field === 'transportProvided'
                    ? 'transport'
                    : field,
              )}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <Link className="button button-outline" to="/employer/calendar">
            {t('cancel')}
          </Link>
          <button className="button button-primary" disabled={mutation.isPending}>
            {t('saveDraft')}
            <ArrowRight size={18} />
          </button>
        </div>
        <Feedback error={mutation.error} />
      </form>
    </>
  );
}
