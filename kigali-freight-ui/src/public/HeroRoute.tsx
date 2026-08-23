import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './i18n';

// The hero. A freight company whose whole pitch is "you can see where your
// cargo is" should not open with a photograph of a lorry — it should open
// with the thing being sold, running. So this draws the hub network and
// walks a vehicle along a route between two of them, with the readout a
// customer would actually see.
//
// Canvas rather than SVG because the trail is a per-frame fade over a few
// hundred points; doing that as DOM nodes would thrash the layout engine
// for no benefit.

// Stylised positions in a 0..1 space — the relative geography of Kigali's
// hubs (Nyabugogo north-west, Kimironko north-east, Remera east, Gikondo
// south), not survey coordinates. Three of these are the hubs the system
// actually seeds; Remera is drawn as a delivery point, not a hub.
const NODES = [
    { id: 'nyabugogo', label: 'Nyabugogo', x: 0.18, y: 0.30, hub: true },
    { id: 'kimironko', label: 'Kimironko', x: 0.78, y: 0.22, hub: true },
    { id: 'remera', label: 'Remera', x: 0.66, y: 0.55, hub: false },
    { id: 'gikondo', label: 'Gikondo', x: 0.34, y: 0.80, hub: true },
    { id: 'centre', label: 'Centre', x: 0.46, y: 0.46, hub: false },
];

const NETWORK: [string, string][] = [
    ['nyabugogo', 'centre'], ['centre', 'kimironko'], ['centre', 'remera'],
    ['gikondo', 'centre'], ['remera', 'kimironko'], ['nyabugogo', 'gikondo'],
];

// The leg the vehicle actually walks, as a curve rather than a straight
// line — roads on these hills never run straight, and a dead-straight
// hero line would read as a diagram of somewhere flat.
const ROUTE = { from: 'gikondo', to: 'kimironko', bend: -0.22 };

const node = (id: string) => NODES.find((n) => n.id === id)!;

function quadPoint(t: number, p0: [number, number], c: [number, number], p1: [number, number]) {
    const u = 1 - t;
    return [
        u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ] as [number, number];
}

function controlFor(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return [mx + dy * bend, my - dx * bend] as [number, number];
}

const TOTAL_KM = 8.6;

export function HeroRoute() {
    const { t } = useLanguage();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let frame = 0;
        let t = reduced ? 0.62 : 0;
        let width = 0;
        let height = 0;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = rect.width;
            height = rect.height;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const px = (n: { x: number; y: number }) => [n.x * width, n.y * height] as [number, number];

        const from = node(ROUTE.from);
        const to = node(ROUTE.to);

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            // The network the cargo could move across, drawn faint: context,
            // not content.
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(241, 239, 232, 0.10)';
            for (const [a, b] of NETWORK) {
                const [ax, ay] = px(node(a));
                const [bx, by] = px(node(b));
                const c = controlFor(node(a), node(b), 0.1);
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.quadraticCurveTo(c[0] * width, c[1] * height, bx, by);
                ctx.stroke();
            }

            const p0 = px(from);
            const p1 = px(to);
            const cRel = controlFor(from, to, ROUTE.bend);
            const c: [number, number] = [cRel[0] * width, cRel[1] * height];

            // The active leg, in laterite — the physical road.
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(191, 78, 38, 0.55)';
            ctx.beginPath();
            ctx.moveTo(p0[0], p0[1]);
            ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
            ctx.stroke();

            // Travelled portion, brighter, so the split between done and
            // remaining is readable at a glance.
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#bf4e26';
            ctx.beginPath();
            for (let i = 0; i <= 60; i++) {
                const [x, y] = quadPoint((i / 60) * t, p0, c, p1);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();

            for (const n of NODES) {
                const [x, y] = px(n);
                const isEnd = n.id === ROUTE.from || n.id === ROUTE.to;
                ctx.beginPath();
                ctx.arc(x, y, isEnd ? 5 : n.hub ? 3.5 : 2.5, 0, Math.PI * 2);
                ctx.fillStyle = isEnd ? '#e9e5db' : 'rgba(139, 162, 149, 0.7)';
                ctx.fill();
                if (isEnd) {
                    ctx.beginPath();
                    ctx.arc(x, y, 10, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(233, 229, 219, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // The vehicle. Signal amber, and the only moving thing on the
            // page — a warning lamp on a dark dashboard.
            const [vx, vy] = quadPoint(t, p0, c, p1);
            const pulse = reduced ? 0 : (Math.sin(Date.now() / 320) + 1) / 2;
            ctx.beginPath();
            ctx.arc(vx, vy, 9 + pulse * 5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 194, 75, ${0.13 - pulse * 0.06})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(vx, vy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffc24b';
            ctx.fill();

            if (!reduced) {
                t += 0.0016;
                if (t > 1) t = 0;
                setProgress(t);
                frame = requestAnimationFrame(draw);
            } else {
                setProgress(t);
            }
        };

        draw();
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, []);

    const remaining = (TOTAL_KM * (1 - progress)).toFixed(1);
    const etaMinutes = Math.max(1, Math.round((Number(remaining) / 25) * 60));

    return (
        <figure className="m-0">
            {/* Labels are positioned in percentages of the canvas, so this
                wrapper must be the positioning context — anchoring them to
                the whole figure put them adrift by the caption's height. */}
            <div className="relative">
                <canvas
                    ref={canvasRef}
                    className="block h-[230px] w-full sm:h-[280px]"
                    role="img"
                    aria-label={t.hero_art.alt}
                />

                {/* Node names live in DOM rather than on the canvas so they
                    are real text — selectable, translatable, and legible to
                    a screen reader that ignores the picture above. */}
                {NODES.filter((n) => n.hub || n.id === ROUTE.to).map((n) => (
                    <span
                        key={n.id}
                        className="data-label pointer-events-none absolute -translate-x-1/2 translate-y-3 whitespace-nowrap text-pub-onink-soft"
                        style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
                    >
                        {n.label}
                    </span>
                ))}
            </div>

            <figcaption className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-pub-onink/10 pt-4">
                <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-pub-signal" />
                    <span className="data-label text-pub-signal">{t.hero_art.inTransit}</span>
                </span>
                <span className="data-label text-pub-onink-soft">Gikondo → Kimironko</span>
                {/* These two were the last English left in the hero when the
                    site is read in French: "in transit" and "sample shipment"
                    were translated around them, so the instrument was half in
                    one language. Interpolated rather than concatenated,
                    because word order around a number is not universal —
                    French puts the distance before "restants" and the ETA
                    after "Arrivée dans". */}
                <span className="data-label text-pub-onink tabular-nums">
                    {t.hero_art.kmToRun.replace('{km}', String(remaining))}
                </span>
                <span className="data-label text-pub-onink-soft tabular-nums">
                    {t.hero_art.eta.replace('{minutes}', String(etaMinutes))}
                </span>
                {/* Said plainly. The map is a demonstration of the tracking
                    view, not a window onto somebody's real consignment. */}
                <span className="data-label ml-auto text-pub-onink-soft/60">{t.hero_art.sampleShipment}</span>
            </figcaption>
        </figure>
    );
}
