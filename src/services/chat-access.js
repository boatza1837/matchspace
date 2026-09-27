const { db } = require('../config/db');

// Consult current database roles and membership, never client IDs or stale roles.
async function getChatAccess(userId, chatId) {
  if (!Number.isSafeInteger(Number(chatId)) || Number(chatId) <= 0) return null;
  // One round trip matters when the database is remote and typing events are frequent.
  return await db.get(`
    SELECT c.*, a.created_by AS creator_id
    FROM chats c
    JOIN users u ON u.id = ? AND COALESCE(u.is_active, 1) != 0
    LEFT JOIN activities a ON a.id = c.activity_id
    WHERE c.id = ? AND (
      u.role = 'owner'
      OR ((c.activity_id IS NOT NULL OR c.type = 'group') AND (
        a.created_by = u.id
        OR EXISTS (SELECT 1 FROM activity_members m WHERE m.activity_id = c.activity_id AND m.user_id = u.id)
      ))
      OR (c.activity_id IS NULL AND COALESCE(c.type, 'direct') != 'group' AND (c.user_a = u.id OR c.user_b = u.id))
    )
  `, [userId, Number(chatId)]) || null;
}

module.exports = { getChatAccess };
