import type { AuthRole } from '../api/auth.api'

// Only return to an internal route; never navigate to a URL supplied in router state.
export function getAuthDestination(state: unknown, role?: AuthRole): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return '/dashboard'
  const from = state.from
  if (!from || typeof from !== 'object' || !('pathname' in from)) return '/dashboard'
  const pathname = from.pathname
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return '/dashboard'
  const adminDestination = /^\/admin(?:\/|$)/i.test(pathname)
  const studentDestination = /^\/history(?:\/|$)/i.test(pathname)
    || /^\/exams\/[^/]+\/take(?:\/|$)/i.test(pathname)
    || /^\/attempts\/[^/]+\/result(?:\/|$)/i.test(pathname)
  if (role && ((adminDestination && role !== 'ADMIN') || (studentDestination && role !== 'STUDENT'))) return '/dashboard'
  const search = 'search' in from && typeof from.search === 'string' ? from.search : ''
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : ''
  return `${pathname}${search}${hash}`
}
