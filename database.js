// Native Zero-Dependency .env Loader (works seamlessly on ZeroHost without npm dotenv package)
(function loadEnvFile() {
    try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const k = trimmed.slice(0, eqIdx).trim();
                    let v = trimmed.slice(eqIdx + 1).trim();
                    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                        v = v.slice(1, -1);
                    }
                    if (process.env[k] === undefined) {
                        process.env[k] = v;
                    }
                }
            });
        }
    } catch(_) {}
})();
const mongoose = require('mongoose');

// Global plugin to resolve the 'new' deprecation warning globally
mongoose.plugin(schema => {
    schema.pre('findOneAndUpdate', function() {
        const options = this.getOptions();
        if (options && options.new !== undefined) {
            options.returnDocument = options.new ? 'after' : 'before';
            delete options.new;
        }
    });
    schema.pre('findOneAndReplace', function() {
        const options = this.getOptions();
        if (options && options.new !== undefined) {
            options.returnDocument = options.new ? 'after' : 'before';
            delete options.new;
        }
    });
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://fusionbot:tpg@fusionbot.lq3g6fc.mongodb.net/fusionbot?retryWrites=true&w=majority';

// Only connect if not already connected or connecting
if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log(`✅ Connected to MongoDB Cloud`))
        .catch(e => console.log('❌ MongoDB Error:', e));
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverConfigSchema = new mongoose.Schema({
    guildId: String,

    // Welcome / Goodbye
    welcomeChannel: String,
    byeChannel: String,
    welcomeDesc: String,
    byeDesc: String,
    welcomeBg: String,
    byeBg: String,
    welcomeBgLocal: String,
    byeBgLocal: String,

    // Ticketing
    ticketTitle: { type: String, default: '🎫 Support Center' },
    ticketDesc: String,
    ticketImage: String,
    ticketImageLocal: String,
    ticketOptions: [{ label: String, desc: String, emoji: String }],
    ticketSupportRole: { type: String, default: '' },
    // 🤖 AI-driven ticket intake
    ticketMode: { type: String, default: 'normal' },        // 'normal' | 'ai'
    ticketAiQuestions: { type: [String], default: [] },     // questions the bot asks in order
    ticketResponseChannel: { type: String, default: '' },   // channel that receives the full Q&A submission

    // Premium Subscription
    isPremium: { type: Boolean, default: false },
    premiumPlan: { type: String, default: 'free' }, // 'free' | 'starter' | 'pro'
    premiumCycle: { type: String, default: 'monthly' }, // 'monthly' | 'yearly'
    premiumExpiresAt: Date,
    premiumActivatedBy: String,

    // Moderation
    // 👑 Bot Personalizer Branding (Per-Server Avatar, Banner, Nickname)
    botNickname: { type: String, default: '' },
    botAvatar: { type: String, default: '' },
    botBanner: { type: String, default: '' },

    customPrefix: { type: String, default: '' },
    customPrefixes: { type: [String], default: [] },
    banWordTimeout: { type: Number, default: 10 },
    banWordKickThreshold: { type: Number, default: 3 },
    banWords: [String],
    bannedUsers: [String],
    userStrikes: { type: Map, of: Number, default: {} },
    disabledChannels: [String],
    disabledAIChannels: [String],
    aiEnabledChannels: [String],   // channels where bot replies WITHOUT being mentioned
    aiGlobalEnabled: { type: Boolean, default: false }, // 🔒 AI is OFF by default in every server
    disabledLinkChannels: [String],
    voicePack: { type: String, default: 'male' }, // 🎙️ Voice AI Pack: 'male' | 'female'

    // Auto-backup & Drive
    autoBackup: { type: Boolean, default: false },
    nukeBackupUses: { type: Number, default: 0 },

    // Invite tracking
    invites: { type: Map, of: Number, default: {} },
    inviteTrackerChannel: { type: String, default: '' },
    // Detailed invite history — who invited whom, and when. Powers /invites info.
    inviteRecords: [{ invitedUserId: String, inviterId: String, joinedAt: { type: Date, default: Date.now } }],

    // Music node health
    musicNodePing: Number,
    musicNodeLastSeen: Number,

    // React Roles
    reactRoles: [{ emoji: String, roleId: String, roleName: String }],
    reactRoleChannel: { type: String, default: '' },
    reactRoleMessageId: { type: String, default: '' },
    reactRoleTitle: { type: String, default: '🎭 React Role Picker' },
    reactRoleDesc: { type: String, default: 'React below to get your roles!' },

    // Auto Roles
    autoRoleMember: { type: mongoose.Schema.Types.Mixed, default: '' },
    autoRoleBot: { type: mongoose.Schema.Types.Mixed, default: '' },
    autoRoleEnabled: { type: Boolean, default: false },

    // Anti-Spam
    antiSpamEnabled: { type: Boolean, default: false },
    antiSpamMaxMessages: { type: Number, default: 5 },
    antiSpamWindow: { type: Number, default: 5000 },
    antiSpamAction: { type: String, default: 'timeout' },
    antiSpamTimeoutMs: { type: Number, default: 30000 },
    attachmentSpamEnabled: { type: Boolean, default: false },
    attachmentSpamMax: { type: Number, default: 5 },
    attachmentSpamTimeoutMs: { type: Number, default: 30000 },
    mentionSpamEnabled: { type: Boolean, default: false },
    mentionSpamMax: { type: Number, default: 5 },
    mentionSpamTimeoutMs: { type: Number, default: 60000 },
    banWordKickEnabled: { type: Boolean, default: false },
    ignoredChannels: { type: [String], default: [] },
    ignoredChannelCommands: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Leveling System
    levelingEnabled: { type: Boolean, default: false },
    levelingChannel: { type: String, default: '' },
    levelRoleRewards: [{ level: Number, roleId: String }],

    // Notifications
    notificationChannel: { type: String, default: '' },
    notificationTypes: { type: [String], default: [] },
    youtubeChannels: { type: [String], default: [] },
    twitchChannels: { type: [String], default: [] },

    // Command Permissions
    commandPermissions: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Nuke backup (legacy — backups now live exclusively on Google Drive)
    nukeBackup: {
        channels: mongoose.Schema.Types.Mixed,
        roles: mongoose.Schema.Types.Mixed,
        members: mongoose.Schema.Types.Mixed,
        backupDate: Date
    },

    // Old token-based panel (legacy)
    panelToken: String,
    tokenExpiry: Number,

    // 📜 Logging system — empty string = that log type is OFF
    ticketLogChannel: { type: String, default: '' },
    messageLogChannel: { type: String, default: '' },
    memberLogChannel: { type: String, default: '' },
    roleLogChannel: { type: String, default: '' },
    voiceLogChannel: { type: String, default: '' },
    inviteLogChannel: { type: String, default: '' },
    modLogChannel: { type: String, default: '' },
    joinLeaveLogChannel: { type: String, default: '' },
    serverLogChannel: { type: String, default: '' },
    moderatorChatChannel: { type: String, default: '' },

    // 🎮 Game system global toggle
    gamesDisabledGlobal: { type: Boolean, default: false },

    // 🛡️ Automod log channel
    autoModLogChannel: { type: String, default: '' },
});

const driveAuthSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    accessToken: String,
    refreshToken: { type: String, default: 'no_refresh_token' },
    tokenExpiry: Number
});

