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
