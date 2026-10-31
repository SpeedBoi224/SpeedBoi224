// Accounts are not in v1. Every request is anonymous; routes already ask for
// the current user so adding sessions later only means implementing these.

export async function currentUser(_req) {
  return null;
}

// Subscription/payment gates go here (e.g. limits on saved builds or AI plans).
export function can(_user, _action) {
  return true;
}