const dashSessionSchema = new mongoose.Schema({
    sessionId: String,
    discordId: String,
    discordUsername: String,
    discordAvatar: String,
    accessToken: String,
    guilds: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now, expires: 86400 * 30 }
}, { strict: false });

const suggestionReportSchema = new mongoose.Schema({
    reportId: { type: String, unique: true },
    type: { type: String, enum: ['suggestion', 'bug'] },
    userId: String,
    username: String,
    userEmail: String,
    guildId: String,
    guildName: String,
    description: String,
    status: { type: String, default: 'pending' }, // pending | resolved | accepted | rejected
    adminNote: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Models (guarded against re-compilation on multiple require() calls) ───────

const serverBackupSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    guildName: { type: String, default: '' },
    backupDate: { type: Date, default: Date.now },
    channels: { type: Array, default: [] },
    roles: { type: Array, default: [] },
    members: { type: Array, default: [] },
    lastSavedLocation: { type: String, enum: ['cloud', 'drive', 'both'], default: 'cloud' },
    savedBy: { type: String, default: '' }
}, { timestamps: true });

const ServerConfig     = mongoose.models.ServerConfig     || mongoose.model('ServerConfig',     serverConfigSchema);
const DriveAuth        = mongoose.models.DriveAuth        || mongoose.model('DriveAuth',        driveAuthSchema);
const DashSession      = mongoose.models.DashSession      || mongoose.model('DashSession',      dashSessionSchema);
const SuggestionReport = mongoose.models.SuggestionReport || mongoose.model('SuggestionReport', suggestionReportSchema);
const ServerBackup     = mongoose.models.ServerBackup     || mongoose.model('ServerBackup',     serverBackupSchema);

module.exports = { ServerConfig, DriveAuth, DashSession, SuggestionReport, ServerBackup };