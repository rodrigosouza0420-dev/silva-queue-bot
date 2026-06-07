require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField
} = require('discord.js');

const config = require('./config');
const db = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const VALUES = [
    "100,00","50,00","20,00","10,00","7,00","5,00",
    "4,00","3,00","2,00","1,00","0,80","0,55","0,40"
];

// ===== DB HELPERS =====
function getQueue(messageId) {
    return db.prepare(`
        SELECT * FROM queues
        WHERE messageId=?
        AND userId IS NOT NULL
    `).all(messageId);
}

function addPlayer(messageId, channelId, value, mode, user) {
    db.prepare(`
        INSERT INTO queues
        (messageId, channelId, userId, username, value, mode)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        messageId,
        channelId,
        user.id,
        user.username,
        value,
        mode
    );
}

function removePlayer(channelId, userId) {
    db.prepare(`
        DELETE FROM queues WHERE channelId=? AND userId=?
    `).run(channelId, userId);
}

function getUserQueue(userId, messageId) {
    return db.prepare(`
        SELECT * FROM queues
        WHERE userId=? AND messageId=?
    `).get(userId, messageId);
}

// ===== BUTTONS =====
function getButtons(channelId) {

    const is1x1 =
    channelId === "1512140639356326069" ||
    channelId === "1512141642268803194" ||
    channelId === "1512142946991079565";

    if (is1x1) {
        return new ActionRowBuilder().addComponents(

            new ButtonBuilder()
                .setCustomId(`mode|${channelId}|GELO_INFINITO`)
                .setLabel("🧊 GELO INFINITO")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`mode|${channelId}|GELO_NORMAL`)
                .setLabel("🧊 GELO NORMAL")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`leave|${channelId}`)
                .setLabel("🚪 SAIR")
                .setStyle(ButtonStyle.Danger)
        );
    }

    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId(`join|${channelId}`)
            .setLabel("✅ ENTRAR")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`mode|${channelId}|FULL_UMP_XM8`)
            .setLabel("🔫 FULL UMP XM8")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`leave|${channelId}`)
            .setLabel("🚪 SAIR")
            .setStyle(ButtonStyle.Danger)
    );
}

// ===== CREATE MATCH =====
async function createMatch(channel, players, value, mode) {

console.log("CREATE MATCH EXECUTADA");

console.log("PLAYERS:", players);
console.log("VALOR:", value);
console.log("MODO:", mode);

    const name = `partida-${channel.name}-${Date.now().toString().slice(-4)}`;

    const guild = channel.guild;

const role = await guild.roles.fetch(config.MEDIATOR_ROLE);

console.log("ROLE ID:", config.MEDIATOR_ROLE);
console.log("ROLE ENCONTRADA:", role?.name);
console.log("ROLE MEMBERS:", role?.members.size);

if (!role) {
    console.log("Cargo FILA não encontrado.");
    return;
}

const mediators = [...role.members.values()];

console.log("Mediadores encontrados:", mediators.length);

if (mediators.length === 0) {
    console.log("Nenhum mediador encontrado.");
    return;
}

const mediator =
    mediators[Math.floor(Math.random() * mediators.length)];

console.log("CRIANDO CANAL DA PARTIDA...");

    let matchChannel;

console.log("MEDIADOR ESCOLHIDO:", mediator?.user?.tag);

try {

    matchChannel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: config.MATCH_CATEGORY,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            ...players.map(p => ({
                id: p.userId,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages
                ]
            })),
            {
                id: config.MEDIATOR_ROLE,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages
                ]
            }
        ]
    });

} catch(err) {

    console.log("ERRO AO CRIAR CANAL:");
    console.log(err);

    return;
}

console.log("Mediadores encontrados:", mediators.length);

console.log("MEDIADOR ESCOLHIDO:", mediator?.user?.tag);

    const mentions = players.map(p => `<@${p.userId}>`).join("\n");

    matchChannel.send({
        content:
`🎮 PARTIDA ENCONTRADA

📌 Modo: ${channel.name}
💰 Valor: R$${value}
⚙️ Regra: ${mode}

👥 Jogadores:
${mentions}

🎯 Mediador: <@${mediator.id}>`
    });

    const medChannel = await client.channels.fetch(config.MEDIATOR_CHANNEL);

medChannel.send({
    content:
`🚨 NOVA PARTIDA

🎯 Mediador: <@${mediator.id}>

📌 ${channel.name}
💰 R$${value}
⚙️ ${mode}

👥 ${mentions}`
});

    // limpar fila
    db.prepare(`DELETE FROM queues WHERE channelId=?`).run(channel.id);
}

// ===== UPDATE PANEL =====
async function updatePanel(message, channelId, value, mode) {

    const rows = db.prepare(`
    SELECT * FROM queues
    WHERE messageId=?
    AND userId IS NOT NULL
`).all(message.id);

    const players = rows.map(r => r.userId);

    const text =
`🎮 ${message.channel.name.toUpperCase()}

💰 Valor: R$${value}

👥 Jogadores (${players.length}/2)

${rows.map((r,i)=>`${i+1}. ${r.mode || "NORMAL"}: <@${r.userId}>`).join("\n") || "Nenhum jogador"}

⚙️ Modo: ${mode}`;
await message.edit({
    content: text,
    components: [getButtons(channelId)]
});

    console.log("JOGADORES:", players.length);

if (players.length >= 2) {

    const filaChannel =
        await client.channels.fetch("1512185831614578698");

    const row =
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept|${message.id}`)
                .setLabel("✅ ACEITAR PARTIDA")
                .setStyle(ButtonStyle.Success)
        );

    await filaChannel.send({
        content:
`🎮 NOVA PARTIDA

💰 Valor: R$${value}

⚙️ Regra: ${mode}

👥 Jogadores:

${rows.map(r => `<@${r.userId}>`).join("\n")}`,
        components: [row]
    });

    db.prepare(`
    DELETE FROM queues
    WHERE messageId=?
    AND userId IS NOT NULL
`).run(message.id);

