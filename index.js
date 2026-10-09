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
  EmbedBuilder
} = require('discord.js');
const db = require('./database.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// UI Helper: Interactive Builder Control Panel
function createBuilderPanel(templateName) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`builder_edit_text:${templateName}`)
      .setLabel('Edit Content')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`builder_edit_media:${templateName}`)
      .setLabel('Edit Media')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`builder_publish:${templateName}`)
      .setLabel('Publish Live')
      .setStyle(ButtonStyle.Success)
  );
  return row1;
}

// UI Helper: Render visual embed preview from stored template data
function renderTemplateEmbed(template, clientUser) {
  const embed = new EmbedBuilder()
    .setTitle(template.title || 'Untitled Notification')
    .setDescription(template.description || 'No description configured.')
    .setColor(template.color || '#5865F2');

  if (template.thumbnail) embed.setThumbnail(template.thumbnail);
  if (template.image) embed.setImage(template.image);

  embed.setFooter({
    text: 'Managed by ModuRole',
    iconURL: clientUser.displayAvatarURL()
  });

  return embed;
}

// UI Helper: Generate interactive ActionRows (Buttons & Select Menus) for published messages
function renderTemplateComponents(template, templateName, guild) {
  const rows = [];
  const buttonList = [];

  // 1. Single Toggle Role Button (Zira Style)
  if (template.toggleRoleId) {
    const role = guild.roles.cache.get(template.toggleRoleId);
    const labelText = role ? `Toggle ${role.name}` : 'Toggle Role';
    buttonList.push(
      new ButtonBuilder()
        .setCustomId(`action_toggle_role:${templateName}`)
        .setLabel(labelText)
        .setStyle(ButtonStyle.Primary)
    );
  }

  // 2. Random Role Gacha Button
  if (template.randomPool && template.randomPool.length > 0) {
    buttonList.push(
      new ButtonBuilder()
        .setCustomId(`action_random_role:${templateName}`)
        .setLabel('🎲 Roll Random Role')
        .setStyle(ButtonStyle.Success)
    );
  }

  if (buttonList.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(buttonList));
  }

  // 3. Multi-Role Long Tab Dropdown Menu (References by Role ID)
  if (template.multiRoles && template.multiRoles.length > 0) {
    const validOptions = [];

    for (const rId of template.multiRoles) {
      const role = guild.roles.cache.get(rId);
      if (role) {
        validOptions.push({
          label: role.name,
          value: role.id,
          description: `ID: ${role.id}`
        });
      }
    }

    if (validOptions.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`action_multi_select:${templateName}`)
        .setPlaceholder('Choose your roles...')
        .setMinValues(0)
        .setMaxValues(validOptions.length)
        .addOptions(validOptions.slice(0, 25));

      rows.push(new ActionRowBuilder().addComponents(selectMenu));
    }
  }

  return rows;
}

// Slash Command Registry Definition
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all ModuRole bot commands and setup documentation'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Embed system and role management interface')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new embed template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Unique template name')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Open builder editor or sync an active published message')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Template name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Target live message ID to update components or content')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Permanently remove a template')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Template name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('attach_role_toggle')
        .setDescription('Attach a 1-click toggle button to a template')
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
    ),

  // attach_random_role: รองรับสูงสุด 10 ยศต่อคำสั่ง
  new SlashCommandBuilder()
    .setName('attach_random_role')
    .setDescription('Add up to 10 roles into the random pool gacha for a template')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Template name')
        .setRequired(true)
        .setAutocomplete(true)
    )
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

  // attach_multi_role: รองรับสูงสุด 10 ยศต่อคำสั่ง
  new SlashCommandBuilder()
    .setName('attach_multi_role')
    .setDescription('Add up to 10 roles to the multi-select dropdown menu')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Template name')
        .setRequired(true)
        .setAutocomplete(true)
    )
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

// Lifecycle Initialization
client.once('ready', async () => {
  console.log(`[ModuRole] Global Service Online: ${client.user.tag}`);

  // Dynamic Presence Rotation
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

  if (interaction.commandName === 'embed' ||
      interaction.commandName === 'attach_random_role' ||
      interaction.commandName === 'attach_multi_role') {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const templates = db.listTemplates(interaction.guildId);
    const filtered = templates.filter(name => name.toLowerCase().includes(focusedValue));

    await interaction.respond(
      filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
    );
  }
});

