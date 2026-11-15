/** `ng serve` (development build): API mode talks to the local reference server (scripts/api-server.ts). */
export const environment = {
  dataSource: 'mock' as 'mock' | 'api',
  apiBaseUrl: 'http://127.0.0.1:8000',
};
