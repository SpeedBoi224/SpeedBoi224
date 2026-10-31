// Data access for the server-hosted site (npm start). See static/api.js for
// the browser-only version used by the static build.

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const features = { print: true, nativeShare: !!navigator.share };
export const homeHref = '/';

export const getCatalog = () => request('/api/catalog');

export const createPlan = (input) => request('/api/plan', { method: 'POST', body: JSON.stringify(input) });

export async function saveBuild({ title, input }) {
  const res = await request('/api/builds', { method: 'POST', body: JSON.stringify({ title, input }) });
  return { shareUrl: location.origin + res.url };
}

// Returns the saved build for the current URL, or null on the planner page.
export async function loadBuild() {
  const m = location.pathname.match(/^\/b\/([A-Za-z0-9]+)$/);
  return m ? request(`/api/builds/${m[1]}`) : null;
}

export const currentShareUrl = () => location.href;

export function goHome() {
  history.pushState({}, '', '/');
}

export function onRouteChange(cb) {
  window.addEventListener('popstate', cb);
}
