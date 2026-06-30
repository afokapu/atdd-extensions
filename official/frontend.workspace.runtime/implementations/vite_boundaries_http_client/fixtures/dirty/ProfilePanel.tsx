// VIOLATION: a presentation component calling the raw fetch() primitive directly
// instead of routing through the centralized, contract-driven HTTP client.
type Profile = { id: string; name: string }

export function ProfilePanel({ id }: { id: string }) {
  const load = async (): Promise<Profile> => {
    const res = await fetch(`/api/profile/${id}`)
    return (await res.json()) as Profile
  }
  return <button onClick={load}>load</button>
}
