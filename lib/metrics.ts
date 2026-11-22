const startTimeMs = Date.now();
const requests = new Map<string, number>();

export const metrics = {
  incRequest(method: string, status: number): void {
    const key = `${method} ${status}`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
  },
  uptimeSeconds(): number {
    return Math.round((Date.now() - startTimeMs) / 1000);
  },
  requestCounters(): Array<{ key: string; value: number }> {
    return [...requests.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
  },
};
