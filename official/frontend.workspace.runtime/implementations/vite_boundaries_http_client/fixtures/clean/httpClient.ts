// The centralized, contract-driven HTTP client — the ONE module permitted to wrap
// the raw fetch() primitive. Identified by its filename (contains "client"), so a
// raw fetch here is out of scope for the boundary rule.
export type Contract = { path: string }

export const httpClient = {
  async get<T>(contract: Contract): Promise<T> {
    const res = await fetch(contract.path, { method: 'GET' })
    return (await res.json()) as T
  },
}
