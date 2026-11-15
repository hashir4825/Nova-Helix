/**
 * Build-time settings. Edit before deploying.
 * - dataSource 'mock': seeded in-browser demo data (no backend needed).
 * - dataSource 'api': the Nova Healix backend at apiBaseUrl (see docs/BACKEND_API_GUIDE.md).
 * A visitor can switch at runtime with ?data=api or ?data=mock (remembered in localStorage).
 * The base URL is deliberately NOT settable from the URL: a crafted link must never be able to
 * redirect crew check-ins or Nova conversations to another server.
 */
export const environment = {
  dataSource: 'mock' as 'mock' | 'api',
  apiBaseUrl: 'http://127.0.0.1:8000',
};
