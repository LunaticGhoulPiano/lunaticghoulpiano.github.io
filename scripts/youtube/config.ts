export const youtubeToolPolicy = {
    credential: "WEBPAGE_YOUTUBE_PROFILE_READONLY",
    apiUrl: "https://www.googleapis.com/youtube/v3/",
    pageSize: 50,
    requestTimeoutMs: 15_000,
    refreshTimeoutMs: 120_000,
    maxRequests: 200,
    refreshHours: 6,
} as const;
