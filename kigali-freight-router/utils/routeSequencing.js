// Pure route-sequencing maths, deliberately kept out of the controller.
//
// tripController imports `io` from server.js, which imports the routes,
// which import tripController — a cycle Node tolerates when server.js is
// the entry point and blows up on when anything imports the controller
// directly. That made this logic, the one part worth unit-testing on its
// own, untestable. Nothing here touches the database, the socket, or the
// request.

const OPEN_STOP_STATUSES = ['PENDING', 'ARRIVED'];
const TERMINAL_STOP_STATUSES = ['DONE', 'FAILED', 'SKIPPED'];

function toRadians(value) {
    return (value * Math.PI) / 180;
}

// Great-circle distance in metres. Deliberately not a routed-road distance:
// this only orders stops relative to one another, and pulling a routing
// service into a loop of N^2 pairs would make planning a ten-stop run a
// hundred network calls. The dispatcher sees the road route afterwards.
function haversineMetres(a, b) {
    if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Number.POSITIVE_INFINITY;
    const R = 6371000;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest-neighbour ordering with one hard rule: a DROP can never be
// sequenced before its own PICKUP. That precedence is what makes this a
// freight route rather than a travelling-salesman toy — a plan that says
// deliver-then-collect is not a worse plan, it is an impossible one.
//
// Nearest-neighbour is not optimal, and is not claimed to be. It is
// O(n^2), runs in microseconds for the ten-to-thirty stops a real run has,
// and produces a sane sequence a dispatcher can then drag into shape. An
// exact solver for a problem this size would be slower to build, slower to
// run, and no more useful once a dispatcher overrides it because a
// customer only accepts deliveries after 2pm.
export function sequenceStops(stops, start) {
    const remaining = [...stops];
    const ordered = [];
    const pickedUpOrders = new Set(
        stops.filter((s) => s.kind === 'PICKUP' && TERMINAL_STOP_STATUSES.includes(s.status)).map((s) => s.order_id)
    );
    let cursor = start;

    while (remaining.length) {
        const eligible = remaining.filter(
            (s) => s.kind === 'PICKUP' || pickedUpOrders.has(s.order_id)
        );
        // Everything left is a drop whose pickup is also still pending, which
        // can only happen if the caller passed a drop without its pickup.
        // Append them in the order given rather than looping forever.
        const pool_ = eligible.length ? eligible : remaining;

        let best = pool_[0];
        let bestDistance = haversineMetres(cursor, best);
        for (const candidate of pool_.slice(1)) {
            const distance = haversineMetres(cursor, candidate);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }

        ordered.push(best);
        remaining.splice(remaining.indexOf(best), 1);
        if (best.kind === 'PICKUP') pickedUpOrders.add(best.order_id);
        if (best.lat != null && best.lng != null) cursor = best;
    }

    return ordered;
}

export function plannedDistanceMetres(orderedStops, start) {
    let total = 0;
    let cursor = start;
    for (const stop of orderedStops) {
        if (stop.lat == null || stop.lng == null) continue;
        if (cursor) {
            const leg = haversineMetres(cursor, stop);
            if (Number.isFinite(leg)) total += leg;
        }
        cursor = stop;
    }
    return Math.round(total);
}
