// The rate card, on its own page.
//
// It was a band on the landing page, and it is the single densest thing
// the site publishes — a table, three worked examples and three notes.
// Somebody looking for a price should be able to arrive at it directly,
// send the link to a colleague, and have a search engine index it as the
// page about what freight costs rather than as the middle of a homepage.
import { PricingSection } from './sections/Pricing';

export default function PricingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
    return (
        <>
            <PricingSection onNavigate={onNavigate} />
        </>
    );
}
