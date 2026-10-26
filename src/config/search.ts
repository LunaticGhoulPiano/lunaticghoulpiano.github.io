export const searchPolicy = {
    indexPath: "/search-index.json",
    snippetLength: 220,
    k1: 1.2,
    b: 0.75,
    partialMatchWeight: 0.25,
    weights: { title: 5, description: 3, taxonomy: 2, body: 1 },
} as const;

export const searchSorts = ["relevance", "newest", "oldest", "updated"] as const;
export type SearchSort = (typeof searchSorts)[number];
