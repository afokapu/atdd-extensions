export function TrainView({ trainId }: { trainId: string }) {
  return <main data-train-id={trainId}>{trainId}</main>;
}
