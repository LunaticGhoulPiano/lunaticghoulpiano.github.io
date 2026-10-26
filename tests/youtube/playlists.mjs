import { installGlobals } from "../fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { initializeYoutubePlaylists } from "../../src/scripts/youtube.ts";

function fixture(context, { playlists = true } = {}) {
    const metadata = {
        newest: { date: "2026-10-18T00:00:00Z", videoViews: "9007199254740992", videoLikes: "0" },
        oldest: { date: "2020-01-01T00:00:00Z", videoViews: "9007199254740993" },
        collaborator: { date: "2024-06-01T00:00:00Z", videoLikes: "12" },
    };
    const list = {
        children: [],
        append(row) {
            row.remove();
            this.children.push(row);
        },
    };
    function row(id) {
        return {
            dataset: { videoId: id, ...metadata[id] },
            querySelector() { return { getAttribute: () => metadata[id].date }; },
            hidden: false,
            remove() {
                list.children = list.children.filter((item) => item !== this);
            },
            cloneNode() {
                return row(id);
            },
        };
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
    const empty = { dataset: { allLabel: "No uploads", playlistLabel: "No public playlist videos" } };
    const viewport = { scrollTop: 300 };
    let updates = 0;
    const timeline = Object.assign(new EventTarget(), { querySelector: () => viewport });
    timeline.addEventListener("timeline:change", () => updates++);
    const controls = { hidden: true, querySelectorAll: () => buttons };
    const sort = Object.assign(new EventTarget(), { value: "mostLiked" });
    const sortControls = { hidden: true };
    const window = new EventTarget();
    const nodes = {
        "[data-youtube-controls]": playlists ? controls : null,
        "[data-youtube-sort]": sort,
        "[data-youtube-sort-controls]": sortControls,
        ".youtube-videos": list,
        "[data-youtube-description]": description,
        "[data-youtube-empty]": empty,
        "[data-timeline-window]": timeline,
    };
    const root = { dataset: {}, querySelector: (selector) => nodes[selector], querySelectorAll: () => buttons };
    const environment = { document: { querySelectorAll: () => [root] }, window };
    installGlobals(context, environment);
    initializeYoutubePlaylists();
    initializeYoutubePlaylists();
    return {
        buttons, originals, list, description, empty, viewport, controls, sort, sortControls, window,
        updates: () => updates,
        select(index) { buttons[index].dispatchEvent(new Event("carousel:select")); },
        order(value) { sort.value = value; sort.dispatchEvent(new Event("change")); },
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
