import { NEUTRAL_INPUT, type ArcadeInput, type ReplayInput } from "./shared/contracts";
export class ReplayRecorder {
  readonly inputs: ReplayInput[] = [];
  record(tick: number, input: Readonly<ArcadeInput>): void {
    if (this.inputs.at(-1)?.[0] === tick) this.inputs.pop();
    const previous = this.inputs.at(-1);
    const values = [input.x, input.y, input.aimX, input.aimY, input.buttons] as const;
    const before = previous?.slice(1) ?? [NEUTRAL_INPUT.x, NEUTRAL_INPUT.y, NEUTRAL_INPUT.aimX, NEUTRAL_INPUT.aimY, NEUTRAL_INPUT.buttons];
    if (before.every((value, index) => value === values[index])) return;
    const entry: ReplayInput = [tick, ...values];
    this.inputs.push(entry);
  }
  snapshot(): ReplayInput[] { return this.inputs.map(input => [...input]); }
}
