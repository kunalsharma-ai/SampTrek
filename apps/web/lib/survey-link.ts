/**
 * The client survey link must carry SampTrek's UID ({uid}; {session_token} is its older name), so every
 * respondent can be followed through the client survey and back. The UID is shared with the client;
 * the VID (the vendor's respondent ID) stays between SampTrek and the vendor.
 */
export const UID_MACRO = '{uid}';

/** Why a survey link cannot be saved, or null. Empty links are fine (added later). */
export function surveyLinkProblem(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) return 'Survey links start with https://';
  if (!/\{(uid|session_token)\}/i.test(u)) return 'Add {uid} where the client survey expects the respondent ID (e.g. replace XXXX with {uid}).';
  return null;
}
