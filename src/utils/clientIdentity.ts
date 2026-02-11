type ClientIdentityFilterInput = {
  phone?: string | string[] | null;
  email?: string | string[] | null;
  excludeId?: string | string[] | null;
};

export const normalizeClientPhone = (phone?: string | string[] | null) =>
  String(Array.isArray(phone) ? phone[0] || "" : phone || "").replace(
    /[^0-9]/g,
    "",
  );

export const normalizeClientEmail = (email?: string | string[] | null) => {
  const normalized = String(
    Array.isArray(email) ? email[0] || "" : email || "",
  )
    .trim()
    .toLowerCase();
  return normalized || undefined;
};

export const buildClientIdentityFilter = ({
  phone,
  email,
  excludeId,
}: ClientIdentityFilterInput) => {
  const normalizedPhone = normalizeClientPhone(phone);
  const normalizedEmail = normalizeClientEmail(email);

  const identityClauses: Array<Record<string, string>> = [];
  if (normalizedPhone) identityClauses.push({ phone: normalizedPhone });
  if (normalizedEmail) identityClauses.push({ email: normalizedEmail });

  if (identityClauses.length === 0) return null;

  const filter: Record<string, unknown> =
    identityClauses.length === 1
      ? identityClauses[0]
      : { $or: identityClauses };

  if (excludeId) {
    const normalizedExcludeId = Array.isArray(excludeId)
      ? excludeId[0]
      : excludeId;
    filter._id = { $ne: normalizedExcludeId };
  }

  return filter;
};
