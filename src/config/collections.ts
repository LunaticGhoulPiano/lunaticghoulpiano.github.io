// common
export const collectionPageSize = 10;
export const pageTurnInterval = 8_000;
export const pageTurnDuration = 650;
export const feedHeadingHeight = 65;

// github
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
export const youtubeFeedVideoLimit = 10;
export const youtubeFeedTimelineSize = 3;
export const youtubeVideoSortOptions = ["newest", "oldest", "mostViewed", "mostLiked"] as const;
export const youtubePlaylistNavigation = {
    visibleItems: 4,
    interval: 5_000,
    duration: 450,
};
export const youtubeProjectsLayout = {
    visibleItems: 3,
    itemHeight: 176,
    mobileItemHeight: 280,
    playlistDescriptionLines: 2,
};
export const youtubeVideoLayout = {
    titleLines: 2,
    descriptionLines: 3,
};

// mymusic5
export const mymusic5FeedSheetLimit = 10;
export const mymusic5FeedTimelineSize = 3;
export const mymusic5ProjectsLayout = {
    visibleItems: 3,
};
export const mymusic5SheetLayout = {
    itemHeight: 224,
    mobileItemHeight: 280,
    titleLines: 2,
    descriptionLines: 2,
};
