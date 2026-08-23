// The questions that block a booking.
//
// Separate from /support, which is written for a driver mid-shift and is
// the URL the app stores require. This one is for somebody deciding
// whether to trust us with a load.
import { FaqSection } from './sections/Faq';

export default function FaqPage() {
    return (
        <>
            <FaqSection />
        </>
    );
}
