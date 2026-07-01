import { Card } from "../components/Card";
import { Button } from "../primitives/Button";

export function EmptyState() {
  return (
    <Card title="Nothing here">
      <Button label="Add" />
    </Card>
  );
}
