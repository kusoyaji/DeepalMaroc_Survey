// Flow Token Generator - Ensures phone numbers are always embedded
// USE THIS when sending Flows to users from Zoho/Chatwoot

const crypto = require('crypto');

/**
 * Generate a flow token with embedded phone number
 * Format: deepal-{phone}-{uuid}
 * 
 * @param {string} phoneNumber - User's WhatsApp number (with or without +)
 * @returns {string} Flow token with embedded phone
 * 
 * @example
 * generateFlowToken('+212610059159') 
 * // Returns: 'deepal-212610059159-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 */
function generateFlowToken(phoneNumber) {
  // Clean phone number (remove spaces, dashes, etc.)
  let cleanPhone = phoneNumber.replace(/[\s\-()]/g, '');
  
  // Remove leading + if present
  if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.substring(1);
  }
  
  // Validate phone number (10-15 digits)
  if (!/^\d{10,15}$/.test(cleanPhone)) {
    throw new Error(`Invalid phone number format: ${phoneNumber}`);
  }
  
  // Generate UUID v4
  const uuid = crypto.randomUUID();
  
  // Construct flow token: deepal-{phone}-{uuid}
  const flowToken = `deepal-${cleanPhone}-${uuid}`;
  
  console.log(`📱 Generated flow_token: ${flowToken}`);
  return flowToken;
}

/**
 * Extract phone number from flow token
 * 
 * @param {string} flowToken - Flow token in format: deepal-{phone}-{uuid}
 * @returns {string|null} Phone number with + prefix, or null if extraction fails
 */
function extractPhoneFromToken(flowToken) {
  if (!flowToken) return null;
  
  // Method 1: Standard format (deepal-212610059159-uuid)
  if (flowToken.startsWith('deepal-')) {
    const parts = flowToken.split('-');
    if (parts.length >= 3 && parts[1]) {
      const phone = parts[1];
      return phone.startsWith('+') ? phone : '+' + phone;
    }
  }
  
  // Method 2: Regex fallback for any phone pattern
  const phoneMatch = flowToken.match(/(\+?\d{10,15})/);
  if (phoneMatch) {
    const phone = phoneMatch[1];
    return phone.startsWith('+') ? phone : '+' + phone;
  }
  
  return null;
}

/**
 * Validate that a flow token contains a phone number
 * 
 * @param {string} flowToken - Flow token to validate
 * @returns {boolean} True if phone number can be extracted
 */
function validateFlowToken(flowToken) {
  const phone = extractPhoneFromToken(flowToken);
  return phone !== null;
}

module.exports = {
  generateFlowToken,
  extractPhoneFromToken,
  validateFlowToken
};
