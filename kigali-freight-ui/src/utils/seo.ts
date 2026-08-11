// Search-engine tags that can only be set once the page knows where it is
// and which route is showing. index.html carries the static defaults; this
// adjusts them per route.
//
// A single-page app serves the same HTML for every path, so without this
// every route would advertise the landing page's description and no
// canonical at all.

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
    let tag = document.head.querySelector<HTMLMetaElement>(selector);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
}

// Self-referencing, built from the address actually being served rather
// than a hardcoded domain. The site currently answers on one host and is
// intended to move to another; a canonical pointing at a host that isn't
// live yet would send crawlers to a dead page.
export function setCanonical() {
    const href = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') || window.location.origin;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    link.href = href;
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', href);
}

export function setDescription(text: string) {
    upsertMeta('meta[name="description"]', 'name', 'description', text);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', text);
}

// Staff sign-in and unattended wall displays. robots.txt already disallows
// both, but a disallowed URL can still surface in results as a bare link;
// the meta tag is what actually keeps it out of the index.
export function setNoIndex() {
    upsertMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
}
