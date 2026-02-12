/**
 * User Seeding Script
 * 
 * Fill in the usernames and passwords below, then run:
 *   node scripts/seedUsers.js
 * 
 * This will hash all passwords with bcrypt and write to data/users.json
 */

const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ============================================
// FILL IN YOUR USERS BELOW
// ============================================
const users = [
  { username: 'megulo25', password: 'my_very_unsafe_password_123_456_7890' },
  { username: 'matthews', password: 'matthews_abebe_password_123_321_42396_26' },
  { username: 'USER_3', password: 'change_this_password_3' },
  { username: 'USER_4', password: 'change_this_password_4' },
  { username: 'USER_5', password: 'change_this_password_5' },
  { username: 'USER_6', password: 'change_this_password_6' },
  { username: 'USER_7', password: 'change_this_password_7' },
  { username: 'USER_8', password: 'change_this_password_8' },
  { username: 'USER_9', password: 'change_this_password_9' },
  { username: 'USER_10', password: 'change_this_password_10' },
];
// ============================================

const SALT_ROUNDS = 12;

async function seedUsers() {
  console.log('🔐 Starting user seeding...\n');

  const seededUsers = [];

  for (const user of users) {
    // Skip placeholder entries
    if (user.username.startsWith('USER_') && user.password.startsWith('change_this_password_')) {
      console.log(`⏭️  Skipping placeholder: ${user.username}`);
      continue;
    }

    console.log(`🔑 Hashing password for: ${user.username}`);
    const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

    seededUsers.push({
      id: uuidv4(),
      username: user.username,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
    });
  }

  if (seededUsers.length === 0) {
    console.log('\n⚠️  No users to seed! Please fill in the users array in this script.');
    console.log('   Replace USER_X with actual usernames and set secure passwords.');
    process.exit(1);
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write users to file
  const usersFilePath = path.join(dataDir, 'users.json');
  fs.writeFileSync(usersFilePath, JSON.stringify(seededUsers, null, 2));

  console.log(`\n✅ Successfully seeded ${seededUsers.length} users to data/users.json`);
  console.log('\n📋 Seeded usernames:');
  seededUsers.forEach((u) => console.log(`   - ${u.username}`));
}

seedUsers().catch((err) => {
  console.error('❌ Error seeding users:', err);
  process.exit(1);
});
