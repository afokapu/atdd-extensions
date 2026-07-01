// URN: component:resolve-dilemmas:choose-option:ChoiceStore:backend:integration
// Tested-By:
// - test:resolve-dilemmas:choose-option:WMBT-CONVEX-010-persists-choice
// Runtime: convex
// Purpose: Persist chosen options behind an injected repository port

export interface ChoiceRepository {
  save(id: string): Promise<void>
}

// No module-level singleton: the dependency is injected (constructor injection),
// so the store is testable with an in-memory fake.
export class ChoiceStore {
  constructor(private readonly repo: ChoiceRepository) {}

  async saveChoice(id: string): Promise<void> {
    await this.repo.save(id)
  }
}
