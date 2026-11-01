import { installGlobals } from "./fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { carouselState, carouselWidths } from "../src/utils/carousel.ts";
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

function fixture(context, loop = true, { navigation = false, count = 10, reduced = true } = {}) {
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
    const root = Object.assign(element(), {
        dataset: {
            loop: String(loop),
            navigation: String(navigation),
        },
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
    const window = element();
    window.matchMedia = () => Object.assign(new EventTarget(), { matches: reduced });
    const environment = {
        document,
        window,
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
        cancelAnimationFrame(id) { frames.delete(id); },
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
        document,
        window,
        frame,
        pendingFrames: () => frames.size,
        tick: (elapsed = 60_000) => context.mock.timers.tick(elapsed),
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

test("carousel remains stationary while idle and reduced-motion controls respond immediately", (context) => {
    const view = fixture(context);
    for (const event of ["mouseenter", "mouseleave", "focusin"]) view.root.dispatch(event);
    view.document.hidden = true;
    view.document.dispatch("visibilitychange");
    view.window.dispatch("blur");
    view.tick();
    assert.deepEqual(view.visible(), [0, 1, 2]);
    assert.equal(view.pendingFrames(), 0);
    view.previous.dispatch("click");
    assert.deepEqual(view.visible(), [9, 0, 1]);
    view.next.dispatch("click");
    view.next.dispatch("click");
    assert.deepEqual(view.visible(), [1, 2, 3]);
    assert.equal(view.pendingFrames(), 0);
    view.tick();
    assert.deepEqual(view.visible(), [1, 2, 3]);
});

test("carousel scrolls through intermediate positions, wraps without clones and yields to manual input", (context) => {
    const view = fixture(context, true, { reduced: false });
    view.next.dispatch("click");
    view.frame();
    view.frame(280);
    assert.ok(view.track.scrollLeft > 0 && view.track.scrollLeft < 104);
    view.frame(280);
    assert.deepEqual(view.visible(), [1, 2, 3]);
    view.previous.dispatch("click");
    view.previous.dispatch("click");
    view.frame();
    view.frame(560);
    assert.deepEqual(view.visible(), [9, 0, 1]);
    assert.equal(new Set(view.track.children).size, view.cards.length);
    view.next.dispatch("click");
    view.frame();
    view.frame(200);
    view.track.dispatch("pointerdown");
    const stopped = view.track.scrollLeft;
    view.frame(1000);
    assert.equal(view.track.scrollLeft, stopped);
    assert.equal(view.pendingFrames(), 0);
});

test("playlist labels also scroll between positions and settle into their final widths", (context) => {
    const view = fixture(context, true, { navigation: true, reduced: false });
    view.next.dispatch("click");
    view.frame();
    view.frame(280);
    assert.ok(view.track.scrollLeft > 0);
    view.frame(280);
    assert.deepEqual(view.visible(), [1, 2, 3, 4]);
    assert.equal(view.selected(), 1);
});

test("unequal playlist labels keep their bounds continuous at either end of a move and across wraps", (context) => {
    const view = fixture(context, true, { navigation: true, reduced: false });
    function bounds() {
        return view.cards.map((card) => card.getBoundingClientRect());
    }
    function continuous(before, after) {
        before.forEach((rect, index) => {
            const next = after[index];
            if (rect.right > 1 && rect.left < view.track.clientWidth - 1 && next.right > 1 && next.left < view.track.clientWidth - 1) {
                assert.ok(Math.abs(next.left - rect.left) < 0.01, `label ${index} position jumped`);
                assert.ok(Math.abs(next.width - rect.width) < 0.01, `label ${index} width jumped`);
            }
        });
    }
    for (const control of [view.previous, view.next, view.next, view.previous]) {
        const start = bounds();
        control.dispatch("click");
        view.frame();
        view.frame(1);
        continuous(start, bounds());
        view.frame(558);
        const almost = bounds();
        view.frame(1);
        continuous(almost, bounds());
    }
    view.next.dispatch("click");
    view.frame();
    view.frame(280);
    const middle = bounds();
    view.previous.dispatch("click");
    continuous(middle, bounds());
    view.frame();
    view.frame(560);
    assert.equal(new Set(view.track.children).size, view.cards.length);
});

test("playlist selection wraps manually even when every label fits and never advances on a timer", (context) => {
    const view = fixture(context, true, { navigation: true, count: 2 });
    view.tick();
    assert.equal(view.selected(), 0);
    view.next.dispatch("click");
    assert.equal(view.selected(), 1);
    view.next.dispatch("click");
    assert.equal(view.selected(), 0);
    view.previous.dispatch("click");
    assert.equal(view.selected(), 1);
    view.tick();
    assert.equal(view.selected(), 1);
    assert.equal(view.pendingFrames(), 0);
});

test("a single playlist needs no navigation and cannot change selection", (context) => {
    const view = fixture(context, true, { navigation: true, count: 1 });
    assert.equal(view.previous.disabled, true);
    assert.equal(view.next.disabled, true);
    view.next.dispatch("click");
    view.tick();
    assert.equal(view.selected(), 0);
});
