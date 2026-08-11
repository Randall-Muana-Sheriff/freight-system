import { useEffect, useRef } from 'react';

// Ambient hero background: a contour map of hills, with the ground under
// the pointer lit as though a light were being moved across a paper map.
//
// Chosen over stock video or a particle field because it says something
// true about the subject — this is a country of hills and a business about
// terrain — and because it is the same visual family as the route map
// beside it rather than a decorative layer fighting it.
//
// The terrain itself never changes; Kigali's hills do not move. It is
// drawn once into an offscreen canvas and only the lighting animates, so
// each frame costs two composites rather than a full contour trace.

const LEVELS = 9;
const CELL = 26; // px per marching-squares cell — coarse enough to be cheap

// Marching squares. Corner bits: TL=8 TR=4 BR=2 BL=1. Edges: 0 top,
// 1 right, 2 bottom, 3 left.
const EDGE_TABLE: number[][][] = [
    [], [[2, 3]], [[1, 2]], [[1, 3]],
    [[0, 1]], [[0, 3], [1, 2]], [[0, 2]], [[0, 3]],
    [[0, 3]], [[0, 2]], [[0, 1], [2, 3]], [[0, 1]],
    [[1, 3]], [[1, 2]], [[2, 3]], [],
];

// Smooth, deterministic height field. A handful of sine products rather
// than a noise library — it only needs to look like landform, and this
// keeps the component dependency-free.
function height(x: number, y: number) {
    return (
        Math.sin(x * 1.7 + 0.3) * Math.cos(y * 1.3 - 0.7) +
        0.6 * Math.sin((x + y) * 2.3 + 1.1) +
        0.4 * Math.cos(x * 3.1 - y * 2.2) +
        0.25 * Math.sin(y * 4.4 + x * 0.9)
    );
}

export function HeroTerrain() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let width = 0;
        let height_ = 0;
        let dpr = 1;
        let terrain: HTMLCanvasElement | null = null;
        let lit: HTMLCanvasElement | null = null;
        let frame = 0;
        let t = 0;

        // Starts near the headline so there is something to see before the
        // pointer arrives, and is where it returns on mouseleave.
        const REST = { x: 0.32, y: 0.5 };
        const pointer = { x: REST.x, y: REST.y, active: false };

        const buildTerrain = () => {
            const off = document.createElement('canvas');
            off.width = Math.max(1, Math.floor(width * dpr));
            off.height = Math.max(1, Math.floor(height_ * dpr));
            const octx = off.getContext('2d');
            if (!octx) return null;
            octx.scale(dpr, dpr);
            octx.strokeStyle = '#8ba295';
            octx.lineWidth = 1;

            const cols = Math.ceil(width / CELL);
            const rows = Math.ceil(height_ / CELL);
            // Sampled in a normalised space so the landform keeps its shape
            // rather than stretching when the window changes proportion.
            const sample = (i: number, j: number) => height((i * CELL) / 420, (j * CELL) / 420);

            for (let level = 0; level < LEVELS; level++) {
                const threshold = -1.6 + (level / (LEVELS - 1)) * 3.2;
                octx.beginPath();
                for (let j = 0; j < rows; j++) {
                    for (let i = 0; i < cols; i++) {
                        const tl = sample(i, j);
                        const tr = sample(i + 1, j);
                        const br = sample(i + 1, j + 1);
                        const bl = sample(i, j + 1);
                        let idx = 0;
                        if (tl > threshold) idx |= 8;
                        if (tr > threshold) idx |= 4;
                        if (br > threshold) idx |= 2;
                        if (bl > threshold) idx |= 1;

                        const x0 = i * CELL;
                        const y0 = j * CELL;
                        // Interpolated crossing point on each edge, so the
                        // contours curve instead of stepping between cells.
                        const point = (edge: number): [number, number] => {
                            const lerp = (a: number, b: number) => (threshold - a) / (b - a || 1e-6);
                            switch (edge) {
                                case 0: return [x0 + CELL * lerp(tl, tr), y0];
                                case 1: return [x0 + CELL, y0 + CELL * lerp(tr, br)];
                                case 2: return [x0 + CELL * lerp(bl, br), y0 + CELL];
                                default: return [x0, y0 + CELL * lerp(tl, bl)];
                            }
                        };

                        for (const [a, b] of EDGE_TABLE[idx]) {
                            const [ax, ay] = point(a);
                            const [bx, by] = point(b);
                            octx.moveTo(ax, ay);
                            octx.lineTo(bx, by);
                        }
                    }
                }
                octx.stroke();
            }
            return off;
        };

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = rect.width;
            height_ = rect.height;
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height_ * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            terrain = buildTerrain();
            lit = document.createElement('canvas');
            lit.width = canvas.width;
            lit.height = canvas.height;
        };
        resize();

        const draw = () => {
            if (!terrain || !lit) return;
            ctx.clearRect(0, 0, width, height_);

            // Base: the whole landform, barely there. Enough to read as
            // terrain, far too faint to compete with the headline.
            ctx.globalAlpha = 0.09;
            ctx.drawImage(terrain, 0, 0, width, height_);

            // Lit pass: the same contours kept only where the light falls.
            const lctx = lit.getContext('2d');
            if (lctx) {
                lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                lctx.clearRect(0, 0, width, height_);
                lctx.globalCompositeOperation = 'source-over';
                lctx.drawImage(terrain, 0, 0, width, height_);

                // Drift keeps it alive when nobody is pointing at it.
                const driftX = reduced ? 0 : Math.cos(t / 2600) * 0.05;
                const driftY = reduced ? 0 : Math.sin(t / 3300) * 0.04;
                const cx = (pointer.x + driftX) * width;
                const cy = (pointer.y + driftY) * height_;
                const radius = Math.max(width, height_) * 0.30;

                const glow = lctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                glow.addColorStop(0, 'rgba(255,255,255,1)');
                glow.addColorStop(0.55, 'rgba(255,255,255,0.45)');
                glow.addColorStop(1, 'rgba(255,255,255,0)');
                lctx.globalCompositeOperation = 'destination-in';
                lctx.fillStyle = glow;
                lctx.fillRect(0, 0, width, height_);

                ctx.globalAlpha = 0.42;
                ctx.drawImage(lit, 0, 0, width, height_);
            }

            ctx.globalAlpha = 1;
            if (!reduced) {
                t += 16;
                frame = requestAnimationFrame(draw);
            }
        };
        draw();

        // Eased towards the cursor rather than snapped to it, so the light
        // has some weight instead of teleporting around the hero.
        const onMove = (event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            pointer.x = (event.clientX - rect.left) / rect.width;
            pointer.y = (event.clientY - rect.top) / rect.height;
            pointer.active = true;
            if (reduced) draw();
        };
        const onLeave = () => {
            pointer.x = REST.x;
            pointer.y = REST.y;
            pointer.active = false;
            if (reduced) draw();
        };

        const host = canvas.parentElement;
        host?.addEventListener('pointermove', onMove);
        host?.addEventListener('pointerleave', onLeave);
        window.addEventListener('resize', resize);

        return () => {
            cancelAnimationFrame(frame);
            host?.removeEventListener('pointermove', onMove);
            host?.removeEventListener('pointerleave', onLeave);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
        />
    );
}
