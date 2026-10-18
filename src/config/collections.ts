// common
export const collectionPageSize = 10;
export const pageTurnInterval = 8_000;
export const pageTurnDuration = 650;

// github
export const githubTimelinePreviewSize = 7;
export const githubTimelineCategorySize = 4;
const githubCategoryItemHeight = 130;
export const githubActivityCategoryLayout = {
    height: 680,
    timelineHeight: githubTimelineCategorySize * githubCategoryItemHeight,
    itemHeight: githubCategoryItemHeight,
    repositoryLines: 2,
};
export const githubCategorySlideInterval = 5_000;
export const githubCategorySlideDuration = 450;

// youtube
export const youtubeTimelinePreviewSize = 3;
export const youtubeVideoSortOptions = ["newest", "oldest", "mostViewed", "mostLiked"] as const;
export const youtubePlaylistNavigation = {
    visibleItems: 4,
    interval: 5_000,
    duration: 450,
};
export const youtubePageLayout = {
    visibleItems: 3,
    itemHeight: 176,
    mobileItemHeight: 280,
    playlistDescriptionLines: 2,
};
export const youtubeVideoLayout = {
    titleLines: 2,
    descriptionLines: 3,
};
