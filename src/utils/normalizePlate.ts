export const normalizePlate = (plate: string): string => {
  if (!plate) return '';
  // Remove spaces, dashes, dots, special chars, convert to uppercase
  return plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};
