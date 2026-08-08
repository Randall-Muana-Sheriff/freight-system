import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
    // Which side of the handle the panel sits on — determines which way
    // the chevron points to mean "collapse" vs "expand", and which side
    // of the handle the toggle button sits on.
    panelSide: 'left' | 'right';
}

// A slim drag handle for widening/narrowing an adjacent panel, plus a
// small collapse/expand toggle riding on top of it. The toggle is a
// separate hit target (not the same onMouseDown as the drag handle) so
// clicking it can't also register as the start of a resize-drag.
export default function ResizeHandle({ onMouseDown, collapsed, onToggleCollapse, panelSide }: ResizeHandleProps) {
    // When the panel is on the left, collapsing means "point at the panel"
    // (left) and expanding means "point away from it" (right) — and
    // vice versa for a right-side panel.
    const collapseIcon = panelSide === 'left' ? ChevronLeft : ChevronRight;
    const expandIcon = panelSide === 'left' ? ChevronRight : ChevronLeft;
    const Icon = collapsed ? expandIcon : collapseIcon;

    return (
        <div
            onMouseDown={collapsed ? undefined : onMouseDown}
            className={`group relative w-1.5 shrink-0 ${collapsed ? '' : 'cursor-col-resize'}`}
            role="separator"
            aria-orientation="vertical"
        >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-line/10 group-hover:bg-route transition-colors" />
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={collapsed ? 'Show panel' : 'Hide panel'}
                aria-label={collapsed ? 'Show panel' : 'Hide panel'}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-9 rounded bg-panel border border-line/15 text-steel hover:text-paper hover:border-route/40 transition-colors flex items-center justify-center z-10"
            >
                <Icon size={12} strokeWidth={2.5} />
            </button>
        </div>
    );
}
