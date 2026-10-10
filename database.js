const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
      return { guilds: {} };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.guilds) parsed.guilds = {};
    return parsed;
  } catch (err) {
    console.error('[ModuRole DB] Read error:', err.message);
    return { guilds: {} };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ModuRole DB] Write error:', err.message);
  }
}

function ensureGuild(db, guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      templates: {},
      activeEmbeds: {}
    };
  }
  if (!db.guilds[guildId].templates) db.guilds[guildId].templates = {};
  if (!db.guilds[guildId].activeEmbeds) db.guilds[guildId].activeEmbeds = {};
}

function getTemplate(guildId, name) {
  const db = loadDB();
  return db.guilds[guildId]?.templates?.[name] || null;
}

function saveTemplate(guildId, name, templateData) {
  const db = loadDB();
  ensureGuild(db, guildId);
  db.guilds[guildId].templates[name] = templateData;
  saveDB(db);
  return true;
}

function deleteTemplate(guildId, name) {
  const db = loadDB();
  if (db.guilds[guildId]?.templates?.[name]) {
    delete db.guilds[guildId].templates[name];
    saveDB(db);
    return true;
  }
  return false;
}

function listTemplates(guildId) {
  const db = loadDB();
  if (!db.guilds[guildId]?.templates) return [];
  return Object.keys(db.guilds[guildId].templates);
}

function linkActiveEmbed(guildId, messageId, templateName) {
  const db = loadDB();
  ensureGuild(db, guildId);
  db.guilds[guildId].activeEmbeds[messageId] = templateName;
  saveDB(db);
}

module.exports = {
  getTemplate,
  saveTemplate,
  deleteTemplate,
  listTemplates,
  linkActiveEmbed
};
