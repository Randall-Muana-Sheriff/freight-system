// The business track.
//
// A logistics manager evaluating a carrier arrives from a search or a
// forwarded link, not from the top of somebody else's homepage. This is
// the page that link can point at.
import { BusinessSection } from './sections/Business';
import { ContactSection } from './sections/Contact';

export default function BusinessPage() {
    return (
        <>
            <BusinessSection leads />
            <ContactSection />
        </>
    );
}
