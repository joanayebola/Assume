export const site = {
  name: "Assume",
  tagline: "Manifestation that fits your actual life.",
  description:
    "Tell Assume what you want, how you like to manifest and what your days actually look like. Get a personalized practice built around your life.",
  themeColor: "#f5f1e8",
  accentColor: "#ff5a1f",
} as const;

export const routes = {
  home: "/",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  appHome: "/home",
  plans: "/plans",
  newPlan: "/plans/new",
  manifested: "/manifested",
  checkout: "/checkout",
  checkoutSuccess: "/checkout/success",
  checkoutCancelled: "/checkout/cancelled",
  terms: "/terms",
  privacy: "/privacy",
  contact: "/contact",
  settings: "/settings",
  googleConnect: "/api/calendar/google/connect",
} as const;

/** Paths that require a signed-in user. Checked in the proxy and app layout. */
export const protectedPrefixes = [routes.appHome, routes.plans, routes.manifested, routes.settings, routes.checkout] as const;

/** Auth pages a signed-in user should be bounced away from. */
export const guestOnlyPaths = [routes.login, routes.signup, routes.forgotPassword] as const;
