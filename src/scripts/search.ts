import { createSearchIndex, readSearchState, searchParameters, searchSnippet, searchFilterOptions, searchSourceValues, searchTerms, normalizeSearchText, type SearchDocument, type SearchState } from "../data/search.ts";
import { languages, type Locale } from "../config/locales.ts";
import { formatMessage, formatMetadata } from "../i18n/format.ts";
import type { useMessages } from "../i18n/ui";
import { paginationFor } from "./pagination.ts";
import { highlightMatches } from "./highlight.ts";
import { getRoutePath, getRouteTitle } from "../routing.ts";

type DiscoveryFilters = Pick<SearchState, "category" | "tags">;
const discoveryControllers = new WeakMap<HTMLElement, { sync: (filters: DiscoveryFilters) => void; readonly filters: DiscoveryFilters }>();

export function filterDiscoveryOptions(group: HTMLElement) {
    const input = group.querySelector<HTMLInputElement>("[data-filter-search]")!;
    const term = normalizeSearchText(input.value).trim();
    let visible = 0;
    for (const row of group.querySelectorAll<HTMLElement>("[data-filter-option]")) {
        const selected = row.querySelector<HTMLInputElement>("input")!.checked;
        row.hidden = ! selected && ! normalizeSearchText(row.dataset.filterLabel!).includes(term);
        if (! row.hidden) {
            visible++;
            highlightMatches(row.querySelector<HTMLElement>("[data-filter-title]")!, [term]);
        }
    }
    group.querySelector<HTMLElement>("[data-filter-empty]")!.hidden = visible > 0;
}

export function initializeDiscovery(rail: HTMLElement, onChange?: (filters: DiscoveryFilters) => void) {
    const existing = discoveryControllers.get(rail);
    if (existing) return existing;
    const form = rail.querySelector<HTMLFormElement>("[data-discovery-form]")!;
    const locale = rail.dataset.locale as Locale;
    const formatLocale = languages[locale].formatLocale;
    const copy: ReturnType<typeof useMessages>["search"] = JSON.parse(rail.dataset.copy!);
    const defaults = JSON.parse(rail.dataset.defaultFilters!);
    const groups = [...rail.querySelectorAll<HTMLDetailsElement>("[data-filter-group]")];
    const wide = window.matchMedia("(min-width: 94rem)");
    const layout = () => {
        for (const group of groups) group.open = wide.matches;
        rail.dataset.ready = "";
    };
    layout();
    wide.addEventListener("change", layout);
    const parameters = new URLSearchParams(location.search);
    const state = readSearchState(parameters);
    let filters: DiscoveryFilters = {
        category: parameters.has("category") ? state.category : defaults.category ?? "",
        tags: parameters.has("tag") ? state.tags : defaults.tags ?? [],
    };

    const sync = (next: DiscoveryFilters) => {
        filters = { category: next.category, tags: [...next.tags] };
        for (const radio of form.querySelectorAll<HTMLInputElement>('[name="category"]')) radio.checked = radio.value === filters.category;
        for (const checkbox of form.querySelectorAll<HTMLInputElement>('[name="tag"]')) checkbox.checked = filters.tags.includes(checkbox.value);
        rail.querySelector<HTMLElement>("[data-category-summary]")!.textContent = filters.category || copy.allCategories;
        rail.querySelector<HTMLElement>("[data-tags-summary]")!.textContent = formatMessage(copy.selectedTags, { count: filters.tags.length }, formatLocale);
        groups.forEach(filterDiscoveryOptions);
    };
    const change = (next: DiscoveryFilters) => {
        sync(next);
        if (onChange) onChange(filters);
        else {
            const target = new URL(form.action, location.href);
            target.search = searchParameters({ ...readSearchState(new URLSearchParams(location.search)), ...filters }).toString();
            location.assign(target.href);
        }
    };
    form.addEventListener("change", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.name === "category") change({ ...filters, category: target.value });
        if (target.name === "tag") {
            const tags = new Set(filters.tags);
            if (target.checked) tags.add(target.value);
            else tags.delete(target.value);
            change({ ...filters, tags: [...tags] });
        }
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        change(filters);
    });
    rail.querySelector<HTMLButtonElement>("[data-clear-tags]")!.addEventListener("click", () => change({ ...filters, tags: [] }));
    for (const group of groups) group.querySelector<HTMLInputElement>("[data-filter-search]")!.addEventListener("input", () => filterDiscoveryOptions(group));
    sync(filters);
    const controller = { sync, get filters() { return { category: filters.category, tags: [...filters.tags] }; } };
    discoveryControllers.set(rail, controller);
    return controller;
}

