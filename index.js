const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes
} = require('discord.js');
require('dotenv').config();

const db = require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Helper: Render Preview/Live Embed
function renderTemplateEmbed(template, botUser) {
  const embed = new EmbedBuilder()
    .setTitle(template.title || 'Untitled Embed')
    .setDescription(template.description || 'No description provided.')
    .setColor(template.color || 0x5865F2)
    .setFooter({
      text: `Managed by ${botUser.username}`,
      iconURL: botUser.displayAvatarURL()
    });

  if (template.image) embed.setImage(template.image);
  if (template.thumbnail) embed.setThumbnail(template.thumbnail);

  return embed;
}

// Helper: Build Components for Interactive Embed
function buildAttachedComponents(template) {
  const rows = [];

  // 1. Zira-Style Toggle Role Button
  if (template.toggleRoleId) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action_toggle_role:${template.toggleRoleId}`)
          .setLabel('Get / Remove Role')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏷️')
      )
    );
  }

  // 2. Random Role Gacha Button
  if (template.randomPool && template.randomPool.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action_random_role:${template.name}`)
          .setLabel('Lucky Role Draw')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎲')
      )
    );
  }

  // 3. Multi-Role Long Tab Dropdown Menu
  if (template.multiSelectRoles && template.multiSelectRoles.length > 0) {
    const options = template.multiSelectRoles.slice(0, 25).map(r => ({
      label: r.name,
      value: r.id,
      description: `Toggle ${r.name} role`
    }));

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`action_multi_select:${template.name}`)
          .setPlaceholder('🔽 Select your roles (Multiple choices allowed)...')
          .setMinValues(1)
          .setMaxValues(options.length)
          .addOptions(options)
      )
    );
  }

  return rows;
}

