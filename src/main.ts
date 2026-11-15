import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { API_BASE_URL, resolveDataSource } from './app/core/data/data-source';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  // Most likely the backend is down (api mode needs GET /api/mission before first render).
  if (resolveDataSource() !== 'api') return;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'max-width:520px;margin:15vh auto;padding:24px;font:14px/1.5 Sora,system-ui,sans-serif;color:#e7ecf7';
  const h = document.createElement('h1');
  h.textContent = 'Nova Healix cannot reach its server';
  h.style.cssText = 'font-size:20px;margin:0 0 8px';
  const p = document.createElement('p');
  p.textContent = `No mission data from ${API_BASE_URL}. Check that the backend is running and allows this origin (CORS), then reload. To use built-in demo data instead, open this page with ?data=mock.`;
  box.append(h, p);
  document.body.append(box);
});
