import { installGlobals } from "./fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { carouselState, carouselWidths } from "../src/utils/carousel.ts";
import { initializeCarousels } from "../src/scripts/carousel.ts";
import { githubCategorySlideInterval, githubCategorySlideDuration } from "../src/config/collections.ts";

function element() {
    const handlers = new Map();
    const attributes = new Map();
    return {
        dataset: {},
        style: {},
        hidden: false,
        disabled: false,
        addEventListener(type, callback) {
            handlers.set(type, callback);
        },
        dispatch(type, event = {}) {
            handlers.get(type)?.(event);
        },
        dispatchEvent(event) {
            handlers.get(event.type)?.(event);
            return true;
        },
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
    };
}

function fixture(context, loop = true, { interval = 0, duration = 0, hovered = false, reduced = false, navigation = false, count = 10, hoverScope = false } = {}) {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let columns = navigation ? 4 : 3;
    let resizeCallback;
    const gap = 12;
    const frames = new Map();
    let frameId = 0;
    let now = 0;
    const controls = element();
    const previous = element();
    const next = element();
    const position = element();
    const space = element();
    const track = Object.assign(element(), {
        children: [],
        clientWidth: 300,
        scrollLeft: 0,
        append(card) {
            this.children.splice(this.children.indexOf(card), 1);
            this.children.push(card);
        },
        getBoundingClientRect() {
            return {
                left: 0,
                right: this.clientWidth,
            };
        },
    });
    Object.defineProperty(track, "firstElementChild", {
        get: () => track.children[0],
    });
    const scrollbar = Object.assign(element(), {
        clientWidth: 240,
        clientHeight: 1,
        offsetHeight: 17,
        scrollLeft: 0,
    });
    Object.defineProperty(scrollbar, "scrollWidth", {
        get: () => Number.parseFloat(space.style.width),
    });
    const cards = Array.from({
        length: count,
    }, (_, index) => Object.assign(element(), {
        offsetHeight: 100 + index * 10,
        timelineScrollTop: index * 20,
        getBoundingClientRect() {
            if (navigation) {
                const width = this.style.width === "max-content" ? 40 + index * 10 : Number.parseFloat(this.style.width) || 40 + index * 10;
                const left = track.children.slice(0, track.children.indexOf(this)).reduce((sum, card) => sum + card.getBoundingClientRect().width + gap, 0) - track.scrollLeft;
                return { left, right: left + width, width };
            }
            const step = (track.clientWidth + gap) / columns;
            const left = track.children.indexOf(this) * step - track.scrollLeft;
            return {
                left,
                right: left + step - gap,
            };
        },
    }));
    cards.forEach((card, index) => card.setAttribute("aria-label", `Category ${index}`));
    const selections = [];
    if (navigation) cards.forEach((card, index) => {
        card.setAttribute("aria-pressed", String(index === 0));
        card.addEventListener("carousel:select", () => selections.push(index));
    });
    track.children = [...cards];
    const nodes = {
        track,
        previous,
        next,
        position,
        controls,
        scrollbar: navigation ? null : scrollbar,
        space: navigation ? null : space,
    };
    const hoverArea = hoverScope ? Object.assign(element(), { matches: () => hovered }) : null;
    const root = Object.assign(element(), {
        dataset: {
            loop: String(loop),
            interval: String(interval),
            slideDuration: String(duration),
            navigation: String(navigation),
        },
        matches: () => hovered,
        closest: () => hoverArea,
        contains: (target) => target != null && (cards.includes(target) || Object.values(nodes).includes(target)),
        querySelector(selector) {
            return nodes[selector.slice("[data-carousel-".length, -1)];
        },
    });
    const document = Object.assign(element(), {
        hidden: false,
        activeElement: null,
        querySelectorAll: () => [root],
    });
    const motion = Object.assign(element(), { matches: reduced });
    const window = Object.assign(element(), { matchMedia: () => motion });
    const environment = {
        document,
        window,
        performance: { now: () => now },
        getComputedStyle: () => ({
            columnGap: String(gap),
            paddingTop: "8",
            paddingBottom: "0",
            getPropertyValue: () => String(columns),
        }),
        ResizeObserver: class {
            constructor(callback) {
                resizeCallback = callback;
            }
            observe() {}
        },
        requestAnimationFrame(callback) {
            frames.set(++frameId, callback);
            return frameId;
        },
        cancelAnimationFrame: (id) => frames.delete(id),
    };
    installGlobals(context, environment, true);
    initializeCarousels();
    function frame(elapsed = 0) {
        now += elapsed;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(now));
    }
    return {
        ...nodes,
        cards,
        selections,
        root,
        hoverArea,
        document,
        window,
        motion,
        frame,
        tick: (elapsed = githubCategorySlideInterval) => context.mock.timers.tick(elapsed),
        visible: () => track.children.filter((card) => {
            const bounds = card.getBoundingClientRect();
            return bounds.right > 1 && bounds.left < track.clientWidth - 1;
        }).map((card) => cards.indexOf(card)),
        selected: () => cards.findIndex((card) => card.getAttribute("aria-pressed") === "true"),
        resize(visibleItems) {
            columns = visibleItems;
            track.clientWidth = 200;
            resizeCallback();
            frame();
        },
    };
}

