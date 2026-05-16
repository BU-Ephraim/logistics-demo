export const DEMO_ADMIN_ID_KEY = "demo_admin_id";
export const DEMO_BUSINESS_NAME_KEY = "demo_business_name";
export const FALLBACK_BUSINESS_NAME = "SwiftSend";

export function normalizeBusinessName(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : FALLBACK_BUSINESS_NAME;
}

export function setDemoAdminId(value: string) {
  window.localStorage.setItem(DEMO_ADMIN_ID_KEY, value);
}

export function getDemoAdminId() {
  return window.localStorage.getItem(DEMO_ADMIN_ID_KEY);
}

export function clearDemoAdminId() {
  window.localStorage.removeItem(DEMO_ADMIN_ID_KEY);
}

export function setDemoBusinessName(value: string) {
  window.localStorage.setItem(DEMO_BUSINESS_NAME_KEY, normalizeBusinessName(value));
}

export function getDemoBusinessName() {
  return (
    window.localStorage.getItem(DEMO_BUSINESS_NAME_KEY) ?? FALLBACK_BUSINESS_NAME
  );
}