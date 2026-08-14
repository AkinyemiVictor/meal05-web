export const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}";
export const PASSWORD_REGEX = new RegExp(`^${PASSWORD_PATTERN}$`);

export const getPasswordRequirements = (password) => {
  const value = String(password || "");
  return [
    { key: "length", label: "At least 8 characters", met: value.length >= 8 },
    { key: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(value) },
    { key: "lowercase", label: "One lowercase letter", met: /[a-z]/.test(value) },
    { key: "number", label: "One number", met: /\d/.test(value) },
    { key: "symbol", label: "One symbol (for example !, @, #)", met: /[^\w\s]/.test(value) },
  ];
};

export const getPasswordValidationMessage = (password) => {
  const missing = getPasswordRequirements(password).filter((item) => !item.met);
  if (!missing.length) return "";
  return `Password needs: ${missing.map((item) => item.label.toLowerCase()).join(", ")}.`;
};

export const isStrongPassword = (password) => PASSWORD_REGEX.test(String(password || ""));
