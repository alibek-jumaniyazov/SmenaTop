export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId: string;
};
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: ApiError,
  ) {
    super(detail.message);
    this.name = 'ApiRequestError';
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf =
    typeof document === 'undefined'
      ? ''
      : document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('smenatop_csrf='))
          ?.split('=')[1];
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({
      code: 'NETWORK_ERROR',
      message: response.statusText,
      requestId: '',
    }))) as ApiError;
    throw new ApiRequestError(response.status, detail);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