await message.edit({
    content:
`🎮 ${message.channel.name.toUpperCase()}

💰 Valor: R$${value}

👥 Jogadores (0/2)

Nenhum jogador

⚙️ Modo: Aguardando seleção

🧊 Escolha o modo abaixo:`,

    components: [getButtons(channelId)]
});

await message.edit({
    content:
`🎮 ${message.channel.name.toUpperCase()}

💰 Valor: R$${value}

👥 Jogadores (0/2)

Nenhum jogador

⚙️ Modo: Aguardando seleção

🧊 Escolha o modo abaixo:`,

    components: [getButtons(channelId)]
});

}
}

// ===== EVENTS =====
client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} online!`);
});

// painel generator
client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

console.log("MENSAGEM RECEBIDA:", message.content);

if (message.content.startsWith("!setpix")) {

    const pix =
        message.content.replace("!setpix", "").trim();

    if (!pix) {

        return message.reply(
            "Use: !setpix sua_chave_pix"
        );
    }

    db.prepare(`
        INSERT OR REPLACE INTO mediators
        (discordId, pix)
        VALUES (?, ?)
    `).run(
        message.author.id,
        pix
    );

    return message.reply(
        "✅ Chave PIX cadastrada com sucesso!"
    );
}

    // ===== PAINEL =====
    if (message.content === '!painel') {

    for (const channelId of config.QUEUE_CHANNELS) {
        try {
            const channel = await client.channels.fetch(channelId);

            console.log("VALORES:", VALUES);

for (const value of VALUES) {

    console.log("CRIANDO:", value);

                const msg = await channel.send({
                    content:
`🎮 ${channel.name}

💰 Valor: R$${value}

👥 Jogadores (0/2)

⚙️ Modo: Aguardando seleção

🧊 Escolha o modo abaixo:`,
                    components: [getButtons(channel.id)]
                });

                db.prepare(`
    INSERT INTO queues (messageId, channelId, value, mode)
    VALUES (?, ?, ?, ?)
`).run(msg.id, channel.id, value, null);
            }

        } catch (err) {
            console.log("ERRO NO CANAL:", channelId, err);
        }
    }

    return; // 🔥 MUITO IMPORTANTE: impede o código de “vazar”
}

    // ===== LIMPAR =====
    if (message.content === '!limpar') {

        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('❌ Sem permissão.');
        }

        await message.reply('🧹 Limpando canais...');

        for (const channelId of config.QUEUE_CHANNELS) {
            try {
                const channel = await client.channels.fetch(channelId);

                let fetched;

                do {
                    fetched = await channel.messages.fetch({ limit: 100 });

                    const deletable = fetched.filter(m =>
                        Date.now() - m.createdTimestamp < 1209600000
                    );

                    await channel.bulkDelete(deletable, true);

                } while (fetched.size >= 2);

            } catch (err) {
                console.log(err);
            }
        }

        return message.channel.send('✅ Todos os painéis foram limpos!');
    }
});

// buttons
client.on('interactionCreate', async (interaction) => {

    if (!interaction.isButton()) return;

if (interaction.customId === "finish_match") {

const membro = interaction.member;

if (
    !membro.roles.cache.has(config.MEDIATOR_ROLE)
) {
    return interaction.reply({
        content: "❌ Apenas mediadores podem usar este botão.",
        ephemeral: true
    });
}

    const partida = db.prepare(`
        SELECT * FROM matches
        WHERE channelId=?
    `).get(interaction.channel.id);

    if (!partida) {
        return interaction.reply({
            content: "❌ Partida não encontrada.",
            ephemeral: true
        });
    }

    if (partida.mediatorId !== interaction.user.id) {
        return interaction.reply({
            content: "❌ Apenas o mediador desta partida pode finalizar.",
            ephemeral: true
        });
    }

    const mediador = db.prepare(`
        SELECT * FROM mediators
        WHERE discordId=?
    `).get(interaction.user.id);

    await interaction.channel.send({

        content:
`💳 PAGAMENTO

