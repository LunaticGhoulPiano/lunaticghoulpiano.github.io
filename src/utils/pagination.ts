export function paginationState(totalItems: number, pageSize: number, requestedPage = 1) {
    if (! Number.isInteger(pageSize) || pageSize < 1) throw new Error("Page size must be a positive integer.");
    const totalPages = Math.ceil(Math.max(0, totalItems) / pageSize);
    const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), Math.max(1, totalPages));
    return {
        page,
        totalPages,
        start: (page - 1) * pageSize,
        end: Math.min(page * pageSize, totalItems),
        previous: page > 1 ? page - 1 : null,
        next: page < totalPages ? page + 1 : null,
    };
}
