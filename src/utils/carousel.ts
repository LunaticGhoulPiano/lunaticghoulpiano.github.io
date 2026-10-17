export function carouselState(totalItems: number, visibleItems: number, requestedIndex = 0, loop = false) {
    if (! Number.isInteger(totalItems) || totalItems < 0) throw new Error("Item count must be a nonnegative integer.");
    if (! Number.isInteger(visibleItems) || visibleItems < 1) throw new Error("Visible count must be a positive integer.");
    if (! Number.isInteger(requestedIndex)) throw new Error("Carousel index must be an integer.");

    const visible = Math.min(totalItems, visibleItems);
    const canMove = totalItems > visible;
    const lastIndex = totalItems - visible;
    const positions = loop && canMove ? totalItems : lastIndex + 1;
    const index = loop && canMove
        ? ((requestedIndex % positions) + positions) % positions
        : Math.max(0, Math.min(lastIndex, requestedIndex));
    return {
        index,
        indices: Array.from({
            length: visible,
        }, (_, offset) => (index + offset) % totalItems),
        previous: canMove && (loop || index > 0) ? (index - 1 + positions) % positions : null,
        next: canMove && (loop || index < lastIndex) ? (index + 1) % positions : null,
    };
}
