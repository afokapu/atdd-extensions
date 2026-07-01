// URN: component:shared:domain:Team:frontend:domain
// Runtime: vite
export class Team {
  constructor(public readonly name: string) {}
  greeting(): string {
    return `Team ${this.name}`
  }
}
