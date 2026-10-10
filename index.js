require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const db = require('./database.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Helper: Fetch or automatically create a webhook in the designated channel (Discohook style)
async function getOrCreateWebhook(channel) {
  if (channel.type !== ChannelType.GuildText) return null;
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(wh => wh.owner?.id === client.user.id);
  if (!webhook) {
    webhook = await channel.createWebhook({
      name: 'ModuRole Engine',
      avatar: client.user.displayAvatarURL()
    });
  }
  return webhook;
}

// Helper: Match server custom emojis or role icons to role definitions
function resolveRoleEmoji(role, guild) {
  if (!role) return null;
  if (role.unicodeEmoji) {
    return { name: role.unicodeEmoji };
  }
  const cleanRoleName = role.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const matchedEmoji = guild.emojis.cache.find(e => 
    e.name.toLowerCase() === cleanRoleName ||
    cleanRoleName.includes(e.name.toLowerCase())
  );
  if (matchedEmoji) {
    return { id: matchedEmoji.id, name: matchedEmoji.name, animated: matchedEmoji.animated };
  }
  return null;
}

// Helper: Render visual embed preview and production outputs
function renderTemplateEmbed(template, clientUser) {
  const embed = new EmbedBuilder()
    .setTitle(template.title || 'Notification')
    .setDescription(template.description || 'No content specified.')
    .setColor(template.color || '#5865F2');

  if (template.thumbnail) embed.setThumbnail(template.thumbnail);
  if (template.image) embed.setImage(template.image);

  embed.setFooter({
    text: template.footer || 'Managed by ModuRole Engine',
    iconURL: clientUser.displayAvatarURL()
  });

  return embed;
}

// UI Helper: Interactive triggers on public published messages
function renderTemplateComponents(template, templateName, guild) {
  const rows = [];
  const buttonList = [];

  // 1. Zira Style Single Toggle Role Button
  if (template.toggleRoleId) {
    const role = guild.roles.cache.get(template.toggleRoleId);
    const labelText = role ? `Toggle ${role.name}` : 'Toggle Role';
    buttonList.push(
      new ButtonBuilder()
        .setCustomId(`modurole_toggle:${templateName}`)
        .setLabel(labelText)
        .setStyle(ButtonStyle.Primary)
    );
  }

  // 2. Multi-Role Popup Menu Trigger Button
  if (template.multiRoles && template.multiRoles.length > 0) {
    buttonList.push(
      new ButtonBuilder()
        .setCustomId(`modurole_open_multi_popup:${templateName}`)
        .setLabel('🎨 Select Roles')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // 3. Random Role Gacha Pool Trigger Button
  if (template.randomPool && template.randomPool.length > 0) {
    buttonList.push(
      new ButtonBuilder()
        .setCustomId(`modurole_open_gacha_popup:${templateName}`)
        .setLabel('🎲 Roll Gacha')
        .setStyle(ButtonStyle.Success)
    );
  }

  if (buttonList.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(buttonList));
  }

  return rows;
}

// UI Helper: Studio Interactive Control Panel
function createBuilderPanel(templateName) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`builder_edit_text:${templateName}`)
      .setLabel('Content')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`builder_edit_sender:${templateName}`)
      .setLabel('Identity')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`builder_edit_media:${templateName}`)
      .setLabel('Media & Color')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`builder_publish_webhook:${templateName}`)
      .setLabel('Publish (Webhook)')
      .setStyle(ButtonStyle.Success)
  );
}

