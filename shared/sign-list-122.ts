import signCodesJson from "../client/public/sign_codes.json";

const parsedSignCodes = Array.isArray(signCodesJson)
  ? signCodesJson.filter((code): code is string => typeof code === "string")
  : [];

export const LISTE_122_SIGN_CODES: readonly string[] = parsedSignCodes;

const LISTE_122_NORMALIZED_SET = new Set(
  LISTE_122_SIGN_CODES.map((code) => normalizeSignCode(code))
);

export function normalizeSignCode(signType: string | null | undefined): string {
  return (signType ?? "").trim().toUpperCase();
}

export function isSignTypeInList122(signType: string | null | undefined): boolean {
  const normalized = normalizeSignCode(signType);
  if (!normalized) {
    return false;
  }

  return LISTE_122_NORMALIZED_SET.has(normalized);
}
