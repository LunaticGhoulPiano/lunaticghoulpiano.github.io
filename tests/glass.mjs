import assert from "node:assert/strict";
import { test } from "node:test";
import { brickGeometry } from "../src/scripts/glass/brick.js";
import { lightOnGlass } from "../src/scripts/glass/lighting.js";
import { createGlassCursor } from "../src/scripts/glass/cursor.ts";
import { contentTransitionFixture, installGlobals } from "./fixture.mjs";

test("a larger panel keeps the same physical bevel and a clear face", () => {
    for (const [width, height] of [[190, 320], [400, 700], [1200, 90]]) {
        assert.equal(brickGeometry(width, height, [8, 8, 8, 8], 9).bevel, 9);
    }
    const small = brickGeometry(16, 16, [12, 12, 0, 0], 9);
    assert.deepEqual(small.corners, [8, 8, 0, 0]);
    assert.ok(small.bevel < 8);
});

test("the same pointer lights opposite edges of separate surfaces and attenuates with distance", () => {
    const left = { left: 20, top: 30, width: 80, height: 40 };
    const right = { ...left, left: 260 };
    const near = lightOnGlass(left, 110, 50);
    const far = lightOnGlass(right, 110, 50);
    assert.equal(near.angle, 0);
    assert.equal(far.angle, Math.PI);
    assert.equal(near.x, 80);
    assert.equal(far.x, 0);
    assert.ok(near.power > far.power);
});

test("the native hotspot is restored after the 3D turn and the halo lasts exactly as long as the press", context => {
    const clock = contentTransitionFixture();
    const props = new Map();
    const animations = [];
    class Element {
        style = {
            setProperty: (key, val) => props.set(key, val), getPropertyValue: key => props.get(key),
            removeProperty: key => props.delete(key),
        };
        attributes = new Set();
        children = [];
        clientWidth = 800;
        clientHeight = 600;
        append(child) { this.children.push(child); child.parentElement = this; }
        setAttribute(key) { this.attributes.add(key); }
        toggleAttribute(key, on) { if (on) this.setAttribute(key); else this.removeAttribute(key); }
        removeAttribute(key) { this.attributes.delete(key); }
        matches() { return this.open; }
        showPopover() { this.open = true; }
        hidePopover() { this.open = false; }
        animate(frames, options) {
            const animation = { frames, options, cancel() { this.cancelled = true; }, effect: { getComputedTiming: () => ({ progress: .75 }) } };
            animations.push(animation);
            return animation;
        }
        remove() {}
    }
    const root = new Element(), body = new Element();
    const win = clock.environment.window;
    const media = new EventTarget();
    const reduced = new EventTarget();
    media.matches = true;
    reduced.matches = false;
    installGlobals(context, {
        window: win, HTMLElement: Element,
        matchMedia: query => query.includes("reduced-motion") ? reduced : media,
        document: Object.assign(new EventTarget(), { documentElement: root, body, createElement: () => new Element(), querySelector: () => null }),
    });
    const cursor = createGlassCursor();
    const press = type => win.dispatchEvent(Object.assign(new Event(type), {
        button: 0, pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 120,
    }));
    const rest = props.get("--glass-pointer"), lit = props.get("--glass-pressed-pointer");
    assert.notEqual(rest, lit);
    press("pointerdown");
    const [sprite] = body.children;
    const [view] = sprite.children;
    assert.match(view.style.transform, /rotateX\(55deg\)/);
    assert.equal(view.children[0].children.length, 5);
    assert.deepEqual(animations[0].frames, [{ transform: "rotateZ(0deg)" }, { transform: "rotateZ(-360deg)" }]);
    assert.deepEqual(animations[0].options, { duration: 500, easing: "ease-in-out" });
    assert.equal(sprite.attributes.has("data-pressed"), true);
    animations[0].onfinish();
    assert.equal(sprite.open, false);
    assert.equal(props.get("--glass-pointer"), lit, "a long press still glows after the spin");
    press("pointerup");
    assert.equal(props.get("--glass-pointer"), rest);

    press("pointerdown");
    press("pointerup");
    assert.equal(sprite.attributes.has("data-pressed"), false);
    assert.equal(sprite.open, true, "a short click finishes its turn after release");
    press("pointerdown");
    const previous = animations[1], restarted = animations[2];
    assert.equal(previous.cancelled, true);
    assert.deepEqual(restarted.frames, [{ transform: "rotateZ(-270deg)" }, { transform: "rotateZ(-720deg)" }]);
    assert.equal(restarted.options.duration, 500);
    previous.onfinish();
    press("pointerup");
    assert.equal(sprite.open, true, "neither the previous finish nor a release interrupts the latest spin");
    restarted.onfinish();
    assert.equal(sprite.open, false);
    win.dispatchEvent(new Event("blur"));
    assert.equal(root.attributes.has("data-ice-turn"), false);
    reduced.matches = true;
    press("pointerdown");
    assert.equal(animations.length, 3);
    assert.equal(props.get("--glass-pointer"), lit);
    press("pointercancel");
    assert.equal(props.get("--glass-pointer"), rest);
    cursor.remove();
});
