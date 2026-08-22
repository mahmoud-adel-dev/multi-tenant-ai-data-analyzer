/** Unique cookie name prevents collisions with other NextAuth apps on localhost. */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-aidl.session-token"
    : "aidl.session-token";
