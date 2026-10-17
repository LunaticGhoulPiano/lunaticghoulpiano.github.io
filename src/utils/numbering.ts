export function formatSequenceNumber(value: number, total: number) {
    return String(value).padStart(String(total).length, "0");
}
