import { carouselState, carouselWidths } from "../utils/carousel.ts";
import { createAutoAdvance } from "./auto_advance.ts";

export function initializeCarousels() {
    document.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
        if (carousel.dataset.ready) return;
        const track = carousel.querySelector<HTMLElement>("[data-carousel-track]")!;
        const cards = [...track.children] as HTMLElement[];
        const previous = carousel.querySelector<HTMLButtonElement>("[data-carousel-previous]")!;
        const next = carousel.querySelector<HTMLButtonElement>("[data-carousel-next]")!;
        const position = carousel.querySelector<HTMLElement>("[data-carousel-position]")!;
        const controls = carousel.querySelector<HTMLElement>("[data-carousel-controls]")!;
        const scrollbar = carousel.querySelector<HTMLElement>("[data-carousel-scrollbar]");
        const space = carousel.querySelector<HTMLElement>("[data-carousel-space]");
        const navigation = carousel.dataset.navigation === "true";
        const loop = carousel.dataset.loop === "true";
        const duration = Number(carousel.dataset.slideDuration);
        let offset = 0;
        let base = 0;
        let columns = 1;
        let step = 1;
        let maximum = 0;
        let trackWidth = 0;
        let barWidth = 0;
        let trackOffset = 0;
        let barOffset = 0;
        let gap = 0;
        let naturalWidths: number[] = [];
        let selected = Math.max(0, cards.findIndex((card) => card.getAttribute("aria-pressed") === "true"));
        let state = carouselState(cards.length, columns, 0, loop);
        let sliding = false;
        let slideFrame = 0;
        let slideTimer: ReturnType<typeof setTimeout> | undefined;
        const automatic = createAutoAdvance(carousel.closest<HTMLElement>("[data-carousel-hover]") ?? carousel, {
            interval: Number(carousel.dataset.interval),
            advance: () => move(1, false),
            canAdvance: () => ! sliding && (navigation ? selectionState() : state).next !== null,
        });

        function selectionState() {
            return carouselState(cards.length, 1, selected, loop);
        }

        function select(index: number) {
            selected = index;
            cards.forEach((card, cardIndex) => card.setAttribute("aria-pressed", String(cardIndex === selected)));
            cards[selected]?.dispatchEvent(new Event("carousel:select"));
        }

        function stopSlide() {
            cancelAnimationFrame(slideFrame);
            clearTimeout(slideTimer);
            slideTimer = undefined;
            slideFrame = 0;
            sliding = false;
        }

        function syncHeight() {
            if (navigation) return;
            const viewport = track.getBoundingClientRect();
            const visible = cards.filter((card) => {
                const bounds = card.getBoundingClientRect();
                return bounds.right > viewport.left + 1 && bounds.left < viewport.right - 1;
            });
            const style = getComputedStyle(track);
            const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
            const height = Math.max(0, ...visible.map((card) => card.offsetHeight)) + padding;
            track.style.height = `${height}px`;
        }

        function render(requestedOffset: number, updateScrollbar = true) {
            offset = loop && maximum > 0
                ? ((requestedOffset % cards.length) + cards.length) % cards.length
                : Math.max(0, Math.min(maximum, requestedOffset));
            state = carouselState(cards.length, columns, Math.round(offset), loop);
            const lastLinearIndex = Math.max(0, cards.length - columns);
            base = navigation ? Math.floor(offset) : loop ? Math.max(0, Math.ceil(offset) - lastLinearIndex) : 0;

            // Move existing cards into the wraparound window without cloning their timelines.
            if (cards.length > 0) {
                while (track.firstElementChild !== cards[base]) track.append(track.firstElementChild!);
            }
            if (navigation) {
                const current = carouselState(cards.length, columns, base, loop).indices;
                const following = carouselState(cards.length, columns, base + 1, loop).indices;
                const available = track.clientWidth - Math.max(0, current.length - 1) * gap;
                const widths = carouselWidths(current.map((index) => naturalWidths[index]), available);
                const nextWidths = carouselWidths(following.map((index) => naturalWidths[index]), available);
                const progress = offset - base;
                for (let index = 0; index < cards.length; index++) {
                    const card = cards[(base + index) % cards.length];
                    let width = naturalWidths[(base + index) % cards.length];
                    if (index === 0) width = widths[0];
                    else if (index < current.length) width = widths[index] + (nextWidths[index - 1] - widths[index]) * progress;
                    else if (index === current.length) width = nextWidths.at(-1)!;
                    card.style.width = `${width}px`;
                    card.inert = index >= current.length + (progress > 0 ? 1 : 0);
                }
                track.scrollLeft = progress * ((widths[0] ?? 0) + gap);
            }
            else {
                track.scrollLeft = (offset - base) * step;
            }
            trackOffset = track.scrollLeft;
            const navigationState = navigation ? selectionState() : state;
            previous.disabled = navigationState.previous === null;
            next.disabled = navigationState.next === null;
            controls.hidden = ! navigation && state.previous === null && state.next === null;
            position.textContent = state.indices.map((cardIndex) => cards[cardIndex].getAttribute("aria-label") ?? cards[cardIndex].textContent ?? "").join(" · ");
            if (scrollbar) {
                if (updateScrollbar) scrollbar.scrollLeft = maximum > 0 ? offset / maximum * (scrollbar.scrollWidth - scrollbar.clientWidth) : 0;
                barOffset = scrollbar.scrollLeft;
                scrollbar.setAttribute("aria-valuemax", String(maximum));
                scrollbar.setAttribute("aria-valuenow", String(state.index));
                scrollbar.setAttribute("aria-valuetext", position.textContent);
            }
            syncHeight();
        }

        function move(direction: number, manual = true, changeSelection = true) {
            const target = direction < 0 ? state.previous : state.next;
            const selection = navigation && changeSelection ? selectionState() : null;
            const selectedTarget = selection ? direction < 0 ? selection.previous : selection.next : null;
            if (sliding || (target === null && selectedTarget === null)) return;
            automatic.cancel();
            position.setAttribute("aria-live", manual ? "polite" : "off");
            if (selectedTarget !== null) select(selectedTarget);
            if (target === null) {
                render(offset);
                automatic.schedule();
                return;
            }
            if (! automatic.reducedMotion.matches && Number.isFinite(duration) && duration > 0) {
                const start = offset;
                let end = target;
                if (loop && direction > 0 && end < start) end += cards.length;
                if (loop && direction < 0 && end > start) end -= cards.length;
                const startedAt = performance.now();
                sliding = true;
                function finish() {
                    if (! sliding) return;
                    stopSlide();
                    render(end);
                    automatic.schedule();
                }
                function frame(now: number) {
                    const progress = automatic.reducedMotion.matches
                        ? 1 : Math.min(1, (now - startedAt) / duration);
                    const eased = progress * progress * (3 - 2 * progress);
                    render(start + (end - start) * eased);
                    if (progress < 1) {
                        slideFrame = requestAnimationFrame(frame);
                    }
                    else {
                        finish();
                    }
                }
                slideFrame = requestAnimationFrame(frame);
                slideTimer = setTimeout(finish, duration);
            }
            else {
                render(target);
                automatic.schedule();
            }
        }

        function interact(requestedOffset: number, updateScrollbar = true) {
            stopSlide();
            position.setAttribute("aria-live", "polite");
            render(requestedOffset, updateScrollbar);
            automatic.schedule();
        }

        function geometryChanged() {
            return track.clientWidth !== trackWidth
                || (scrollbar?.clientWidth ?? 0) !== barWidth
                || Number.parseInt(getComputedStyle(track).getPropertyValue("--carousel-columns"), 10) !== columns;
        }

        previous.addEventListener("click", () => move(-1));
        next.addEventListener("click", () => move(1));
        if (navigation) {
            cards.forEach((card, index) => card.addEventListener("click", () => {
                select(index);
                if (card === cards[state.indices.at(-1)!] && columns > 1) move(1, true, false);
                automatic.schedule();
            }));
        }
        track.addEventListener("scroll", () => {
            if (geometryChanged()) {
                resize();
                return;
            }
            if (Math.abs(track.scrollLeft - trackOffset) <= 1) return;
            if (navigation) {
                track.scrollLeft = trackOffset;
                return;
            }
            interact(base + track.scrollLeft / step);
        }, {
            passive: true,
        });
        scrollbar?.addEventListener("scroll", () => {
            if (geometryChanged()) {
                resize();
                return;
            }
            if (Math.abs(scrollbar.scrollLeft - barOffset) <= 1) return;
            const distance = scrollbar.scrollWidth - scrollbar.clientWidth;
            interact(distance > 0 ? scrollbar.scrollLeft / distance * maximum : 0, false);
        }, {
            passive: true,
        });
        track.addEventListener("wheel", (event) => {
            const horizontal = event.deltaX || (event.shiftKey ? event.deltaY : 0);
            if (! horizontal || maximum === 0) return;
            event.preventDefault();
            if (navigation) {
                move(Math.sign(horizontal));
                return;
            }
            const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? track.clientWidth : 1;
            interact(offset + horizontal * scale / step);
        }, {
            passive: false,
        });
        scrollbar?.addEventListener("keydown", (event) => {
            if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                move(event.key === "ArrowLeft" ? -1 : 1);
            }
            else if (["Home", "End"].includes(event.key)) {
                event.preventDefault();
                interact(event.key === "Home" ? 0 : maximum);
            }
        });
        track.addEventListener("keydown", (event) => {
            if (event.target !== track || ! ["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
        });
        function resize() {
            const changed = geometryChanged();
            if (changed) stopSlide();
            const style = getComputedStyle(track);
            columns = Number.parseInt(style.getPropertyValue("--carousel-columns"), 10) || 1;
            gap = Number.parseFloat(style.columnGap);
            step = (track.clientWidth + gap) / columns;
            if (navigation && (changed || naturalWidths.length === 0)) {
                naturalWidths = cards.map((card) => {
                    card.style.width = "max-content";
                    return card.getBoundingClientRect().width;
                });
            }
            maximum = cards.length > columns ? (loop ? cards.length - 1 : cards.length - columns) : 0;
            if (navigation && changed) {
                offset = Math.round(offset);
                if (! carouselState(cards.length, columns, offset, loop).indices.includes(selected)) offset = selected;
            }
            trackWidth = track.clientWidth;
            barWidth = scrollbar?.clientWidth ?? 0;
            if (scrollbar && space) {
                space.style.width = `${scrollbar.clientWidth * (1 + maximum / columns)}px`;
                const nativeHeight = scrollbar.offsetHeight - scrollbar.clientHeight;
                scrollbar.style.height = `${Math.max(16, nativeHeight + 1)}px`;
            }
            render(offset);
            automatic.schedule();
        }
        let resizeFrame = 0;
        const observer = new ResizeObserver(() => {
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = 0;
                resize();
            });
        });
        observer.observe(track);
        if (! navigation) cards.forEach((card) => observer.observe(card));
        carousel.dataset.ready = "true";
        resize();
    });
}
