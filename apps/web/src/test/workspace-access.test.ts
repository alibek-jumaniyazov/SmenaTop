import { describe, expect, it } from 'vitest';
import { adminHome, canOpenAdminPage } from '../workspace-access';

describe('Operational admin navigation', () => {
  it('keeps developer and audit-only accounts out of customer admin routes', () => {
    expect(adminHome(['developer.read', 'audit.read'])).toBeUndefined();
    for (const path of ['/developer', '/admin/audit', '/admin/health']) {
      expect(canOpenAdminPage(['verification.review', 'audit.read', 'developer.read'], path)).toBe(
        false,
      );
    }
  });

  it('routes each limited administrator to an allowed operational page', () => {
    expect(adminHome(['support.manage'])).toBe('/admin/support');
    expect(adminHome(['billing.reconcile'])).toBe('/admin/billing');
    expect(adminHome(['catalog.manage'])).toBe('/admin/catalogs');
    expect(adminHome(['dispute.resolve'])).toBe('/admin');
    expect(canOpenAdminPage(['billing.reconcile'], '/admin')).toBe(false);
    expect(canOpenAdminPage(['support.manage'], '/admin/billing')).toBe(false);
  });
});
