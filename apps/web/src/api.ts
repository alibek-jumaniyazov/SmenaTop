import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '../../../packages/api-client/src/schema';

export type CatalogItem = Pick<components['schemas']['CatalogEntry'], 'id' | 'nameUz' | 'nameRu'>;
export interface Catalog {
  cities: CatalogItem[];
  categories: CatalogItem[];
  skills: CatalogItem[];
}
export interface Organization {
  id: string;
  name: string;
  contactName?: string;
  stir?: string | null;
  description?: string | null;
  website?: string | null;
  contactPhone?: string | null;
  version?: number;
  cityId?: string;
  verificationStatus: string;
  synthetic?: boolean;
  branches?: Branch[];
  memberships?: Membership[];
}
export interface Branch {
  id: string;
  name: string;
  area: string;
  address?: string;
}
export interface Membership {
  id?: string;
  organizationId: string;
  role: string;
  permissions: string[];
  organization: Organization;
  user?: { name: string; phone: string };
}
export interface WorkerProfile {
  id: string;
  name?: string;
  cityId: string;
  categoryIds: string[];
  languages: string[];
  experience: string;
  verificationStatus: string;
  skillIds?: string[];
  skills?: { skillId: string; status: string; skill?: CatalogItem }[];
  availability?: Availability[];
}
export interface Session extends Omit<
  components['schemas']['SessionIdentity'],
  'workerProfile' | 'memberships'
> {
  workerProfile: WorkerProfile | null;
  memberships: Membership[];
}
export interface Availability {
  id: string;
  startAt: string;
  endAt: string;
}
export interface Shift extends Omit<
  components['schemas']['Shift'],
  | 'organization'
  | 'branch'
  | 'category'
  | 'city'
  | 'requiredSkillIds'
  | 'staffingStatus'
  | 'filledCount'
> {
  organization: Organization;
  branch: Branch;
  category?: CatalogItem;
  city?: CatalogItem;
  requiredSkillIds: string[];
  staffingStatus: string;
  filledCount: number;
}
export type Offer = Pick<components['schemas']['Offer'], 'id' | 'expiresAt' | 'status'>;
export interface Application extends Pick<
  components['schemas']['Application'],
  'id' | 'status' | 'note'
> {
  shift: Shift;
  offers: Offer[];
  worker?: { id: string; name: string; workerProfile?: WorkerProfile };
}
export interface Assignment extends Pick<
  components['schemas']['Assignment'],
  'id' | 'status' | 'workerId' | 'startAt' | 'endAt'
> {
  shift: Shift;
  worker?: { name: string; id: string };
}
export interface Wage {
  id: string;
  status: string;
  amountMinor: string;
  assignment: Assignment;
  assignmentId: string;
}
export interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
export interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  sender?: { name: string };
}
export interface PlanVersion {
  id: string;
  priceMinor: string;
  currency: string;
  branchLimit: number;
  memberLimit: number;
  publishLimit: number;
  version: number;
}
export interface Plan {
  id: string;
  code: string;
  name: string;
  versions: PlanVersion[];
}
export interface Attempt {
  id: string;
  status: string;
  provider: string;
}
export interface Invoice {
  id: string;
  status: string;
  amountMinor: string;
  createdAt: string;
  attempts: Attempt[];
}
export interface Billing {
  subscription: { status: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean } | null;
  entitlements: unknown[];
  invoices: Invoice[];
  providers: {
    id: string;
    status: string;
    reason?: string;
    capabilities: { checkout: boolean; refund: boolean; recurring: boolean };
  }[];
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
let csrfToken = decodeURIComponent(
  document.cookie
    .split('; ')
    .find((value) => value.startsWith('smenatop_csrf='))
    ?.split('=')[1] || '',
);
export function setCsrf(token: string) {
  csrfToken = token;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken)
    headers.set('x-csrf-token', csrfToken);
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...options, headers });
  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const e = data as
      | { code?: string; message?: string; fieldErrors?: Record<string, string[]> }
      | undefined;
    throw new ApiError(
      response.status,
      e?.code || 'REQUEST_FAILED',
      e?.message || response.statusText,
      e?.fieldErrors,
    );
  }
  return data as T;
}
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const session = await api<Session>('/auth/me');
        setCsrf(session.csrfToken);
        return session;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}
export function useApi<T>(path: string, enabled = true) {
  return useQuery({
    queryKey: ['api', path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: path.includes('/messages') || path === '/notifications' ? 15000 : false,
  });
}
export function useAction<T = unknown>(path: string, method = 'POST') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api<T>(path, {
        method,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['api'] }),
        client.invalidateQueries({ queryKey: ['session'] }),
      ]);
    },
  });
}
export function list<T>(value: Page<T> | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value?.items || [];
}
