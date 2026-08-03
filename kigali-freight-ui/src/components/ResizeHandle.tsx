interface ResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void;
}

// A slim drag handle for widening/narrowing an adjacent fixed-width panel.
// The hit area (w-1.5) is wider than the visible line so it's actually
// grabbable without needing pixel-perfect aim on a 1px border.
export default function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
    return (
        <div
            onMouseDown={onMouseDown}
            className="group relative w-1.5 shrink-0 cursor-col-resize"
            role="separator"
            aria-orientation="vertical"
        >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-line/10 group-hover:bg-route transition-colors" />
        </div>
    );
}