// Helper: Interactive Builder Control Panel (Mimu-Style)
function createBuilderPanel(templateName) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_edit_content:${templateName}`)
      .setLabel('Edit Content')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(`panel_edit_images:${templateName}`)
      .setLabel('Set Media')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🖼️'),
    new ButtonBuilder()
      .setCustomId(`panel_post_channel:${templateName}`)
      .setLabel('Publish Live')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀')
  );
}

// Slash Commands Definition
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display documentation and guidelines for ModuRole'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Embed and role configuration engine')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    // /embed create
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create and launch an interactive embed builder session')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Unique template identifier name')
            .setRequired(true)
        )
    )
    // /embed edit
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit an existing embed template or live message')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Name of the template to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Target live message ID (Optional)')
            .setRequired(false)
        )
    )
    // /embed delete
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete an existing embed template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Name of the template to delete')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    // Configuration Attachments
    .addSubcommand(sub =>
      sub
        .setName('attach_role_toggle')
        .setDescription('Attach a Zira-style single toggle role button to a template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Template name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to toggle')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('attach_random_role')
        .setDescription('Add a role into the random pool gacha for a template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Template name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add into pool')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('attach_multi_role')
        .setDescription('Add a role into the multi-select dropdown tab for a template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Template name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add to the menu')
            .setRequired(true)
        )
    )
].map(c => c.toJSON());

// Lifecycle Initialization
client.once('ready', async () => {
  console.log(`[ModuRole] Global Service Online: ${client.user.tag}`);

     const activities = [
    { name: '/help | ModuRole Engine', type: ActivityType.Playing },
    { name: 'Role Requests', type: ActivityType.Listening },
    { name: 'Community Hub', type: ActivityType.Streaming, url: 'https://twitch.tv/discord' },
    { name: `${client.guilds.cache.size} Servers`, type: ActivityType.Watching }
  ];

  let activityIndex = 0;

  setInterval(() => {
    const current = activities[activityIndex];
    client.user.setPresence({
      activities: [{
        name: current.name,
        type: current.type,
        url: current.url || undefined
      }],
      status: 'online'
    });

    activityIndex = (activityIndex + 1) % activities.length;
  }, 15000);
    
    
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('[ModuRole] Synchronizing global slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('[ModuRole] Slash commands registered successfully.');
  } catch (error) {
    console.error('[ModuRole] Command sync error:', error);
  }
});

// Dynamic Autocomplete for Template Names
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  if (interaction.commandName === 'embed') {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const templates = db.getTemplates(interaction.guildId);
    const names = Object.keys(templates);

    const filtered = names
      .filter(name => name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(name => ({ name: name, value: name }))
    );
  }
});

// Interaction Dispatcher
client.on('interactionCreate', async interaction => {
  // 1. Slash Commands
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guildId } = interaction;

    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('ModuRole Core | Commands & Usage')
        .setColor(0x5865F2)
        .setDescription('Modular Discord embed and dynamic role assignment documentation.')
        .addFields(
          { name: '/embed create <name>', value: 'Open a visual Mimu-style builder session to craft and publish an embed.' },
          { name: '/embed edit <name> [message_id]', value: 'Edit an existing template or update a deployed live message.' },
          { name: '/embed delete <name>', value: 'Remove a template permanently from this server.' },
          { name: '/embed attach_role_toggle', value: 'Add a 1-click toggle button (Zira style).' },
          { name: '/embed attach_random_role', value: 'Add roles to the gacha pool for lucky roll.' },
          { name: '/embed attach_multi_role', value: 'Add selectable roles to the multi-choice long tab menu.' }
        )
        .setFooter({ text: `Managed by ${client.user.username}`, iconURL: client.user.displayAvatarURL() });

      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    if (commandName === 'embed') {
      const sub = options.getSubcommand();
      const templateName = options.getString('name');

      if (sub === 'create') {
        const existing = db.getTemplate(guildId, templateName);
        if (existing) {
          return interaction.reply({
            content: `Template \`${templateName}\` already exists. Use \`/embed edit\` instead.`,
            ephemeral: true
          });
        }

        const newTemplate = {
          name: templateName,
          title: `New Embed: ${templateName}`,
          description: 'Click **Edit Content** below to adjust text, or **Set Media** for images.',
          image: null,
          thumbnail: null,
          color: 0x5865F2,
          toggleRoleId: null,
          randomPool: [],
          multiSelectRoles: []
        };

        db.saveTemplate(guildId, templateName, newTemplate);

        const previewEmbed = renderTemplateEmbed(newTemplate, client.user);
        const panelRow = createBuilderPanel(templateName);

        return interaction.reply({
          content: `🛠️ **Builder Session Started for:** \`${templateName}\``,
          embeds: [previewEmbed],
          components: [panelRow],
          ephemeral: true
        });
      }

      if (sub === 'edit') {
        const template = db.getTemplate(guildId, templateName);
        if (!template) {
          return interaction.reply({ content: `Template \`${templateName}\` not found.`, ephemeral: true });
        }

        const messageId = options.getString('message_id');
        if (messageId) {
          try {
            const liveMsg = await interaction.channel.messages.fetch(messageId);
            const liveEmbed = renderTemplateEmbed(template, client.user);
            const liveComponents = buildAttachedComponents(template);

            await liveMsg.edit({ embeds: [liveEmbed], components: liveComponents });
            db.linkActiveEmbed(guildId, messageId, templateName);

            return interaction.reply({
              content: `Live message \`${messageId}\` updated successfully from template \`${templateName}\`.`,
              ephemeral: true
            });
          } catch (err) {
            return interaction.reply({ content: `Failed to fetch or edit message \`${messageId}\`. Check permissions.`, ephemeral: true });
          }
        }

        const previewEmbed = renderTemplateEmbed(template, client.user);
        const panelRow = createBuilderPanel(templateName);

        return interaction.reply({
          content: `🛠️ **Editor Session for:** \`${templateName}\``,
          embeds: [previewEmbed],
          components: [panelRow],
          ephemeral: true
        });
      }

      if (sub === 'delete') {
        const deleted = db.removeTemplate(guildId, templateName);
        if (deleted) {
          return interaction.reply({ content: `Template \`${templateName}\` has been deleted successfully.`, ephemeral: true });
        } else {
          return interaction.reply({ content: `Template \`${templateName}\` was not found.`, ephemeral: true });
        }
      }

      if (sub === 'attach_role_toggle') {
        const template = db.getTemplate(guildId, templateName);
        if (!template) return interaction.reply({ content: `Template \`${templateName}\` not found.`, ephemeral: true });

        const role = options.getRole('role');
        template.toggleRoleId = role.id;
        db.saveTemplate(guildId, templateName, template);

        return interaction.reply({ content: `Attached toggle button for role **${role.name}** to template \`${templateName}\`.`, ephemeral: true });
      }

      if (sub === 'attach_random_role') {
        const template = db.getTemplate(guildId, templateName);
        if (!template) return interaction.reply({ content: `Template \`${templateName}\` not found.`, ephemeral: true });

        const role = options.getRole('role');
        if (!template.randomPool) template.randomPool = [];
        if (!template.randomPool.includes(role.id)) {
          template.randomPool.push(role.id);
          db.saveTemplate(guildId, templateName, template);
        }

        return interaction.reply({ content: `Added role **${role.name}** into lucky draw pool for \`${templateName}\`.`, ephemeral: true });
      }

      if (sub === 'attach_multi_role') {
        const template = db.getTemplate(guildId, templateName);
        if (!template) return interaction.reply({ content: `Template \`${templateName}\` not found.`, ephemeral: true });

        const role = options.getRole('role');
        if (!template.multiSelectRoles) template.multiSelectRoles = [];
        if (!template.multiSelectRoles.some(r => r.id === role.id)) {
          template.multiSelectRoles.push({ id: role.id, name: role.name });
          db.saveTemplate(guildId, templateName, template);
        }

        return interaction.reply({ content: `Added role **${role.name}** to multi-select tab for \`${templateName}\`.`, ephemeral: true });
      }
    }
  }

  // 2. Control Panel Button Handlers (Modals)
  if (interaction.isButton()) {
    const [action, targetName] = interaction.customId.split(':');

    // Panel: Edit Content (Title & Description)
    if (action === 'panel_edit_content') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_content:${targetName}`)
        .setTitle(`Edit Content: ${targetName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_title')
              .setLabel('Embed Title')
              .setValue(template.title || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_description')
              .setLabel('Embed Description')
              .setValue(template.description || '')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    // Panel: Edit Media (Large Image & Small Thumbnail)
    if (action === 'panel_edit_images') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_media:${targetName}`)
        .setTitle(`Set Media: ${targetName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_image')
              .setLabel('Large Image URL')
              .setValue(template.image || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_thumbnail')
              .setLabel('Small Thumbnail URL')
              .setValue(template.thumbnail || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    // Panel: Publish to Current Channel
    if (action === 'panel_post_channel') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const finalEmbed = renderTemplateEmbed(template, client.user);
      const components = buildAttachedComponents(template);

      const published = await interaction.channel.send({
        embeds: [finalEmbed],
        components: components
      });

      db.linkActiveEmbed(interaction.guildId, published.id, targetName);

      return interaction.reply({
        content: `Embed published successfully! ID: \`${published.id}\``,
        ephemeral: true
      });
    }

    // Interaction: Zira-Style Toggle Role
    if (action === 'action_toggle_role') {
      const roleId = targetName;
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: 'Target role not found.', ephemeral: true });

      const member = interaction.member;
      try {
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          return interaction.reply({ content: `Role **${role.name}** removed.`, ephemeral: true });
        } else {
          await member.roles.add(role);
          return interaction.reply({ content: `Role **${role.name}** granted.`, ephemeral: true });
        }
      } catch (err) {
        return interaction.reply({ content: 'Bot lacks permission to modify this role.', ephemeral: true });
      }
    }

    // Interaction: Lucky Role Draw (Gacha)
    if (action === 'action_random_role') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.randomPool || template.randomPool.length === 0) {
        return interaction.reply({ content: 'No roles found in the random pool.', ephemeral: true });
      }

      const randomRoleId = template.randomPool[Math.floor(Math.random() * template.randomPool.length)];
      const role = interaction.guild.roles.cache.get(randomRoleId);
      if (!role) return interaction.reply({ content: 'Selected role does not exist.', ephemeral: true });

      try {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `You rolled and received: **${role.name}**!`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: 'Bot lacks permission to grant this role.', ephemeral: true });
      }
    }
  }

  // 3. Modal Submissions (Live Preview Updates)
  if (interaction.isModalSubmit()) {
    const [action, targetName] = interaction.customId.split(':');

    if (action === 'modal_save_content') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      template.title = interaction.fields.getTextInputValue('input_title');
      template.description = interaction.fields.getTextInputValue('input_description');
      db.saveTemplate(interaction.guildId, targetName, template);

      const previewEmbed = renderTemplateEmbed(template, client.user);
      const panelRow = createBuilderPanel(targetName);

      return interaction.update({
        content: `Preview updated for \`${targetName}\`:`,
        embeds: [previewEmbed],
        components: [panelRow]
      });
    }

    if (action === 'modal_save_media') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      template.image = interaction.fields.getTextInputValue('input_image') || null;
      template.thumbnail = interaction.fields.getTextInputValue('input_thumbnail') || null;
      db.saveTemplate(interaction.guildId, targetName, template);

      const previewEmbed = renderTemplateEmbed(template, client.user);
      const panelRow = createBuilderPanel(targetName);

      return interaction.update({
        content: `Media updated for \`${targetName}\`:`,
        embeds: [previewEmbed],
        components: [panelRow]
      });
    }
  }

  // 4. Multi-Role Long Tab Dropdown Selection
  if (interaction.isStringSelectMenu()) {
    const [action, targetName] = interaction.customId.split(':');

    if (action === 'action_multi_select') {
      const selectedRoleIds = interaction.values;
      const member = interaction.member;

      let added = [];
      let removed = [];

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

        let replyMsg = '';
        if (added.length > 0) replyMsg += `Granted: **${added.join(', ')}**\n`;
        if (removed.length > 0) replyMsg += `Removed: **${removed.join(', ')}**`;

        return interaction.reply({
          content: replyMsg || 'No changes made.',
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({ content: 'Failed to update roles due to permission hierarchy.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
