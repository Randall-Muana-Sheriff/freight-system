import { useEffect } from 'react';

// The tab title was the static <title>Inzira</title> from index.html and
// never changed, so every open tab looked identical — a dispatcher with
// the board, the control centre and a wall display open could only tell
// them apart by clicking through.
//
// There is no router here (see App.tsx), so there are no URLs to hang
// titles off. The "screen" is whatever the auth/admin state says is
// rendering, which is exactly what callers pass in.
const SUFFIX = 'Inzira';

export function useDocumentTitle(screen: string, attention = 0) {
    useEffect(() => {
        // Leading count follows the convention mail clients use, because
        // it survives truncation: a pinned or crowded tab clips the right
        // side first, so "(3) Dispatch — Inz…" still shows the number that
        // matters while "Dispatch — Inzira (3)" would hide it. This board
        // is meant to sit in a background tab during a shift.
        const badge = attention > 0 ? `(${attention}) ` : '';
        document.title = screen ? `${badge}${screen} · ${SUFFIX}` : `${badge}${SUFFIX}`;
    }, [screen, attention]);
}
