const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

/**
 * Read all users from the JSON file
 * @returns {Array} Array of user objects
 */
function getAllUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Find a user by username
 * @param {string} username - The username to search for
 * @returns {Object|null} User object or null if not found
 */
function findByUsername(username) {
  const users = getAllUsers();
  return users.find((user) => user.username === username) || null;
}

/**
 * Find a user by ID
 * @param {string} id - The user ID to search for
 * @returns {Object|null} User object or null if not found
 */
function findById(id) {
  const users = getAllUsers();
  return users.find((user) => user.id === id) || null;
}

/**
 * Get user without sensitive data (password hash)
 * @param {Object} user - Full user object
 * @returns {Object} User object without passwordHash
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  getAllUsers,
  findByUsername,
  findById,
  sanitizeUser,
};