// Command Definitions
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display documentation and available commands'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Embed system and webhook management')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new template')
        .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Open the Interactive Builder Studio')
        .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('sync_message')
        .setDescription('Sync published message with the latest template configuration')
        .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('message_id').setDescription('Target message ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Permanently remove a template')
        .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('attach_role_toggle')
        .setDescription('Attach a 1-click toggle button to a template')
        .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to toggle').setRequired(true))
    ),

  // Up to 10 roles for Random Gacha Pool
  new SlashCommandBuilder()
    .setName('attach_random_role')
    .setDescription('Add up to 10 roles into the random gacha pool')
    .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1 (Required)').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false))
    .addRoleOption(opt => opt.setName('role6').setDescription('Role 6').setRequired(false))
    .addRoleOption(opt => opt.setName('role7').setDescription('Role 7').setRequired(false))
    .addRoleOption(opt => opt.setName('role8').setDescription('Role 8').setRequired(false))
    .addRoleOption(opt => opt.setName('role9').setDescription('Role 9').setRequired(false))
    .addRoleOption(opt => opt.setName('role10').setDescription('Role 10').setRequired(false)),

  // Up to 10 roles for Multi-Role Dropdown
  new SlashCommandBuilder()
    .setName('attach_multi_role')
    .setDescription('Add up to 10 roles to the multi-select popup menu')
    .addStringOption(opt => opt.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1 (Required)').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false))
    .addRoleOption(opt => opt.setName('role6').setDescription('Role 6').setRequired(false))
    .addRoleOption(opt => opt.setName('role7').setDescription('Role 7').setRequired(false))
    .addRoleOption(opt => opt.setName('role8').setDescription('Role 8').setRequired(false))
    .addRoleOption(opt => opt.setName('role9').setDescription('Role 9').setRequired(false))
    .addRoleOption(opt => opt.setName('role10').setDescription('Role 10').setRequired(false))
].map(c => c.toJSON());

// Lifecycle Event
client.once('ready', async () => {
  console.log(`[ModuRole] Global Service Online: ${client.user.tag}`);

  const activities = [
    { name: '/help | ModuRole Studio', type: ActivityType.Playing },
    { name: 'Role Requests', type: ActivityType.Listening },
    { name: `${client.guilds.cache.size} Servers`, type: ActivityType.Watching }
  ];
  let activityIndex = 0;
  setInterval(() => {
    const current = activities[activityIndex];
    client.user.setPresence({
      activities: [{ name: current.name, type: current.type }],
      status: 'online'
    });
    activityIndex = (activityIndex + 1) % activities.length;
  }, 15000);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('[ModuRole] Slash commands registered successfully.');
  } catch (error) {
    console.error('[ModuRole] Command sync error:', error);
  }
});

// Dynamic Autocomplete
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const templates = db.listTemplates(interaction.guildId);
  const filtered = templates.filter(name => name.toLowerCase().includes(focusedValue));
  await interaction.respond(filtered.slice(0, 25).map(choice => ({ name: choice, value: choice })));
});

