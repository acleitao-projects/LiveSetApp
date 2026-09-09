// Lightweight wrapper around Google Analytics gtag. The gtag script itself is
// loaded from index.html. If the user is offline (PWA), the network request
// simply fails and we no-op — no queueing.

const RESPECT_DNT = true;

function dntBlocked() {
  if (!RESPECT_DNT || typeof navigator === 'undefined') return false;
  const dnt = navigator.doNotTrack || window?.doNotTrack || navigator.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

function ready() {
  if (typeof window === 'undefined') return false;
  if (dntBlocked()) return false;
  if (!navigator.onLine) return false;
  return typeof window.gtag === 'function';
}

// Fire a GA4 custom event. Params are shallow-copied; keys should be snake_case.
// See https://developers.google.com/analytics/devguides/collection/ga4/reference/events
export function track(eventName, params = {}) {
  if (!ready()) return;
  try { window.gtag('event', eventName, params); } catch (_) { /* ignore */ }
}

// Convenience: send a screen_view when the user changes major surfaces.
export function trackView(name) {
  if (!ready()) return;
  try { window.gtag('event', 'page_view', {page_title: name, page_location: `${location.origin}${location.pathname}#${name}`}); }
  catch (_) { /* ignore */ }
}

export function trackBoot(context = {}) {
  if (!ready()) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || (typeof navigator !== 'undefined' && navigator.standalone === true);
  const language = (context.language || navigator.language || 'unknown').slice(0, 5);
  try {
    window.gtag('event', 'app_boot', {
      standalone,
      language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      ua_platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
      ...context
    });
  } catch (_) { /* ignore */ }
}
