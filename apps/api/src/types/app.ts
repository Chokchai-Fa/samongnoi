import type { RequestIdVariables } from 'hono/request-id';
import type { Deps } from './deps';
import type { GuestIdentity } from './guest';

/** Hono generics for this app: Worker bindings + per-request variables. */
export interface AppEnv {
  Bindings: Env;
  Variables: RequestIdVariables & {
    deps: Deps;
    /** Client IP from Cloudflare (`CF-Connecting-IP`), for per-IP limits. */
    ip: string;
    /** Set by `guestMiddleware` on routes that need the caller's identity. */
    guest: GuestIdentity;
  };
}
