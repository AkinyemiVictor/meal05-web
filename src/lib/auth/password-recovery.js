export const PASSWORD_RECOVERY_COOKIE = "meal05-password-recovery";
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60;
export const PASSWORD_RECOVERY_PATH = "/account/change-password?recovery=1";

export const isRecentPasswordRecovery = (user, now = Date.now()) => {
  const sentAt = Date.parse(user?.recovery_sent_at || "");
  return Number.isFinite(sentAt) && now - sentAt >= 0 && now - sentAt <= PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000;
};
