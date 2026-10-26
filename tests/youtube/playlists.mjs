import { installGlobals, textElement } from "../fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { initializeYoutubePlaylists } from "../../src/scripts/youtube.ts";

function fixture(context, { playlists = true } = {}) {
    const metadata = {
        newest: { date: "2026-10-18T00:00:00Z", videoViews: "9007199254740992", videoLikes: "0", search: "Piano performance 鋼琴" },
        oldest: { date: "2020-01-01T00:00:00Z", videoViews: "9007199254740993", search: "Concert Description with piano" },
        collaborator: { date: "2024-06-01T00:00:00Z", videoLikes: "12", search: "Piano collaboration ピアノ" },
    };
    const list = {
        children: [],
        append(row) {
            row.remove();
            this.children.push(row);
        },
    };
    function row(id) {
        return Object.assign(textElement(metadata[id].search), {
            dataset: { videoId: id, ...metadata[id] },
            querySelector() { return { getAttribute: () => metadata[id].date }; },
            hidden: false,
            remove() {
                list.children = list.children.filter((item) => item !== this);
            },
            cloneNode() {
                return row(id);
            },
        });
    }
    const originals = ["newest", "oldest", "collaborator"].map(row);
    originals[2].hidden = true;
    list.children = [...originals];
    const buttons = (playlists ? [
        { id: "", ids: ["newest", "oldest"], description: "" },
        { id: "PL_collaboration", ids: ["oldest", "collaborator", "oldest"], description: "<b>Literal description</b>" },
        { id: "PL_empty", ids: [], description: "Empty" },
    ] : []).map(({ id, ids, description }) => Object.assign(new EventTarget(), {
        dataset: { youtubeFilter: id, videoIds: JSON.stringify(ids), description },
        setAttribute(name, value) { this[name] = value; },
    }));
    const description = {};
    const empty = { dataset: { allLabel: "No uploads", playlistLabel: "No public playlist videos", searchLabel: "No matching videos" } };
    const viewport = { scrollTop: 300 };
    let updates = 0;
    const timeline = Object.assign(new EventTarget(), { querySelector: () => viewport });
    timeline.addEventListener("timeline:change", () => updates++);
    const controls = { hidden: true, querySelectorAll: () => buttons };
    const sort = Object.assign(new EventTarget(), { value: "mostLiked" });
    const sortControls = { hidden: true };
    const search = Object.assign(new EventTarget(), { value: "" });
    const searchControls = { hidden: true };
    const window = new EventTarget();
    const nodes = {
        "[data-youtube-controls]": playlists ? controls : null,
        "[data-youtube-sort]": sort,
        "[data-youtube-sort-controls]": sortControls,
        ".youtube-videos": list,
        "[data-youtube-description]": description,
        "[data-youtube-empty]": empty,
        "[data-timeline-window]": timeline,
        "[data-list-search]": search,
        "[data-list-search-controls]": searchControls,
    };
    const root = { dataset: {}, querySelector: (selector) => nodes[selector], querySelectorAll: () => buttons };
    const environment = { document: { querySelectorAll: () => [root] }, window };
    installGlobals(context, environment);
    initializeYoutubePlaylists();
    initializeYoutubePlaylists();
    return {
        buttons, originals, list, description, empty, viewport, controls, sort, sortControls, searchControls, window,
        updates: () => updates,
        select(index) { buttons[index].dispatchEvent(new Event("carousel:select")); },
        order(value) { sort.value = value; sort.dispatchEvent(new Event("change")); },
        search(value) { search.value = value; search.dispatchEvent(new Event("input")); },
        visible: () => list.children.filter((item) => ! item.hidden).map((item) => item.dataset.videoId),
    };
}

