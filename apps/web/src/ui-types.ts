import type { Key } from "./i18n";
export interface UIActions {
  t: (key: Key) => string;
  busy: boolean;
  perform: (fn: () => Promise<unknown>) => void;
}
