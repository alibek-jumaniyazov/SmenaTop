import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';

/** Accumulate fast edits until the router commits, while honoring Back/Forward. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const latest = useRef(params);
  const pending = useRef<string[]>([]);

  useLayoutEffect(() => {
    const acknowledged = pending.current.lastIndexOf(params.toString());
    if (navigationType !== 'POP' && acknowledged >= 0) {
      pending.current.splice(0, acknowledged + 1);
      if (pending.current.length) return;
    } else {
      pending.current = [];
    }
    latest.current = params;
  }, [location.key, navigationType, params]);

  const update = (edit: (next: URLSearchParams) => void, options?: NavigateOptions) => {
    const next = new URLSearchParams(latest.current);
    edit(next);
    const search = next.toString();
    if (search === latest.current.toString()) return;
    latest.current = next;
    pending.current.push(search);
    setParams(next, options);
  };

  return [params, update] as const;
}