test("carousel controls wrap one card at a time without replacing timeline nodes", (context) => {
    const view = fixture(context);
    assert.deepEqual(view.visible(), [0, 1, 2]);
    for (let index = 0; index < 7; index++) view.next.dispatch("click");
    assert.deepEqual(view.visible(), [7, 8, 9]);
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [8, 9, 0]);
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [9, 0, 1]);
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [0, 1, 2]);
    view.previous.dispatch("click");
    assert.deepEqual(view.visible(), [9, 0, 1]);
    assert.equal(view.position.textContent, "Category 9 · Category 0 · Category 1");
    assert.equal(view.track.style.height, "198px");
    assert.equal(new Set(view.track.children).size, view.cards.length);
    view.cards.forEach((card, index) => assert.equal(card.timelineScrollTop, index * 20));
});

test("navigation distributes label widths with equal extra space and fills narrow windows", () => {
    assert.deepEqual(carouselWidths([40, 80, 120, 160], 600), [90, 130, 170, 210]);
    assert.deepEqual(carouselWidths([40, 80, 120, 160], 200), [20, 40, 60, 80]);
    assert.deepEqual(carouselWidths([], 200), []);
});

test("navigation moves one label per arrow and rightmost selection, including wraparound", (context) => {
    const view = fixture(context, true, { navigation: true });
    assert.deepEqual(view.visible(), [0, 1, 2, 3]);
    assert.ok(Number.parseFloat(view.cards[3].style.width) > Number.parseFloat(view.cards[0].style.width));
    assert.equal(view.cards[4].inert, true);
    view.cards[1].dispatch("click");
    assert.deepEqual(view.visible(), [0, 1, 2, 3]);
    view.cards[3].dispatch("click");
    assert.deepEqual(view.visible(), [1, 2, 3, 4]);
    assert.equal(view.selected(), 3);
    view.previous.dispatch("click");
    assert.equal(view.selected(), 2);
    view.previous.dispatch("click");
    assert.deepEqual(view.visible(), [9, 0, 1, 2]);
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [0, 1, 2, 3]);
    assert.deepEqual(view.selections, [1, 3, 2, 1, 2]);
    assert.equal(new Set(view.track.children).size, view.cards.length);
});

test("navigation shares hover-only auto advance and maintains adjacent labels during animation", (context) => {
    const view = fixture(context, true, { navigation: true, interval: 5000, duration: 450, hovered: true });
    view.tick(5000);
    assert.deepEqual(view.visible(), [0, 1, 2, 3]);
    view.root.dispatch("mouseleave");
    view.tick(5000);
    view.frame(225);
    assert.ok(view.track.scrollLeft > 0);
    view.frame(225);
    assert.deepEqual(view.visible(), [1, 2, 3, 4]);
    assert.equal(view.selected(), 1);
    assert.deepEqual(view.selections, [1]);
    view.root.dispatch("mouseenter");
    view.tick(5000);
    assert.deepEqual(view.visible(), [1, 2, 3, 4]);
    assert.equal(view.selected(), 1);
    view.window.dispatch("blur");
    view.tick(5000);
    view.tick(450);
    assert.deepEqual(view.visible(), [2, 3, 4, 5]);
    view.resize(2);
    assert.deepEqual(view.visible(), [2, 3]);
    assert.equal(view.selected(), 2);
});

test("short navigation cycles selection even when all labels fit in the window", (context) => {
    const view = fixture(context, true, { navigation: true, count: 2, interval: 5000 });
    assert.deepEqual(view.visible(), [0, 1]);
    assert.equal(view.controls.hidden, false);
    assert.equal(view.previous.disabled, false);
    assert.equal(view.next.disabled, false);
    assert.equal(view.cards[1].getBoundingClientRect().right, view.track.clientWidth);
    view.tick(5000);
    assert.equal(view.selected(), 1);
    assert.deepEqual(view.visible(), [0, 1]);
    view.next.dispatch("click");
    assert.equal(view.selected(), 0);
    view.previous.dispatch("click");
    assert.equal(view.selected(), 1);
    assert.deepEqual(view.selections, [1, 0, 1]);
});

