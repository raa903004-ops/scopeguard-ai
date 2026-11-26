import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Result } from "./engine.ts";
import type { ContractVersion } from "./beta.ts";
import type { Currency } from "./estimates.ts";
import type { Review } from "./insights.tsx";

export type Project = {
  id: string;
  name: string;
  contract: string;
  synthetic?: boolean;
  versions?: ContractVersion[];
};
export type ChatTurn = { question: string; answer: Result; version?: number };

interface Store extends DBSchema {
  projects: { key: string; value: Project };
  reviews: { key: string; value: Review };
  settings: { key: string; value: number | Currency };
  chat: { key: string; value: { project: string; turns: ChatTurn[] } };
}

export function upgradeWorkspace(
  db: Pick<IDBPDatabase<Store>, "createObjectStore">,
  oldVersion: number,
) {
  if (oldVersion < 1) {
    db.createObjectStore("projects", { keyPath: "id" });
    db.createObjectStore("reviews", { keyPath: "id" });
    db.createObjectStore("settings");
  }
  if (oldVersion < 2) db.createObjectStore("chat", { keyPath: "project" });
}

export const database = () =>
  openDB<Store>("scopeguard-workspace", 2, { upgrade: upgradeWorkspace });
