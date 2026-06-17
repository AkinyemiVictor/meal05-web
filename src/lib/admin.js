const readEmails = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const getAdminEmails = () => {
  const fromServer = readEmails(process.env.ADMIN_EMAILS);
  const fromPublic = readEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  return Array.from(new Set([...fromServer, ...fromPublic]));
};

export const isAdminEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const list = getAdminEmails();
  if (!list.length) return false;
  return list.includes(email.trim().toLowerCase());
};
