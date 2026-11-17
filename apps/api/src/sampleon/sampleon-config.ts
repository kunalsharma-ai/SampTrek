/** SAMPLEON (SampAudience) settings and the Sampledge service signature, shared by the controller and the outbox. */
import { hmacSha256, sha256 } from '../common/crypto';

type EnvMap = Record<string, string | undefined>;

/** The SampAudience connection from a settings map (keys are the old environment variable names). */
export const sampleonFrom = (env: EnvMap) => {
  const url = (env.SAMPLEON_URL ?? '').trim().replace(/\/+$/, '');
  const secret = (env.SAMPLEON_CLIENT_SECRET ?? '').trim();
  return { url, clientId: env.SAMPLEON_CLIENT_ID?.trim() || 'projexa', secret, configured: !!(url && secret) };
};
export type SampleonConfig = ReturnType<typeof sampleonFrom>;

/** Where the settings come from: Settings → Integrations (set by IntegrationsService). */
let source: () => Promise<EnvMap> = async () => ({});
export const setSampleonSource = (fn: () => Promise<EnvMap>) => { source = fn; };

/** Read on every call so a change in Settings → Integrations applies without a restart. */
export const sampleonConfig = async (): Promise<SampleonConfig> => sampleonFrom(await source());

/**
 * Sampledge service signature (SAMPLEON §5.0):
 * v1=hex HMAC-SHA256(secret, ts + "." + METHOD + "." + path + "." + sha256hex(body)).
 */
export function sampledgeHeaders(clientId: string, secret: string, method: string, path: string, body: string, nowMs = Date.now()) {
  const ts = String(Math.floor(nowMs / 1000));
  return {
    'X-Sampledge-Client': clientId,
    'X-Sampledge-Timestamp': ts,
    'X-Sampledge-Signature': `v1=${hmacSha256(secret, `${ts}.${method.toUpperCase()}.${path}.${sha256(body)}`)}`,
  };
}
