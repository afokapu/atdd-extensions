// A presentation component that fetches data the RIGHT way: through the
// centralized client, never the raw fetch()/axios primitive.
import { httpClient } from './httpClient'

type User = { id: string; name: string }

export function UserCard({ id }: { id: string }) {
  const load = () => httpClient.get<User>({ path: `/api/users/${id}` })
  return <button onClick={load}>load</button>
}