🎯 Mediador:
<@${interaction.user.id}>

🔑 Chave PIX:

${mediador?.pix || "PIX NÃO CADASTRADO"}

⚠️ Após o pagamento envie o comprovante.`
    });

    return interaction.reply({
        content: "✅ PIX enviado para os jogadores.",
        ephemeral: true
    });
}

    const [type, channelId, extra] = interaction.customId.split("|");

    const user = interaction.user;

    const userQueue = getUserQueue(user.id, interaction.message.id);

    if (type === "leave") {

    db.prepare(`
        DELETE FROM queues
        WHERE messageId=? AND userId=?
    `).run(interaction.message.id, user.id);

    const row = db.prepare(`
        SELECT * FROM queues
        WHERE messageId=?
        LIMIT 1
    `).get(interaction.message.id);

    await updatePanel(
        interaction.message,
        channelId,
        row?.value || "0",
        row?.mode || "NORMAL"
    );

    return interaction.reply({
        content: "🚪 Saiu da fila!",
        ephemeral: true
    });
}

   if (type === "mode") {

    const messageId = interaction.message.id;
    const selectedMode = extra;

    const row = db.prepare(`
        SELECT * FROM queues
        WHERE messageId = ?
    `).get(messageId);

    if (!row) {
        return interaction.reply({
            content: "❌ Fila não encontrada.",
            ephemeral: true
        });
    }

const alreadyInQueue = db.prepare(`
    SELECT * FROM queues
    WHERE messageId=? AND userId=?
`).get(messageId, user.id);

if (alreadyInQueue) {
    return interaction.reply({
        content: "❌ Você já está nessa fila!",
        ephemeral: true
    });
}

    db.prepare(`
        INSERT INTO queues
        (messageId, channelId, userId, username, value, mode)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        messageId,
        row.channelId,
        user.id,
        user.username,
        row.value,
        selectedMode
    );

    await updatePanel(
        interaction.message,
        row.channelId,
        row.value,
        selectedMode
    );

    return interaction.reply({
        content: `✅ Entrou na fila (${selectedMode})`,
        ephemeral: true
    });
}

if (type === "join") {

    const messageId = interaction.message.id;

    const row = db.prepare(`
        SELECT * FROM queues WHERE messageId=?
    `).get(messageId);

    if (!row)
        return interaction.reply({ content: "❌ Fila não encontrada", ephemeral: true });

    const value = row.value;
    const mode = row.mode || "NORMAL";

    const userQueue = getUserQueue(user.id, messageId);

    if (userQueue)
        return interaction.reply({ content: "❌ Você já está nessa fila!", ephemeral: true });

    addPlayer(messageId, channelId, value, mode, user);

    await updatePanel(interaction.message, channelId, value, mode);

    return interaction.reply({ content: "✅ Entrou na fila!", ephemeral: true });
}

if (type === "accept") {

await interaction.deferReply({
    ephemeral: true
});

    const message = interaction.message;

    const linhas = message.content.split("\n");

    const valor =
        linhas.find(x => x.includes("Valor"))
        ?.replace("💰 Valor: R$", "")
        ?.trim() || "0";

    const modo =
        linhas.find(x => x.includes("Regra"))
        ?.replace("⚙️ Regra:", "")
        ?.trim() || "NORMAL";

    const jogadores = [];

    for (const linha of linhas) {

        const match = linha.match(/<@(\d+)>/);

        if (match) {
            jogadores.push({
                userId: match[1]
            });
        }
    }

    const guild = interaction.guild;

    const canalPartida =
        await guild.channels.create({

            name: `partida-${Date.now()}`,

            type: ChannelType.GuildText,

            parent: config.MATCH_CATEGORY,

            permissionOverwrites: [

    {
        id: guild.roles.everyone.id,
        deny: [
            PermissionsBitField.Flags.ViewChannel
        ]
    },

    ...jogadores.map(p => ({
        id: p.userId,
        allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
        ]
    })),

    {
        id: config.MEDIATOR_ROLE,
        allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
        ]
    }
]
        });

   const finalizarRow =
    new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("finish_match")
            .setLabel("🏆 FINALIZAR PARTIDA")
            .setStyle(ButtonStyle.Danger)
    );

await canalPartida.send({

    content:
`🎮 PARTIDA ENCONTRADA

💰 Valor: R$${valor}

⚙️ Regra: ${modo}

👥 Jogadores:

${jogadores.map(p => `<@${p.userId}>`).join("\n")}

🎯 Mediador:
<@${interaction.user.id}>`,

    components: [finalizarRow]
});

db.prepare(`
INSERT OR REPLACE INTO matches
(channelId, mediatorId)
VALUES (?, ?)
`).run(
    canalPartida.id,
    interaction.user.id
);

await message.delete();

return interaction.editReply({
    content: "✅ Partida assumida!"
});
} // fecha if (type === "accept")

}); // fecha client.on('interactionCreate')

client.login(process.env.TOKEN);