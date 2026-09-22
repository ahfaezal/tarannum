type MetaEventParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string };
    _fbq?: Window["fbq"];
  }
}

const PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID || "").trim();
const CONSENT_KEY = "tarannum_marketing_analytics_consent";
let initialized = false;

export const getMetaConsent = () => window.localStorage.getItem(CONSENT_KEY);

export const setMetaConsent = (allowed: boolean) => {
  window.localStorage.setItem(CONSENT_KEY, allowed ? "granted" : "denied");
  if (allowed) initializeMetaPixel();
};

export const initializeMetaPixel = () => {
  if (initialized) return Boolean(window.fbq);
  if (!PIXEL_ID || getMetaConsent() !== "granted") return false;
  initialized = true;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  } as Window["fbq"];
  if (!fbq) return false;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  window.fbq("init", PIXEL_ID);
  return true;
};

export const trackMetaEvent = (event: "ViewContent" | "InitiateCheckout" | "Purchase", params: MetaEventParams) => {
  if (!initializeMetaPixel() || !window.fbq) return false;
  window.fbq("track", event, params);
  return true;
};

export const metaPixelConfigured = Boolean(PIXEL_ID);
