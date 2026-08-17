// Which of the three faces of this app a request should get.
//
// One container serves all of them, so something has to decide. It was
// pathname alone, which forced the dispatcher board onto /dispatch and
// broke every bookmark the team had. Hostname is the better signal: a
// subdomain called "dispatch" should obviously serve the dispatch board
// at its own root, and the company's apex domain should obviously serve
// the company's public site.
//
// Path still works as a fallback, so /dispatch keeps working on any host
// and nobody who learned the new URL is stranded either.

export type Surface = 'kiosk' | 'staff' | 'public';

// Any host whose first label is one of these is a staff surface. Matching
// on the label rather than the full domain means this holds across
// production, staging and a LAN IP without a config entry per environment.
const STAFF_HOSTS = ['dispatch', 'admin', 'ops'];

export function resolveSurface(
    hostname: string = window.location.hostname,
    pathname: string = window.location.pathname
): Surface {
    if (pathname.startsWith('/kiosk')) return 'kiosk';
    if (pathname.startsWith('/dispatch')) return 'staff';

    const label = hostname.split('.')[0].toLowerCase();
    if (STAFF_HOSTS.includes(label)) return 'staff';

    return 'public';
}

// True when the staff board is being served at the root of its own host,
// in which case links to the public site have to leave the host entirely
// rather than just changing the path.
export function isStaffHost(hostname: string = window.location.hostname) {
    return STAFF_HOSTS.includes(hostname.split('.')[0].toLowerCase());
}

// Where a link to the staff board should actually point.
//
// The board answers on two origins — dispatch.example.com and
// example.com/dispatch — because the path is kept as a fallback so old
// bookmarks survive. That is fine for arriving, and a problem for signing
// in: the session is a JWT in localStorage, which is scoped per origin. A
// staff member who signs in through the public site's footer gets a
// session on the apex only. It does not carry to the canonical host, and —
// worse — signing out on one origin cannot clear the other, so logging out
// leaves a live token behind in a browser the person believes they closed.
//
// So there is one canonical staff origin and links go to it. The domain
// comes from Caddy's APP_DOMAIN via runtime config rather than being
// derived by prefixing "dispatch." onto whatever host we happen to be on:
// that guess would be wrong on localhost, wrong on a LAN IP, and wrong for
// any deployment without a staff subdomain, and being wrong here strands
// the whole team on a hostname that does not resolve. No configured
// domain means the path fallback, which is exactly today's behaviour.
export function staffUrl(
    staffDomain: string,
    protocol: string = window.location.protocol
): string {
    if (!staffDomain) return '/dispatch';
    return `${protocol}//${staffDomain}/`;
}

// Whether the current page is the board being served somewhere other than
// its canonical home, and therefore ought to move. Deliberately false when
// no staff domain is configured and when we are already there, so this can
// never loop and never fires in local development.
export function shouldRedirectToStaffHost(
    surface: Surface,
    staffDomain: string,
    hostname: string = window.location.hostname
): boolean {
    if (surface !== 'staff') return false;
    if (!staffDomain) return false;
    return hostname.toLowerCase() !== staffDomain.toLowerCase();
}