test("playlist switching sorts the view while preserving membership, repeated entries and original rows", (context) => {
    const view = fixture(context);
    assert.equal(view.controls.hidden, false);
    view.select(1);
    assert.deepEqual(view.visible(), ["collaborator", "oldest", "oldest"]);
    assert.deepEqual(JSON.parse(view.buttons[1].dataset.videoIds), ["oldest", "collaborator", "oldest"]);
    assert.equal(view.description.textContent, "<b>Literal description</b>");
    assert.equal(view.viewport.scrollTop, 0);
    assert.equal(view.updates(), 2);
    view.select(0);
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
    assert.equal(view.list.children.length, view.originals.length);
    assert.ok(view.originals.every((row) => view.list.children.includes(row)));
    assert.equal(view.description.textContent, "");
    assert.equal(view.updates(), 3);
});

test("empty playlists show the empty state and can switch back to populated playlists", (context) => {
    const view = fixture(context);
    view.select(1);
    view.select(2);
    assert.deepEqual(view.visible(), []);
    assert.equal(view.empty.hidden, false);
    assert.equal(view.empty.textContent, view.empty.dataset.playlistLabel);
    view.select(1);
    assert.deepEqual(view.visible(), ["collaborator", "oldest", "oldest"]);
    assert.equal(view.empty.hidden, true);
});

test("sorting covers both date directions and precise counts, with missing counts last", (context) => {
    const view = fixture(context);
    assert.equal(view.sort.value, "newest");
    assert.equal(view.sortControls.hidden, false);
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
    view.order("oldest");
    assert.deepEqual(view.visible(), ["oldest", "newest"]);
    view.order("mostViewed");
    assert.deepEqual(view.visible(), ["oldest", "newest"]);
    view.order("mostLiked");
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
    view.select(1);
    assert.deepEqual(view.visible(), ["collaborator", "oldest", "oldest"]);
    view.order("mostViewed");
    assert.deepEqual(view.visible(), ["oldest", "oldest", "collaborator"]);
    assert.equal(view.viewport.scrollTop, 0);
});

test("sort order resets when the page is shown again and also works without playlists", (context) => {
    const view = fixture(context, { playlists: false });
    view.order("oldest");
    assert.deepEqual(view.visible(), ["oldest", "newest"]);
    view.window.dispatchEvent(new Event("pageshow"));
    assert.equal(view.sort.value, "newest");
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
});

test("video search filters the current playlist and retains sorting, duplicate entries and original rows", (context) => {
    const view = fixture(context);
    assert.equal(view.searchControls.hidden, false);
    view.search("  PIANO  ");
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
    assert.deepEqual(view.originals[0].querySelectorAll("mark").map((mark) => mark.textContent), ["Piano"]);
    view.order("oldest");
    assert.deepEqual(view.visible(), ["oldest", "newest"]);
    view.search("piano description");
    assert.deepEqual(view.visible(), ["oldest"]);
    view.select(1);
    assert.deepEqual(view.visible(), ["oldest", "oldest"]);
    view.search("ピアノ");
    assert.deepEqual(view.visible(), ["collaborator"]);
    view.select(0);
    assert.deepEqual(view.visible(), []);
    assert.equal(view.empty.hidden, false);
    assert.equal(view.empty.textContent, view.empty.dataset.searchLabel);
    view.search("");
    assert.deepEqual(view.visible(), ["oldest", "newest"]);
    assert.equal(view.originals[0].querySelectorAll("mark").length, 0);
    assert.equal(view.empty.hidden, true);
    assert.equal(view.list.children.length, view.originals.length);
    assert.ok(view.originals.every((row) => view.list.children.includes(row)));
    assert.equal(view.viewport.scrollTop, 0);
});

test("video search works without playlists and resets the existing timeline after every query", (context) => {
    const view = fixture(context, { playlists: false });
    const before = view.updates();
    view.search("鋼琴");
    assert.deepEqual(view.visible(), ["newest"]);
    view.search("not-found");
    assert.deepEqual(view.visible(), []);
    view.search(" \t\n");
    assert.deepEqual(view.visible(), ["newest", "oldest"]);
    assert.equal(view.updates(), before + 3);
});
