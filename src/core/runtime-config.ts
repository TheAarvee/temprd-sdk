import type { temprdConfig } from "../types";

let runtimeConfig: temprdConfig | null = null;
let runtimeProviderClient: unknown = null;
let runtimeProviderModel: string | null = null;

export function setRuntimeConfig(config: temprdConfig): void {
  runtimeConfig = { ...config };
}

export function getRuntimeConfig(): temprdConfig | null {
  return runtimeConfig ? { ...runtimeConfig } : null;
}

export function setRuntimeProviderClient(client: unknown): void {
  runtimeProviderClient = client;
}

export function getRuntimeProviderClient(): unknown {
  return runtimeProviderClient;
}

export function setRuntimeProviderModel(model: string): void {
  runtimeProviderModel = model;
}

export function getRuntimeProviderModel(): string | null {
  return runtimeProviderModel;
}

export function clearRuntimeConfig(): void {
  runtimeConfig = null;
  runtimeProviderClient = null;
  runtimeProviderModel = null;
}
