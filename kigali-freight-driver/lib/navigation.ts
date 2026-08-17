import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

// Leaving a detail screen that is really a tab.
//
// The trip and documents screens are declared in app/(app)/_layout.tsx as
// <Tabs.Screen href={null}>, which hides them from the bar but leaves them
// as tabs. Opening one is a tab switch, not a push, and that has two
// consequences that both look like broken buttons:
//
//   router.back() does nothing — a tab navigator has no stack behind the
//   current screen to pop.
//
//   The Android back button goes to the first tab, Home, because
//   backBehavior on a bottom-tab navigator defaults to 'firstRoute'.
//
// So both have to be answered explicitly, and with the same destination,
// or the two buttons on one screen disagree with each other. The
// destination is fixed per screen rather than "wherever you came from":
// these screens each belong to one list (a trip to Jobs, a document to
// Profile), and a driver arriving from a push notification on a cold start
// has no history to return to anyway.
//
// Switching the navigator to backBehavior="history" would fix the hardware
// button alone, but it would also make back retrace every tab a driver had
// visited before leaving the app — a worse trade for a screen they use one
// -handed all day.
export function useUpNavigation(target: string) {
    const goUp = useCallback(() => {
        // navigate, not push or replace. push would stack the list on top
        // of the detail screen; replace rewrites the tab state, and the
        // navigator's backBehavior then has no earlier tab to fall back to
        // — measured on device, back from the Jobs list closed the app
        // instead of going Home. navigate switches tabs exactly the way
        // tapping the bar does, which is what leaves the chain intact.
        router.navigate(target as never);
    }, [target]);

    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
                goUp();
                return true; // handled — otherwise the tab navigator jumps to Home
            });
            return () => subscription.remove();
        }, [goUp])
    );

    return goUp;
}
