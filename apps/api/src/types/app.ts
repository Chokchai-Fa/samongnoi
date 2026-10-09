import type { RequestIdVariables } from 'hono/request-id';
import type { Deps } from './deps';

/** Hono generics for this app: Worker bindings + per-request variables. */
export interface AppEnv {
  Bindings: Env;
  Variables: RequestIdVariables & {
    deps: Deps;
  };
}
