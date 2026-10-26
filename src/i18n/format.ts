export function countFormatter(locale: string) {
    const number = new Intl.NumberFormat(locale);
    return (value: string | number | bigint | null) => value === null ? "—"
        : number.format(typeof value === "string" ? BigInt(value) : value);
}

export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & {
    other: string;
};
type Message = string | PluralMessage;
type Parameters = Record<string, string | number>;

export function formatMessage(message: Message, parameters: Parameters, locale: string) {
    let template;
    if (typeof message === "string") template = message;
    else {
        if (typeof parameters.count !== "number") throw new Error("Plural messages require a numeric count.");
        const category = new Intl.PluralRules(locale).select(parameters.count);
        template = message[category] ?? message.other;
    }
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
        if (! Object.hasOwn(parameters, key)) throw new Error(`Missing message parameter: ${key}`);
        const value = parameters[key];
        return typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value;
    });
}
