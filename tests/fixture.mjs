export function installGlobals(context, environment, writable = false) {
    const previous = new Map(Object.keys(environment).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(environment)) {
        Object.defineProperty(globalThis, key, { configurable: true, writable, value });
    }
    context.after(() => {
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

export function textElement(text = "", tag = "div") {
    const document = {
        createElement: (name) => node(1, "", name),
        createTextNode: (value) => node(3, value),
        createDocumentFragment: () => node(11),
        createTreeWalker(root) {
            const texts = [];
            const visit = (item) => {
                if (item.nodeType === 3) texts.push(item);
                else item.childNodes.forEach(visit);
            };
            visit(root);
            let index = 0;
            return {
                currentNode: root,
                nextNode() { return this.currentNode = texts[index++] ?? null; },
            };
        },
    };
    function node(nodeType, data = "", tagName = "") {
        const properties = {
            nodeType, data, tagName, ownerDocument: document,
            dataset: {}, childNodes: [], parentElement: null,
            get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((child) => child.textContent).join(""); },
            set textContent(value) { this.childNodes = []; this.append(document.createTextNode(value)); },
            append(...children) {
                for (const child of children.flatMap((item) => item.nodeType === 11 ? [...item.childNodes] : [item])) {
                    child.remove();
                    child.parentElement = this;
                    this.childNodes.push(child);
                }
            },
            remove() {
                if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
                this.parentElement = null;
            },
            replaceWith(...children) {
                const parent = this.parentElement;
                const index = parent.childNodes.indexOf(this);
                const replacements = children.flatMap((child) => child.nodeType === 11 ? [...child.childNodes] : [child]);
                for (const child of replacements) child.remove();
                parent.childNodes.splice(index, 1, ...replacements);
                for (const child of replacements) child.parentElement = parent;
                this.parentElement = null;
            },
            normalize() {
                for (const child of [...this.childNodes]) child.normalize();
                for (let index = this.childNodes.length - 1; index >= 0; index--) {
                    const child = this.childNodes[index];
                    const previous = this.childNodes[index - 1];
                    if (child.nodeType === 3 && previous?.nodeType === 3) {
                        previous.data += child.data;
                        child.remove();
                    }
                }
            },
            querySelectorAll(selector) {
                return this.childNodes.flatMap((child) => [
                    ...(child.tagName === "mark" && (selector === "mark" || child.dataset.searchHighlight !== undefined) ? [child] : []),
                    ...child.querySelectorAll(selector),
                ]);
            },
            contains(target) {
                return this === target || this.childNodes.some((child) => child.contains(target));
            },
            closest() {
                if (["script", "style", "textarea", "select"].includes(this.tagName) || this.ariaHidden === "true") return this;
                return this.parentElement?.closest() ?? null;
            },
        };
        return /** @type {EventTarget & typeof properties} */ (Object.defineProperties(new EventTarget(), Object.getOwnPropertyDescriptors(properties)));
    }
    const root = document.createElement(tag);
    root.textContent = text;
    return root;
}
