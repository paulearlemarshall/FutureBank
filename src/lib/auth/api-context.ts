import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionUser } from "@/modules/contracts";

const apiUserStorage = new AsyncLocalStorage<SessionUser>();

export function getApiUser(): SessionUser | null {
  return apiUserStorage.getStore() ?? null;
}

export function runWithApiUser<T>(user: SessionUser, operation: () => T): T {
  return apiUserStorage.run(user, operation);
}
