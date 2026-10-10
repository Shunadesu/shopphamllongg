/**
 * Generate a deterministic 6-digit code from a MongoDB ObjectId.
 * Ensures consistent codes for the same ObjectId.
 *
 * @param {string|ObjectId} depositId - MongoDB ObjectId as string or object
 * @returns {string} 6-digit code (000000-999999)
 */
export function generateDepositCode(depositId) {
  if (!depositId) throw new Error('depositId is required');

  // Convert ObjectId to string if needed
  const idString = depositId.toString();

  // Convert hex string to number using modulo
  // Take the last 8 hex characters to avoid overflow
  const hex = idString.slice(-8);
  const num = parseInt(hex, 16);
  const code = num % 1000000;

  // Pad to 6 digits with leading zeros
  return code.toString().padStart(6, '0');
}

/**
 * Validate if a string is a valid 6-digit deposit code.
 * @param {string} code
 * @returns {boolean}
 */
export function isValidDepositCode(code) {
  if (typeof code !== 'string') return false;
  return /^\d{6}$/.test(code);
}
