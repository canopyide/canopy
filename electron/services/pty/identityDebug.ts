const IDENTITY_DEBUG_ENABLED =
  process.env.NODE_ENV === "development" || Boolean(process.env.DAINTREE_DEBUG);

export function logIdentityDebug(message: string): void {
  if (IDENTITY_DEBUG_ENABLED) {
    console.log(message);
  }
}
