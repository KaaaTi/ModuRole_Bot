const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({ guilds: {} }, null, 2));
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read database:', err);
    return { guilds: {} };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

function getGuildData(guildId) {
  const db = loadDB();
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      templates: {}, // name -> { title, description, image, thumbnail, color, roles: [] }
      activeEmbeds: {} // messageId -> templateName
    };
    saveDB(db);
  }
  return db.guilds[guildId];
}

function getTemplates(guildId) {
  const guildData = getGuildData(guildId);
  return guildData.templates || {};
}

function getTemplate(guildId, name) {
  const templates = getTemplates(guildId);
  return templates[name] || null;
}

function saveTemplate(guildId, name, templateData) {
  const db = loadDB();
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = { templates: {}, activeEmbeds: {} };
  }
  db.guilds[guildId].templates[name] = templateData;
  saveDB(db);
}

function removeTemplate(guildId, name) {
  const db = loadDB();
  if (db.guilds[guildId] && db.guilds[guildId].templates[name]) {
    delete db.guilds[guildId].templates[name];
    saveDB(db);
    return true;
  }
  return false;
}

function linkActiveEmbed(guildId, messageId, templateName) {
  const db = loadDB();
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = { templates: {}, activeEmbeds: {} };
  }
  db.guilds[guildId].activeEmbeds[messageId] = templateName;
  saveDB(db);
}

module.exports = {
  getGuildData,
  getTemplates,
  getTemplate,
  saveTemplate,
  removeTemplate,
  linkActiveEmbed
};
