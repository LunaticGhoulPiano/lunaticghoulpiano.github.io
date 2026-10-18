export const fixtureKey = "fixture_youtube_key";
export const fixtureNow = new Date("2026-10-18T00:00:00Z");
export const fixtureChannelId = `UC${"a".repeat(22)}`;
export const fixtureVideoId = (index) => `video${String(index).padStart(6, "0")}`;

export function fixtureFetch({ count = 57, calls = [], transform = (_resource, data) => data } = {}) {
    return async (input) => {
        const url = new URL(input);
        const resource = url.pathname.split("/").at(-1);
        calls.push({ resource, parameters: Object.fromEntries(url.searchParams) });
        let data;
        if (resource === "channels") {
            data = {
                items: [{
                    id: fixtureChannelId,
                    snippet: {
                        title: "Fixture Channel",
                        publishedAt: "2018-01-02T03:04:05Z",
                        thumbnails: { medium: { url: "https://yt3.ggpht.com/fixture" } },
                    },
                    contentDetails: { relatedPlaylists: { uploads: "fixture_uploads" } },
                    statistics: {
                        subscriberCount: "1230",
                        hiddenSubscriberCount: false,
                        videoCount: String(count),
                        viewCount: "9007199254740993",
                    },
                }],
            };
        }
        else if (resource === "playlistItems") {
            const start = Number(url.searchParams.get("pageToken") ?? 0);
            const end = Math.min(count, start + Number(url.searchParams.get("maxResults")));
            data = {
                items: Array.from({ length: end - start }, (_, index) => ({
                    contentDetails: { videoId: fixtureVideoId(start + index) },
                })),
                ...(end < count ? { nextPageToken: String(end) } : {}),
            };
        }
        else if (resource === "videos") {
            data = {
                items: url.searchParams.get("id").split(",").map((id) => {
                    const index = Number(id.slice(5));
                    return {
                        id,
                        status: { privacyStatus: "public" },
                        snippet: {
                            channelId: fixtureChannelId,
                            title: `Video ${index}`,
                            description: index % 2 ? `Description ${index}\nSecond line.` : "",
                            publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
                            thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } },
                            liveBroadcastContent: index % 2 ? "none" : "live",
                        },
                        contentDetails: { duration: "PT1H2M3S" },
                        statistics: { viewCount: "9007199254740993", likeCount: "120" },
                    };
                }),
            };
        }
        else {
            throw new Error(`Unexpected resource: ${resource}`);
        }
        return Response.json(transform(resource, data));
    };
}
