const sanitize = (input: string) => {
  if (!input) return '';
 
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
};

export const toUpperUnderscore = (input: string): string => {
  const s = sanitize(input);
  if (!s) return '';
  return s
    .replace(/[-\s]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();
};

export const fromUpperUnderscore = (input: string): string => {
  if (!input) return '';
  const s = input.replace(/_+/g, ' ').toLowerCase();
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export const cleanNameForStorage = (input: string): string => sanitize(input);

export default {
  toUpperUnderscore,
  fromUpperUnderscore,
  cleanNameForStorage
};
