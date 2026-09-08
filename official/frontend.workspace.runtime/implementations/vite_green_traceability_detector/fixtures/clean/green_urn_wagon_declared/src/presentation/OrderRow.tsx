// URN: component:resolve-match:resolution:OrderRow:frontend:presentation
// Tested-By:
// - test:train:9007-resolve-match:E2E-001-renders
// Runtime: vite
// Purpose: render one resolved row for the declared wagon
export const OrderRow = ({ id }: { id: string }) => <li id={`order-${id}`}>{id}</li>;
