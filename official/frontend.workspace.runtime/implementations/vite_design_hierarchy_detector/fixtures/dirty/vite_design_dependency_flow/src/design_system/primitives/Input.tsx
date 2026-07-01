// VIOLATION: a primitive reaching UP into the components layer.
import { Card } from "../components/Card";

export function Input() {
  return <Card title="wrong" />;
}