// Primary Dispatcher
client.on('interactionCreate', async interaction => {
  // 1. Slash Commands Processing
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('ModuRole — Operational Guide')
        .setColor('#5865F2')
        .setDescription('Advanced modular system for Webhooks, Popup Role Selectors, and Gacha Pools.')
        .addFields(
          { name: '/help', value: 'Displays this command guide.' },
          { name: '/embed create <name>', value: 'Initiate a new template studio.' },
          { name: '/embed edit <name>', value: 'Open Builder Studio panel.' },
          { name: '/embed sync_message <name> <message_id>', value: 'Sync/update an already published live message.' },
          { name: '/embed delete <name>', value: 'Remove a template permanently.' },
          { name: '/embed attach_role_toggle <name> <role>', value: 'Attach a 1-click toggle button.' },
          { name: '/attach_random_role <name> [role1..10]', value: 'Add up to 10 roles to gacha pool.' },
          { name: '/attach_multi_role <name> [role1..10]', value: 'Add up to 10 roles to popup dropdown selection.' }
        );
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    if (commandName === 'embed') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        const name = interaction.options.getString('name');
        const existing = db.getTemplate(interaction.guildId, name);
        if (existing) {
          return interaction.reply({ content: `A template named \`${name}\` already exists.`, ephemeral: true });
        }

        const newTemplate = {
          title: 'Welcome to Our Server',
          description: 'Click buttons below to receive your respective community roles.',
          color: '#5865F2',
          image: null,
          thumbnail: null,
          footer: 'Managed by ModuRole Engine',
          senderName: 'Announcement Bot',
          senderAvatar: null,
          toggleRoleId: null,
          randomPool: [],
          multiRoles: []
        };

        db.saveTemplate(interaction.guildId, name, newTemplate);
        return interaction.reply({
          content: `Builder initialized for template: \`${name}\``,
          embeds: [renderTemplateEmbed(newTemplate, client.user)],
          components: [createBuilderPanel(name)],
          ephemeral: true
        });
      }

      if (sub === 'edit') {
        const name = interaction.options.getString('name');
        const template = db.getTemplate(interaction.guildId, name);
        if (!template) return interaction.reply({ content: `Template \`${name}\` not found.`, ephemeral: true });

        return interaction.reply({
          content: `Studio Control Panel: \`${name}\``,
          embeds: [renderTemplateEmbed(template, client.user)],
          components: [createBuilderPanel(name)],
          ephemeral: true
        });
      }

      if (sub === 'sync_message') {
        const name = interaction.options.getString('name');
        const messageId = interaction.options.getString('message_id');
        const template = db.getTemplate(interaction.guildId, name);
        if (!template) return interaction.reply({ content: `Template \`${name}\` not found.`, ephemeral: true });

        try {
          const webhook = await getOrCreateWebhook(interaction.channel);
          await webhook.editMessage(messageId, {
            embeds: [renderTemplateEmbed(template, client.user)],
            components: renderTemplateComponents(template, name, interaction.guild)
          });
          return interaction.reply({ content: `Successfully synced live message (\`${messageId}\`) with template \`${name}\`.`, ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: `Failed to edit message: ${err.message}`, ephemeral: true });
        }
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name');
        const success = db.deleteTemplate(interaction.guildId, name);
        if (!success) return interaction.reply({ content: `Template \`${name}\` not found.`, ephemeral: true });
        return interaction.reply({ content: `Template \`${name}\` successfully deleted.`, ephemeral: true });
      }

      if (sub === 'attach_role_toggle') {
        const name = interaction.options.getString('name');
        const role = interaction.options.getRole('role');
        const template = db.getTemplate(interaction.guildId, name);
        if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

        template.toggleRoleId = role.id;
        db.saveTemplate(interaction.guildId, name, template);
        return interaction.reply({
          content: `Attached toggle button for role **${role.name}** to template \`${name}\`.`,
          ephemeral: true
        });
      }
    }

    if (commandName === 'attach_random_role') {
      const name = interaction.options.getString('name');
      const template = db.getTemplate(interaction.guildId, name);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      if (!template.randomPool) template.randomPool = [];
      const addedRoles = [];

      for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role && !template.randomPool.includes(role.id)) {
          template.randomPool.push(role.id);
          addedRoles.push(role.name);
        }
      }

      db.saveTemplate(interaction.guildId, name, template);
      return interaction.reply({
        content: `Added **${addedRoles.length}** role(s) to random pool of \`${name}\`:\n${addedRoles.map(r => `• ${r}`).join('\n')}`,
        ephemeral: true
      });
    }

    if (commandName === 'attach_multi_role') {
      const name = interaction.options.getString('name');
      const template = db.getTemplate(interaction.guildId, name);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      if (!template.multiRoles) template.multiRoles = [];
      const addedRoles = [];

      for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role && !template.multiRoles.includes(role.id)) {
          template.multiRoles.push(role.id);
          addedRoles.push(role.name);
        }
      }

      db.saveTemplate(interaction.guildId, name, template);
      return interaction.reply({
        content: `Added **${addedRoles.length}** role(s) to dropdown selection of \`${name}\`:\n${addedRoles.map(r => `• ${r}`).join('\n')}`,
        ephemeral: true
      });
    }
  }

  // 2. Button Dispatcher
  if (interaction.isButton()) {
    const [action, targetName] = interaction.customId.split(':');

    // Builder Studio: Edit Text Content
    if (action === 'builder_edit_text') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_content:${targetName}`)
        .setTitle(`Edit Content: ${targetName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_title').setLabel('Embed Title').setStyle(TextInputStyle.Short).setValue(template.title || '').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_description').setLabel('Embed Description').setStyle(TextInputStyle.Paragraph).setValue(template.description || '').setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    // Builder Studio: Edit Sender Identity (Webhook)
    if (action === 'builder_edit_sender') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_sender:${targetName}`)
        .setTitle('Sender Identity')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_sender_name').setLabel('Sender Name (Bot)').setStyle(TextInputStyle.Short).setValue(template.senderName || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_sender_avatar').setLabel('Sender Avatar URL').setStyle(TextInputStyle.Short).setValue(template.senderAvatar || '').setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    // Builder Studio: Edit Media & Color
    if (action === 'builder_edit_media') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_media:${targetName}`)
        .setTitle(`Edit Media: ${targetName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_color').setLabel('Hex Color (e.g. #5865F2)').setStyle(TextInputStyle.Short).setValue(template.color || '#5865F2').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_image').setLabel('Main Image URL').setStyle(TextInputStyle.Short).setValue(template.image || '').setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('input_thumbnail').setLabel('Thumbnail Image URL').setStyle(TextInputStyle.Short).setValue(template.thumbnail || '').setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    // Builder Studio: Publish Live via Webhook
    if (action === 'builder_publish_webhook') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      try {
        const webhook = await getOrCreateWebhook(interaction.channel);
        const sentMsg = await webhook.send({
          username: template.senderName || 'ModuRole Engine',
          avatarURL: template.senderAvatar || client.user.displayAvatarURL(),
          embeds: [renderTemplateEmbed(template, client.user)],
          components: renderTemplateComponents(template, targetName, interaction.guild)
        });

        return interaction.reply({
          content: `✅ Published live via Webhook! Message ID: \`${sentMsg.id}\`\nSync command: \`/embed sync_message ${targetName} ${sentMsg.id}\``,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({ content: `Failed to dispatch webhook: ${err.message}`, ephemeral: true });
      }
    }

    // Live Action: Zira Toggle Role
    if (action === 'modurole_toggle') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.toggleRoleId) return interaction.reply({ content: 'Role configuration not found.', ephemeral: true });

      const role = interaction.guild.roles.cache.get(template.toggleRoleId);
      if (!role) return interaction.reply({ content: 'Role no longer exists on server.', ephemeral: true });

      try {
        if (interaction.member.roles.cache.has(role.id)) {
          await interaction.member.roles.remove(role);
          return interaction.reply({ content: `Removed **${role.name}** from your roles.`, ephemeral: true });
        } else {
          await interaction.member.roles.add(role);
          return interaction.reply({ content: `Granted **${role.name}** to your roles.`, ephemeral: true });
        }
      } catch (err) {
        return interaction.reply({ content: 'Failed to update role. Please verify bot permissions and hierarchy.', ephemeral: true });
      }
    }

    // Live Action: Open Multi-select Ephemeral Popup Menu
    if (action === 'modurole_open_multi_popup') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.multiRoles || template.multiRoles.length === 0) {
        return interaction.reply({ content: 'No roles configured for this menu.', ephemeral: true });
      }

      const options = [];
      for (const roleId of template.multiRoles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          const emoji = resolveRoleEmoji(role, interaction.guild);
          const hasRole = interaction.member.roles.cache.has(role.id);

          const optionItem = {
            label: role.name,
            value: role.id,
            description: hasRole ? 'Active: Select to remove' : 'Available: Select to add'
          };
          if (emoji) optionItem.emoji = emoji;
          options.push(optionItem);
        }
      }

      if (options.length === 0) {
        return interaction.reply({ content: 'Configured roles were not found on this server.', ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`modurole_multi_submit:${targetName}`)
        .setPlaceholder('Choose your roles...')
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options.slice(0, 25));

      const popupEmbed = new EmbedBuilder()
        .setTitle('Role Customization')
        .setDescription('Select your desired roles from the menu below.')
        .setColor(template.color || '#5865F2');

      return interaction.reply({
        embeds: [popupEmbed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        ephemeral: true
      });
    }

    // Live Action: Gacha Pool Popup Roll
    if (action === 'modurole_open_gacha_popup') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.randomPool || template.randomPool.length === 0) {
        return interaction.reply({ content: 'No roles found in this random pool.', ephemeral: true });
      }

      const randomRoleId = template.randomPool[Math.floor(Math.random() * template.randomPool.length)];
      const targetRole = interaction.guild.roles.cache.get(randomRoleId);

      if (!targetRole) {
        return interaction.reply({ content: 'The selected role was deleted from the server.', ephemeral: true });
      }

      const roleEmoji = resolveRoleEmoji(targetRole, interaction.guild);
      const emojiDisplay = roleEmoji ? (roleEmoji.id ? `<:${roleEmoji.name}:${roleEmoji.id}> ` : `${roleEmoji.name} `) : '';

      try {
        await interaction.member.roles.add(targetRole);

        const gachaEmbed = new EmbedBuilder()
          .setTitle('Gacha Reward')
          .setDescription(`🎉 Congratulations! You received:\n\n### ${emojiDisplay}**${targetRole.name}**`)
          .setColor(targetRole.color || '#FEE75C')
          .setFooter({ text: 'ModuRole Gacha Engine' });

        return interaction.reply({
          embeds: [gachaEmbed],
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          content: 'Bot cannot grant this role. Please ensure bot hierarchy is higher than the reward role.',
          ephemeral: true
        });
      }
    }
  }

  // 3. Modal Form Submission
  if (interaction.isModalSubmit()) {
    const [action, targetName] = interaction.customId.split(':');
    const template = db.getTemplate(interaction.guildId, targetName);
    if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

    if (action === 'modal_save_content') {
      template.title = interaction.fields.getTextInputValue('input_title');
      template.description = interaction.fields.getTextInputValue('input_description');
    }

    if (action === 'modal_save_sender') {
      template.senderName = interaction.fields.getTextInputValue('input_sender_name') || 'ModuRole Engine';
      template.senderAvatar = interaction.fields.getTextInputValue('input_sender_avatar') || null;
    }

    if (action === 'modal_save_media') {
      template.color = interaction.fields.getTextInputValue('input_color') || '#5865F2';
      template.image = interaction.fields.getTextInputValue('input_image') || null;
      template.thumbnail = interaction.fields.getTextInputValue('input_thumbnail') || null;
    }

    db.saveTemplate(interaction.guildId, targetName, template);
    return interaction.update({
      content: `Studio Control Panel: \`${targetName}\``,
      embeds: [renderTemplateEmbed(template, client.user)],
      components: [createBuilderPanel(targetName)]
    });
  }

  // 4. Multi-Select Submit Handler
  if (interaction.isStringSelectMenu()) {
    const [action, targetName] = interaction.customId.split(':');

    if (action === 'modurole_multi_submit') {
      const selectedRoleIds = interaction.values;
      const member = interaction.member;
      const added = [];
      const removed = [];

      try {
        for (const rId of selectedRoleIds) {
          const role = interaction.guild.roles.cache.get(rId);
          if (role) {
            if (member.roles.cache.has(role.id)) {
              await member.roles.remove(role);
              removed.push(role.name);
            } else {
              await member.roles.add(role);
              added.push(role.name);
            }
          }
        }

        let summary = '### Role Status Updated:\n';
        if (added.length > 0) summary += `✨ **Granted:** ${added.join(', ')}\n`;
        if (removed.length > 0) summary += `🗑️ **Removed:** ${removed.join(', ')}\n`;

        return interaction.update({
          content: summary || 'No modifications applied.',
          embeds: [],
          components: []
        });
      } catch (err) {
        return interaction.reply({
          content: 'Role update failed due to bot permission hierarchy.',
          ephemeral: true
        });
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
