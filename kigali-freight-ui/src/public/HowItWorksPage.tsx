// The walkthrough and the machinery behind it, together.
//
// Two bands that answer one question — what actually happens once you
// book — and read better in sequence than they did separated by pricing.
// The system section keeps its own anchor so the navigation can point at
// the half a reader asked for.
import { JourneySection } from './sections/Journey';
import { SystemSection } from './sections/System';

export default function HowItWorksPage() {
    return (
        <>
            <JourneySection />
            <SystemSection />
        </>
    );
}