// Primary Interaction Engine
client.on('interactionCreate', async interaction => {
  // 1. Slash Commands Processing
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('ModuRole — Operational Guide')
        .setColor('#5865F2')
        .setDescription('A modular system for building visual embeds, buttons, gacha role pulls, and multi-select menus.')
        .addFields(
          { name: '/help', value: 'Displays this command guide.' },
          { name: '/embed create <name>', value: 'Initiate visual builder session.' },
          { name: '/embed edit <name> [message_id]', value: 'Edit template or sync an already published embed.' },
          { name: '/embed delete <name>', value: 'Remove a template permanently.' },
          { name: '/embed attach_role_toggle <name> <role>', value: 'Attach a 1-click toggle button.' },
          { name: '/attach_random_role <name> [role1..10]', value: 'Add up to 10 roles to gacha pool.' },
          { name: '/attach_multi_role <name> [role1..10]', value: 'Add up to 10 roles to dropdown selection.' }
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
          title: 'Title: Welcome to Our Server',
          description: 'Click buttons below to receive your respective community roles.',
          color: '#5865F2',
          image: null,
          thumbnail: null,
          toggleRoleId: null,
          randomPool: [],
          multiRoles: []
        };

        db.saveTemplate(interaction.guildId, name, newTemplate);
        const previewEmbed = renderTemplateEmbed(newTemplate, client.user);
        const panelRow = createBuilderPanel(name);

        return interaction.reply({
          content: `Builder initialized for template: \`${name}\``,
          embeds: [previewEmbed],
          components: [panelRow],
          ephemeral: true
        });
      }

      if (sub === 'edit') {
        const name = interaction.options.getString('name');
        const messageId = interaction.options.getString('message_id');
        const template = db.getTemplate(interaction.guildId, name);

        if (!template) {
          return interaction.reply({ content: `Template \`${name}\` not found.`, ephemeral: true });
        }

        // หากมีการระบุ message_id ให้ซิงก์ข้อความจริงที่โพสต์ไปแล้ว
        if (messageId) {
          try {
            const targetMsg = await interaction.channel.messages.fetch(messageId);
            if (!targetMsg) return interaction.reply({ content: 'Target message not found in this channel.', ephemeral: true });

            const updatedEmbed = renderTemplateEmbed(template, client.user);
            const updatedComponents = renderTemplateComponents(template, name, interaction.guild);

            await targetMsg.edit({
              embeds: [updatedEmbed],
              components: updatedComponents
            });

            return interaction.reply({ content: `Successfully synced live message (\`${messageId}\`) with template \`${name}\`.`, ephemeral: true });
          } catch (err) {
            return interaction.reply({ content: `Could not edit message: ${err.message}`, ephemeral: true });
          }
        }

        const previewEmbed = renderTemplateEmbed(template, client.user);
        const panelRow = createBuilderPanel(name);

        return interaction.reply({
          content: `Editing template: \`${name}\``,
          embeds: [previewEmbed],
          components: [panelRow],
          ephemeral: true
        });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name');
        const success = db.deleteTemplate(interaction.guildId, name);
        if (!success) {
          return interaction.reply({ content: `Template \`${name}\` not found.`, ephemeral: true });
        }
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

    // จัดการ attach_random_role รองรับสูงสุด 10 ยศ บันทึกเป็น Role ID
    if (commandName === 'attach_random_role') {
      const name = interaction.options.getString('name');
      const template = db.getTemplate(interaction.guildId, name);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      if (!template.randomPool) template.randomPool = [];

      const addedRoles = [];
      for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
          if (!template.randomPool.includes(role.id)) {
            template.randomPool.push(role.id);
            addedRoles.push(role.name);
          }
        }
      }

      db.saveTemplate(interaction.guildId, name, template);
      return interaction.reply({
        content: `Added **${addedRoles.length}** role(s) to random pool of \`${name}\`:\n${addedRoles.map(r => `• ${r}`).join('\n')}`,
        ephemeral: true
      });
    }

    // จัดการ attach_multi_role รองรับสูงสุด 10 ยศ บันทึกเป็น Role ID
    if (commandName === 'attach_multi_role') {
      const name = interaction.options.getString('name');
      const template = db.getTemplate(interaction.guildId, name);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      if (!template.multiRoles) template.multiRoles = [];

      const addedRoles = [];
      for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
          if (!template.multiRoles.includes(role.id)) {
            template.multiRoles.push(role.id);
            addedRoles.push(role.name);
          }
        }
      }

      db.saveTemplate(interaction.guildId, name, template);
      return interaction.reply({
        content: `Added **${addedRoles.length}** role(s) to dropdown options of \`${name}\`:\n${addedRoles.map(r => `• ${r}`).join('\n')}`,
        ephemeral: true
      });
    }
  }

  // 2. Button Dispatcher
  if (interaction.isButton()) {
    const [action, targetName] = interaction.customId.split(':');

    // Builder Panel: Edit Text Content
    if (action === 'builder_edit_text') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_content:${targetName}`)
        .setTitle(`Edit Content: ${targetName}`);

      const titleInput = new TextInputBuilder()
        .setCustomId('input_title')
        .setLabel('Embed Title')
        .setStyle(TextInputStyle.Short)
        .setValue(template.title || '')
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('input_description')
        .setLabel('Embed Description')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(template.description || '')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput)
      );

      return interaction.showModal(modal);
    }

    // Builder Panel: Edit Media URLs
    if (action === 'builder_edit_media') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_save_media:${targetName}`)
        .setTitle(`Edit Media: ${targetName}`);

      const imgInput = new TextInputBuilder()
        .setCustomId('input_image')
        .setLabel('Main Image URL')
        .setStyle(TextInputStyle.Short)
        .setValue(template.image || '')
        .setRequired(false);

      const thumbInput = new TextInputBuilder()
        .setCustomId('input_thumbnail')
        .setLabel('Thumbnail Image URL')
        .setStyle(TextInputStyle.Short)
        .setValue(template.thumbnail || '')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(imgInput),
        new ActionRowBuilder().addComponents(thumbInput)
      );

      return interaction.showModal(modal);
    }

    // Builder Panel: Publish Live
    if (action === 'builder_publish') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template) return interaction.reply({ content: 'Template not found.', ephemeral: true });

      const liveEmbed = renderTemplateEmbed(template, client.user);
      const components = renderTemplateComponents(template, targetName, interaction.guild);

      await interaction.channel.send({
        embeds: [liveEmbed],
        components: components
      });

      return interaction.reply({ content: `✅ Successfully published live message for template \`${targetName}\`!`, ephemeral: true });
    }

    // Live Action: Single Role Toggle
    if (action === 'action_toggle_role') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.toggleRoleId) {
        return interaction.reply({ content: 'Role configuration no longer exists.', ephemeral: true });
      }

      const role = interaction.guild.roles.cache.get(template.toggleRoleId);
      if (!role) return interaction.reply({ content: 'Target role not found.', ephemeral: true });

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

    // Live Action: Random Role Gacha (สุ่ม Role ID โดยตรง)
    if (action === 'action_random_role') {
      const template = db.getTemplate(interaction.guildId, targetName);
      if (!template || !template.randomPool || template.randomPool.length === 0) {
        return interaction.reply({ content: 'No roles found in this random pool.', ephemeral: true });
      }

      const randomRoleId = template.randomPool[Math.floor(Math.random() * template.randomPool.length)];
      const targetRole = interaction.guild.roles.cache.get(randomRoleId);

      if (!targetRole) {
        return interaction.reply({ content: 'Selected role was removed from the server.', ephemeral: true });
      }

      try {
        await interaction.member.roles.add(targetRole);
        return interaction.reply({
          content: `🎉 Congratulations! You rolled and received the **${targetRole.name}** role!`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({ content: 'Failed to assign role. Check bot permissions and role hierarchy.', ephemeral: true });
      }
    }
  }

  // 3. Modal Form Submission Updates
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

  // 4. Multi-Role Long Tab Dropdown Selection (Processes by Role ID)
  if (interaction.isStringSelectMenu()) {
    const [action, targetName] = interaction.customId.split(':');

    if (action === 'action_multi_select') {
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
