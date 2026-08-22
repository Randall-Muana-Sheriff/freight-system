# 5. The dispatch queue is built for volume it does not have

## Context

In August 2026 the dispatcher board was reworked against a local database
holding 131 pending orders, 27 in flight, and 80 unplaced bookings. Those
numbers drove the design: the order row was collapsed because 131 orders in a
208px box showed roughly 1.6 of them, a filter box was added because scrolling
131 rows to find one is not how anyone works, and the unplaced backlog was
deliberately kept off the top of the exception screen because at 61% of the
queue it was the standing state rather than a deviation.

Production at the same moment held **3 pending orders, 0 in flight, and no real
users**. The local figures were fixture data. This was noticed three separate
times during the work and corrected each time, but several decisions had
already been taken against them.

## Decision

The queue keeps the density work — collapsed rows, filter, saved views,
keyboard navigation, bulk selection — even though production does not yet have
the volume that justifies any of it.

Two of these were recommended against by the engineer doing the work, on the
grounds that a dense grid for a queue of three is a fourth rewrite of
`OrderRow` in a day, and that a named filter over three orders is furniture.
The owner overruled that with the argument in front of them, which is theirs to
do. This record exists so the reasoning is not lost, not to relitigate it.

## Consequences

- The board degrades correctly into low volume rather than being wrong at it.
  Three rows with no filter box is the right screen, and the filter appears
  past six queued orders. Nothing here misbehaves at production's scale; it is
  simply not yet earning its keep.

- The change most worth reconsidering is the **dense row**. Collapsing the row
  cures scrolling, and there is nothing to scroll. Cards were more scannable at
  three orders. If it ever reads as too terse in daily use, restoring a roomier
  row is a contained change to `OrderRow`'s `variant === 'row'` branch and
  touches nothing else.

- **Saved views and the detail pane age better** and should be left alone. A
  filter pays off the moment there is anything to filter; keeping your place
  while working one order is about attention rather than row count, and is
  right at three orders and at three hundred.

- **The trigger to revisit** is a dispatcher scrolling to find a load. Until
  that happens, none of this needs touching. When it does, the density work is
  already there rather than being built under pressure.

- Anyone quoting queue figures from a local database should check
  `docker ps` first. The dev stack seeds heavily and the two environments
  differ by two orders of magnitude.