test("navigation selection wraps with automatic sliding and keeps a clicked selection during animation", (context) => {
    const view = fixture(context, true, { navigation: true, interval: 5000, duration: 450 });
    for (let index = 1; index <= 11; index++) {
        view.tick(5000);
        view.tick(450);
        assert.equal(view.selected(), index % 10);
        assert.ok(view.visible().includes(view.selected()));
        assert.equal(view.selections.length, index);
    }
    view.next.dispatch("click");
    view.cards[3].dispatch("click");
    view.frame(450);
    assert.equal(view.selected(), 3);
    assert.equal(view.selections.at(-1), 3);
    view.resize(1);
    assert.deepEqual(view.visible(), [3]);
    view.cards[3].dispatch("click");
    view.frame(450);
    assert.deepEqual(view.visible(), [3]);
    view.next.dispatch("click");
    view.frame(450);
    assert.deepEqual(view.visible(), [4]);
    assert.equal(view.selected(), 4);
});

test("one navigation item has no next selection or automatic advance", (context) => {
    const view = fixture(context, true, { navigation: true, count: 1, interval: 5000 });
    view.tick(10000);
    assert.equal(view.previous.disabled, true);
    assert.equal(view.next.disabled, true);
    assert.equal(view.selected(), 0);
    assert.deepEqual(view.selections, []);
});

test("a shared hover area pauses navigation while reading content outside the label track", (context) => {
    const view = fixture(context, true, { navigation: true, interval: 5000, hoverScope: true });
    view.hoverArea.dispatch("mouseenter");
    view.tick(15000);
    assert.equal(view.selected(), 0);
    assert.equal(view.hoverArea.dataset.paused, "true");
    view.hoverArea.dispatch("mouseleave");
    view.tick(5000);
    assert.equal(view.selected(), 1);
    assert.equal(view.hoverArea.dataset.paused, "false");
});

test("scrollbar movement, keyboard and responsive layout preserve the active window", (context) => {
    const view = fixture(context);
    view.scrollbar.scrollLeft = view.scrollbar.scrollWidth - view.scrollbar.clientWidth;
    view.scrollbar.dispatch("scroll");
    assert.deepEqual(view.visible(), [9, 0, 1]);
    view.resize(2);
    assert.deepEqual(view.visible(), [9, 0]);
    view.resize(1);
    assert.deepEqual(view.visible(), [9]);
    view.scrollbar.dispatch("keydown", {
        key: "ArrowRight",
        preventDefault() {},
    });
    assert.deepEqual(view.visible(), [0]);
    assert.equal(view.scrollbar.getAttribute("aria-valuenow"), "0");
});

test("non-looping carousel stops at both boundaries", (context) => {
    const view = fixture(context, false);
    assert.equal(view.previous.disabled, true);
    for (let index = 0; index < 12; index++) view.next.dispatch("click");
    assert.deepEqual(view.visible(), [7, 8, 9]);
    assert.equal(view.next.disabled, true);
    assert.equal(view.previous.disabled, false);
    for (let index = 0; index < 12; index++) view.previous.dispatch("click");
    assert.deepEqual(view.visible(), [0, 1, 2]);
    assert.equal(view.previous.disabled, true);
});

test("automatic sliding advances one card after each interval and wraps without replacing timelines", (context) => {
    const view = fixture(context, true, { interval: githubCategorySlideInterval, duration: githubCategorySlideDuration });
    view.tick(githubCategorySlideInterval - 1);
    assert.deepEqual(view.visible(), [0, 1, 2]);
    view.tick(1);
    view.frame(githubCategorySlideDuration / 2);
    assert.ok(view.track.scrollLeft > 0 && view.track.scrollLeft < 104);
    assert.deepEqual(view.visible(), [0, 1, 2, 3]);
    view.frame(githubCategorySlideDuration / 2);
    assert.deepEqual(view.visible(), [1, 2, 3]);
    assert.equal(view.position.getAttribute("aria-live"), "off");
    for (let index = 2; index <= 11; index++) {
        view.tick();
        view.frame(githubCategorySlideDuration);
        assert.deepEqual(view.visible(), [index % 10, (index + 1) % 10, (index + 2) % 10]);
    }
    assert.equal(new Set(view.track.children).size, view.cards.length);
    view.cards.forEach((card, index) => assert.equal(card.timelineScrollTop, index * 20));
});

