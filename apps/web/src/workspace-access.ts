const adminPages = [
  { path: '/admin', permissions: ['verification.review', 'dispute.resolve'] },
  { path: '/admin/support', permissions: ['support.manage'] },
  { path: '/admin/billing', permissions: ['billing.reconcile'] },
  { path: '/admin/catalogs', permissions: ['catalog.manage'] },
] as const;

export function canOpenAdminPage(permissions: readonly string[], path: string) {
  return adminPages.some(
    (page) =>
      page.path === path && page.permissions.some((permission) => permissions.includes(permission)),
  );
}

export function adminHome(permissions: readonly string[]) {
  return adminPages.find((page) => canOpenAdminPage(permissions, page.path))?.path;
}
