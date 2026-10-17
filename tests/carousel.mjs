import test from "node:test";
import assert from "node:assert/strict";
import { carouselState } from "../src/utils/carousel.ts";
import { initializeCarousels } from "../src/scripts/carousel.ts";

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
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
    };
}

function fixture(context, loop = true) {
    let columns = 3;
    let resizeCallback;
    const gap = 12;
    const frames = [];
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
        length: 10,
    }, (_, index) => Object.assign(element(), {
        offsetHeight: 100 + index * 10,
        timelineScrollTop: index * 20,
        getBoundingClientRect() {
            const step = (track.clientWidth + gap) / columns;
            const left = track.children.indexOf(this) * step - track.scrollLeft;
            return {
                left,
                right: left + step - gap,
            };
        },
    }));
    cards.forEach((card, index) => card.setAttribute("aria-label", `Category ${index}`));
    track.children = [...cards];
    const nodes = {
        track,
        previous,
        next,
        position,
        controls,
        scrollbar,
        space,
    };
    const root = {
        dataset: {
            loop: String(loop),
        },
        querySelector(selector) {
            return nodes[selector.slice("[data-carousel-".length, -1)];
        },
    };
    const environment = {
        document: {
            querySelectorAll: () => [root],
        },
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
            frames.push(callback);
            return frames.length;
        },
    };
    const previousGlobals = new Map(Object.keys(environment).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(environment)) Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
    });
    context.after(() => {
        for (const [key, descriptor] of previousGlobals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
    initializeCarousels();
    return {
        ...nodes,
        cards,
        visible: () => track.children.filter((card) => {
            const bounds = card.getBoundingClientRect();
            return bounds.right > 1 && bounds.left < track.clientWidth - 1;
        }).map((card) => cards.indexOf(card)),
        resize(visibleItems) {
            columns = visibleItems;
            track.clientWidth = 200;
            resizeCallback();
            while (frames.length) frames.shift()();
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