test("only hover pauses sliding and keyboard focus does not prevent resuming", (context) => {
    const view = fixture(context, true, { interval: githubCategorySlideInterval, duration: githubCategorySlideDuration, hovered: true });
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [0, 1, 2]);
    view.root.dispatch("mouseleave");
    view.tick(githubCategorySlideInterval - 1);
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [0, 1, 2]);
    view.tick(1);
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [1, 2, 3]);
    view.root.dispatch("focusin");
    view.root.dispatch("mouseenter");
    view.root.dispatch("mouseleave");
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [2, 3, 4]);
    view.root.dispatch("focusout", { relatedTarget: null });
    view.document.hidden = true;
    view.document.dispatch("visibilitychange");
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [3, 4, 5]);
    view.root.matches = () => false;
    view.document.hidden = false;
    view.document.dispatch("visibilitychange");
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [4, 5, 6]);
});

test("boundary animations slide through adjacent cards in either direction", (context) => {
    const view = fixture(context, true, { duration: githubCategorySlideDuration });
    view.previous.dispatch("click");
    view.frame(githubCategorySlideDuration / 2);
    assert.deepEqual(view.visible(), [9, 0, 1, 2]);
    view.frame(githubCategorySlideDuration / 2);
    assert.deepEqual(view.visible(), [9, 0, 1]);
    view.next.dispatch("click");
    view.frame(githubCategorySlideDuration / 2);
    assert.deepEqual(view.visible(), [9, 0, 1, 2]);
    view.frame(githubCategorySlideDuration / 2);
    assert.deepEqual(view.visible(), [0, 1, 2]);
});

test("reduced motion skips animation without disabling automatic or manual navigation", (context) => {
    const view = fixture(context, true, { interval: githubCategorySlideInterval, duration: githubCategorySlideDuration, reduced: true });
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [1, 2, 3]);
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [2, 3, 4]);
    view.motion.matches = false;
    view.motion.dispatch("change");
    view.tick();
    view.frame(githubCategorySlideDuration);
    assert.deepEqual(view.visible(), [3, 4, 5]);
});

test("background sliding keeps looping without receiving animation frames", (context) => {
    const view = fixture(context, true, { interval: githubCategorySlideInterval, duration: githubCategorySlideDuration });
    view.document.hidden = true;
    view.document.dispatch("visibilitychange");
    for (let index = 1; index <= 11; index++) {
        view.tick();
        view.tick(githubCategorySlideDuration);
        assert.deepEqual(view.visible(), [index % 10, (index + 1) % 10, (index + 2) % 10]);
    }
});

test("carousel advances one item across either boundary and stops when looping is disabled", () => {
    const first = carouselState(9, 3, 0, true);
    assert.deepEqual(first.indices, [0, 1, 2]);
    const beforeFirst = carouselState(9, 3, first.previous, true);
    assert.deepEqual(beforeFirst.indices, [8, 0, 1]);
    assert.deepEqual(carouselState(9, 3, beforeFirst.next, true).indices, [0, 1, 2]);
    assert.deepEqual(carouselState(9, 3, 10, true).indices, [1, 2, 3]);
    assert.deepEqual(carouselState(9, 3, -10, true).indices, [8, 0, 1]);

    let window = carouselState(10, 3, 7, true);
    assert.deepEqual(window.indices, [7, 8, 9]);
    window = carouselState(10, 3, window.next, true);
    assert.deepEqual(window.indices, [8, 9, 0]);
    window = carouselState(10, 3, window.next, true);
    assert.deepEqual(window.indices, [9, 0, 1]);
    window = carouselState(10, 3, window.next, true);
    assert.deepEqual(window.indices, [0, 1, 2]);
    for (const visible of [1, 2, 3]) {
        let current = carouselState(10, visible, 0, true);
        for (let step = 0; step < 20; step += 1) {
            const forward = carouselState(10, visible, current.next, true);
            assert.equal(forward.index, (current.index + 1) % 10);
            assert.deepEqual(forward.indices.slice(0, -1), current.indices.slice(1));
            assert.deepEqual(carouselState(10, visible, forward.previous, true), current);
            current = forward;
        }
    }

    const boundedFirst = carouselState(9, 3, -1);
    assert.equal(boundedFirst.previous, null);
    assert.deepEqual(boundedFirst.indices, [0, 1, 2]);
    const boundedLast = carouselState(9, 3, 8);
    assert.deepEqual(boundedLast.indices, [6, 7, 8]);
    assert.equal(boundedLast.next, null);
    assert.equal(boundedLast.previous, 5);

    assert.deepEqual(carouselState(9, 1, 8, true).indices, [8]);
    assert.deepEqual(carouselState(2, 3, 1, true), {
        index: 0,
        indices: [0, 1],
        previous: null,
        next: null,
    });
    assert.deepEqual(carouselState(0, 3).indices, []);
    assert.throws(() => carouselState(9, 0), /positive integer/);
});
