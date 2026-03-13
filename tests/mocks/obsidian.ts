import { parse, stringify } from "yaml";

export class Notice {
  message: string;
  timeout?: number;

  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout;
  }
}

export class TFile {}
export class TFolder {}
export class App {}

export function parseYaml(yaml: string): any {
  return parse(yaml);
}

export function stringifyYaml(value: any): string {
  return stringify(value);
}
