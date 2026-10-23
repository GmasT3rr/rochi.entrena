export const passwordFuerte = (password: string): boolean =>
  password.length >= 12 &&
  password.length <= 128 &&
  /\p{Ll}/u.test(password) &&
  /\p{Lu}/u.test(password) &&
  /\p{N}/u.test(password) &&
  /[^\p{L}\p{N}\s]/u.test(password);
