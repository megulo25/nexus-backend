const fs = require('fs');
const path = require('path');

const BLOCKLIST_FILE = path.join(__dirname, '..', 'data', 'tokenBlocklist.json');

/**
 * Read the blocklist from file
 * @returns {Array} Array of blocked token entries
 */
function getBlocklist() {
  try {
    const data = fs.readFileSync(BLOCKLIST_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Save the blocklist to file
 * @param {Array} blocklist - Array of blocked token entries
 */
function saveBlocklist(blocklist) {
  fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify(blocklist, null, 2));
}

/**
 * Add a token to the blocklist
 * @param {string} tokenId - The unique token ID (jti claim)
 * @param {number} expiresAt - Unix timestamp when the token expires
 */
function addToBlocklist(tokenId, expiresAt) {
  const blocklist = getBlocklist();
  blocklist.push({
    tokenId,
    expiresAt,
    blockedAt: Date.now(),
  });
  saveBlocklist(blocklist);
}

/**
 * Check if a token is blocklisted
 * @param {string} tokenId - The unique token ID (jti claim)
 * @returns {boolean} True if token is blocklisted
 */
function isBlocklisted(tokenId) {
  const blocklist = getBlocklist();
  return blocklist.some((entry) => entry.tokenId === tokenId);
}

/**
 * Clean up expired entries from the blocklist
 * Call this periodically to prevent the blocklist from growing indefinitely
 */
function cleanupExpiredEntries() {
  const blocklist = getBlocklist();
  const now = Date.now();
  const cleaned = blocklist.filter((entry) => entry.expiresAt > now);

  if (cleaned.length !== blocklist.length) {
    saveBlocklist(cleaned);
    console.log(`🧹 Cleaned ${blocklist.length - cleaned.length} expired entries from token blocklist`);
  }
}

module.exports = {
  addToBlocklist,
  isBlocklisted,
  cleanupExpiredEntries,
};
