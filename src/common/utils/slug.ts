export const toSlug = (input: string): string => {
  if (!input) return "";
 
  let s = input.trim().toLowerCase();
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^\p{L}\p{N}]+/gu, '-');
  s = s.replace(/(^-|-$)/g, '');
  s = s.replace(/-{2,}/g, '-');
  return s;
};

export default toSlug;
