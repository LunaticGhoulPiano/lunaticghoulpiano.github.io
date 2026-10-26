import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paginationState } from "../src/utils/pagination.ts";
import { paginationFor } from "../src/scripts/pagination.ts";

const template = await readFile(new URL("../src/components/common/Pagination.astro", import.meta.url), "utf8");

function fixture(totalItems) {
    const controls = [...template.matchAll(/<(button|span)\b[^>]*data-page-(control|gap)="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map((match) => {
        const attributes = new Map();
        return Object.assign(new EventTarget(), {
            dataset: { [match[2] === "control" ? "pageControl" : "pageGap"]: match[3] },
            textContent: match[4].replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
            hidden: false,
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: (name) => attributes.get(name),
            focus() {},
        });
    });
    const status = {};
    const navigation = {
        dataset: { pageSize: "10", formatLocale: "en", pageLabel: "Page {page}", statusLabel: "Page {page} of {total}" },
        querySelectorAll: (selector) => controls.filter((control) => selector === "[data-page-control]" ? control.dataset.pageControl : control.dataset.pageGap),
        querySelector: (selector) => selector === "[data-page-status]" ? status : controls.find((control) => control.dataset.pageControl === "current"),
    };
    let items = Array.from({ length: totalItems }, () => ({ hidden: false }));
    const root = { querySelector: () => navigation, querySelectorAll: () => items };
    const controller = paginationFor(root);
    return {
        controls, navigation, status,
        visible: () => controls.filter((control) => ! control.hidden).map((control) => control.textContent).join(" "),
        visibleItems: () => items.flatMap((item, index) => item.hidden ? [] : [index]),
        click(role) {
            const control = controls.find((control) => control.dataset.pageControl === role);
            assert.equal(control.hidden, false);
            control.dispatchEvent(new Event("click"));
        },
        replace(count) {
            items = Array.from({ length: count }, () => ({ hidden: false }));
            controller.setItems(items);
        },
    };
}

test("pagination handles boundaries, oversized page requests and smaller filtered collections", () => {
    const first = paginationState(27, 10);
    assert.deepEqual([first.previous, first.page, first.next, first.totalPages], [null, 1, 2, 3]);
    const middle = paginationState(27, 10, 2);
    assert.deepEqual([middle.previous, middle.page, middle.next, middle.start, middle.end], [1, 2, 3, 10, 20]);
    const last = paginationState(27, 10, 999);
    assert.deepEqual([last.previous, last.page, last.next, last.start, last.end], [2, 3, null, 20, 27]);
    const filtered = paginationState(2, 10, 3);
    assert.deepEqual([filtered.previous, filtered.page, filtered.next, filtered.totalPages], [null, 1, null, 1]);
    assert.equal(paginationState(0, 10).totalPages, 0);
    assert.equal(paginationState(27, 10, -5).page, 1);
    assert.throws(() => paginationState(27, 0), /positive integer/);
});

test("all 31 pages retain unique endpoints and neighboring numbers without arrow controls", () => {
    const page = fixture(303);
    const label = (number) => String(number).padStart(2, "0");
    const layouts = [
        "01 02 ... 31",
        "01 02 03 ... 31",
        "01 02 03 04 ... 31",
        ...Array.from({ length: 25 }, (_, index) => {
            const current = index + 4;
            return `01 ... ${label(current - 1)} ${label(current)} ${label(current + 1)} ... 31`;
        }),
        "01 ... 28 29 30 31",
        "01 ... 29 30 31",
        "01 ... 30 31",
    ];
    for (const [index, expected] of layouts.entries()) {
        assert.equal(page.visible(), expected, `Page ${index + 1}`);
        assert.equal(page.status.textContent, `Page ${label(index + 1)} of 31`);
        if (index < layouts.length - 1) page.click("next");
    }
    assert.deepEqual(page.visibleItems(), [300, 301, 302]);
    page.click("first-page");
    assert.equal(page.visible(), "01 02 ... 31");
    assert.deepEqual(page.visibleItems(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    page.click("last-page");
    assert.equal(page.visible(), "01 ... 30 31");
    assert.deepEqual(page.visibleItems(), [300, 301, 302]);
    page.click("previous");
    assert.equal(page.visible(), "01 ... 29 30 31");
    page.click("first-page");
    assert.equal(page.visible(), "01 02 ... 31");
    assert.equal(page.controls.find((control) => control.dataset.pageControl === "last-page").getAttribute("aria-label"), "Page 31");
});

test("filtering or replacing results updates pagination totals without duplicate endpoints or stale gaps", () => {
    const page = fixture(303);
    page.click("last-page");
    page.replace(21);
    assert.equal(page.visible(), "1 2 3");
    page.click("next");
    assert.equal(page.visible(), "1 2 3");
    page.click("next");
    assert.equal(page.visible(), "1 2 3");
    page.replace(11);
    assert.equal(page.visible(), "1 2");
    page.click("next");
    assert.equal(page.visible(), "1 2");
    page.replace(1);
    assert.equal(page.visible(), "1");
    assert.deepEqual(page.visibleItems(), [0]);
    page.replace(0);
    assert.equal(page.navigation.hidden, true);
    page.replace(303);
    assert.equal(page.navigation.hidden, false);
    assert.equal(page.visible(), "01 02 ... 31");
});