export function initializeSearch() {
    const rails = [...document.querySelectorAll<HTMLElement>("[data-discovery]")];
    const header = document.querySelector<HTMLFormElement>("[data-global-search]");
    const result = document.querySelector<HTMLElement>("[data-search-results]");
    const context = result ?? header;
    if (! context) {
        rails.forEach((rail) => initializeDiscovery(rail));
        return;
    }
    if (context.hasAttribute("data-search-ready")) return;
    context.dataset.searchReady = "";
    const locale = context.dataset.locale as Locale;
    const formatLocale = languages[locale].formatLocale;
    const messages: ReturnType<typeof useMessages> | undefined = result ? JSON.parse(result.dataset.copy!) : undefined;
    const input = header?.querySelector<HTMLInputElement>('[name="q"]');
    let state = readSearchState(new URLSearchParams(location.search));
    let search: ReturnType<typeof createSearchIndex> | undefined;
    const discoveries = rails.map((rail) => initializeDiscovery(rail, (filters) => navigate({ ...state, query: input?.value.trim() ?? state.query, ...filters })));
    if (discoveries.length) state = { ...state, ...discoveries[0].filters };

    const sync = () => {
        if (input) input.value = state.query;
        discoveries.forEach((discovery) => discovery.sync(state));
        if (! result) return;
        result.querySelector<HTMLElement>("[data-search-query]")!.textContent = state.query ? `“${state.query}”` : "";
        result.querySelector<HTMLSelectElement>("[data-search-sort]")!.value = state.sort;
        for (const name of ["section", "source"] as const) result.querySelector<HTMLSelectElement>(`[data-search-${name}]`)!.value = state[name];
        for (const name of ["from", "to"] as const) result.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = state[name];
        result.querySelector<HTMLInputElement>('[name="from"]')!.max = state.to;
        result.querySelector<HTMLInputElement>('[name="to"]')!.min = state.from;
    };

    const render = () => {
        sync();
        if (! result || ! search || ! messages) return;
        const copy = messages.search;
        const matches = search(state, locale);
        const list = result.querySelector<HTMLOListElement>("[data-search-list]")!;
        const terms = searchTerms(state.query);
        const nodes = matches.map(({ document: item }) => {
            const row = document.createElement("li");
            row.dataset.pageItem = "";
            const heading = document.createElement("h2");
            const link = document.createElement("a");
            link.href = item.data.href;
            link.textContent = item.data.title;
            heading.append(link);
            const description = document.createElement("p");
            description.textContent = searchSnippet(item, state.query);
            const meta = document.createElement("p");
            meta.className = "post-meta";
            const sections = item.data.placements.map((placement) => getRouteTitle(placement, messages.ui));
            const sources = searchSourceValues(item.data).map((source) => source || copy.localSource);
            const dateKind = state.sort === "updated" && item.data.updated ? "updated" : item.data.dateKind;
            const date = state.sort === "updated" ? item.data.updated ?? item.data.date : item.data.date;
            meta.append(`${formatMetadata([sections, sources, [copy[`${dateKind}Date`]]])} `);
            const time = document.createElement("time");
            time.dateTime = date;
            time.textContent = date.slice(0, 10);
            meta.append(time);
            row.append(heading, description, meta);
            highlightMatches(row, terms);
            return row;
        });
        list.replaceChildren(...nodes);
        result.querySelector<HTMLElement>("[data-search-count]")!.textContent = formatMessage(copy.results, { count: matches.length }, formatLocale);
        result.querySelector<HTMLElement>("[data-search-empty]")!.hidden = matches.length > 0;
        paginationFor(result).setItems(nodes);
    };

    function navigate(next: SearchState) {
        state = next;
        const target = new URL(getRoutePath("search", locale), location.href);
        target.search = searchParameters(state).toString();
        if (! result) {
            location.assign(target.href);
            return;
        }
        history.pushState(null, "", target);
        render();
    }
    header?.addEventListener("submit", (event) => {
        event.preventDefault();
        navigate({ ...state, query: input!.value.trim() });
    });
    for (const name of ["section", "source"] as const) {
        result?.querySelector<HTMLSelectElement>(`[data-search-${name}]`)?.addEventListener("change", (event) => {
            navigate({ ...state, [name]: (event.target as HTMLSelectElement).value });
        });
    }
    result?.querySelector<HTMLSelectElement>("[data-search-sort]")?.addEventListener("change", (event) => {
        navigate({ ...state, sort: (event.target as HTMLSelectElement).value as SearchState["sort"] });
    });
    result?.querySelectorAll<HTMLInputElement>("[data-search-date]").forEach((control) => {
        control.addEventListener("change", () => {
            if (control.reportValidity()) navigate({ ...state, [control.name]: control.value });
        });
    });
    window.addEventListener("popstate", () => {
        state = readSearchState(new URLSearchParams(location.search));
        render();
    });
    sync();
    if (result && messages) {
        const copy = messages.search;
        fetch(result.dataset.indexUrl!).then(async (response) => {
            if (! response.ok) throw new Error(`Search index: ${response.status}`);
            const documents: SearchDocument[] = await response.json();
            const { sections, sources } = searchFilterOptions(documents);
            const options = {
                section: sections.map((value) => ({ value, title: getRouteTitle(value, messages.ui) })),
                source: sources.map(({ value, title }) => ({ value, title: title || copy.localSource })),
            };
            for (const name of ["section", "source"] as const) {
                const select = result.querySelector<HTMLSelectElement>(`[data-search-${name}]`)!;
                for (const { value, title } of options[name]) select.add(new Option(title, value));
            }
            search = createSearchIndex(documents);
            render();
        }).catch(() => {
            result.querySelector<HTMLElement>("[data-search-count]")!.textContent = copy.failed;
        });
    }
}
