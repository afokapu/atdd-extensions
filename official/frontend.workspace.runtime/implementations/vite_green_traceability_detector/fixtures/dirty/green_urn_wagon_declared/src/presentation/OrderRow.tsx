// BUG: the wagon segment is a well-formed kebab identifier, so the sibling shape rule
// passes, but plan/_wagons.yaml declares no such wagon — the header attributes this
// component to something that does not exist.
// URN: component:not-a-declared-wagon:resolution:OrderRow:frontend:presentation
// Tested-By:
// - test:train:9007-resolve-match:E2E-001-renders
// Runtime: vite
// Purpose: render one resolved row for the declared wagon
export const OrderRow = ({ id }: { id: string }) => <li id={`order-${id}`}>{id}</li>;
