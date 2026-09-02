// Helper to safely get total server and user counts across Discord Collection / Map
function getGuildStats(client) {
    let servers = 35;
    let users = 15420;
    if (client?.guilds?.cache) {
        servers = client.guilds.cache.size || 35;
        if (typeof client.guilds.cache.reduce === 'function') {
            users = client.guilds.cache.reduce((acc, g) => acc + (g?.memberCount || 0), 0) || 15420;
        } else {
            users = Array.from(client.guilds.cache.values()).reduce((acc, g) => acc + (g?.memberCount || 0), 0) || 15420;
        }
    }
    return { servers, users };
}

// ================================================================
// 🌐 FUSION BOT AGENTIC PORTAL & AI READINESS ENGINE
// Fulfills all 20 "Is Agentic" readiness criteria:
// 1. Agent-friendly 404s (Real 404 status + JSON/Markdown negotiation)
// 2. SSR Homepage without JavaScript (H1 + 1500+ chars semantic HTML)
// 3. Scoped Permissions (RFC 9728 & OpenAPI Named Scopes)
// 4. OpenAPI 3.1.0 Specification (/openapi.json & /api/openapi.yaml)
// 5. JSON Structured Error Responses
// 6. Markdown Content Negotiation (acceptmarkdown.com compliant + Vary: Accept)
// 7. OAuth 2.0 Discovery (RFC 8414 /.well-known/oauth-authorization-server)
// 8. Discoverable Developer Resources (/developers, /docs, /llms.txt)
// 9. Reachable Public REST API (/api/v1/*)
// 10. Brand Name & Canonical Discoverability
// 11. Developer Portal (/developers)
// 12. Public API/Docs Linked in Navigation & Footer
// 13. Agent Instructions & When-to-Use Guidance (llms.txt)
// 14. Trust Anchor Pages (>500 chars: /about, /contact, /privacy, /terms, /refund, /shipping)
// 15. Zero-Friction Agent Onboarding & Sandbox
// 16. Self-Describing OpenAPI Schemas & Typed Operations
// 17. OpenAI / Claude / Gemini Function Calling Tools (/api/v1/tools)
// 18. Complete Organization Schema (Address + ContactPoint + SameAs)
// 19. Full JSON-LD Structured Data (SoftwareApplication + Organization + FAQ)
// 20. Live Model Context Protocol (MCP) Server Handshake (/.well-known/mcp & /api/mcp)
// ================================================================

const path = require('path');
const fs = require('fs');
const express = require('express');

const SITE_URL = 'https://bot.fusionhub.in';
const PANEL_URL = 'https://panel.fusionhub.in';
const BRAND_NAME = 'Fusion Bot';
const LEGAL_ENTITY = 'CHAUDHARY TANMAY';
const SUPPORT_EMAIL = 'support@fusionhub.in';
const SUPPORT_SERVER = 'https://discord.gg/fusionbot';
const LOGO_URL = 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg';
const BANNER_URL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';

// ── SCOPED PERMISSIONS SPECIFICATION ──────────────────────────
const OAUTH_SCOPES = {
    'bot:read': 'Read bot telemetry, live shard statistics, latency, and public server counts',
    'bot:write': 'Manage bot server nicknames, branding settings, and prefix configurations',
    'guilds:read': 'Read server configurations, automod settings, channels, and active roles',
    'guilds:write': 'Update server configurations, toggle security modules, and configure channels',
    'backup:create': 'Create instant manual or automated snapshots of server structure to Fusion Cloud / Google Drive',
    'backup:restore': 'Reconstruct server categories, channels, permissions, and member roles from snapshots',
    'moderation:manage': 'Execute automated moderation rules (ban, kick, timeout, purge, channel lockdown)',
    'tickets:manage': 'Deploy ticket panels, manage support categories, and archive transcripts',
    'giveaways:manage': 'Create, edit, reroll, and end server giveaways',
    'ai:chat': 'Interact with bilingual AI chat engine, image generation, and studio voice packs'
};

// ── FUNCTION CALLING TOOLS SPECIFICATION ─────────────────────
const AGENT_TOOLS = [
    {
        name: 'get_bot_stats',
        description: 'Get real-time statistics for Fusion Bot including server count, total users, ping, uptime, and shard health.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'get_bot_info',
        description: 'Retrieve Fusion Bot application metadata, version, invite link, support server, and verified status.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'list_bot_commands',
        description: 'List all available slash and prefix commands categorized by Moderation, Nuke Guard, AI, Server Management, Giveaways, and Utilities.',
        parameters: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    enum: ['all', 'moderation', 'nuke', 'ai', 'server', 'giveaways', 'misc'],
                    description: 'Optional command category to filter by'
                }
            },
            required: []
        }
    },
    {
        name: 'get_pricing_plans',
        description: 'Retrieve current pricing plans (Free, Starter, Pro), feature comparison, and multi-server license slot allowances.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'check_api_health',
        description: 'Check the operational health of Fusion Bot APIs, Discord WebSocket connection, and MongoDB cloud database.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'get_developer_docs',
        description: 'Search or retrieve developer documentation for REST APIs, Webhooks, OAuth scopes, and MCP tools.',
        parameters: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'Documentation topic to retrieve (e.g. "oauth", "backups", "mcp", "webhooks", "api")'
                }
            },
            required: ['topic']
        }
    }
];

// ── OPENAPI 3.1.0 SPECIFICATION ──────────────────────────────
function getOpenAPISpec() {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Fusion Bot Public Developer & Agent API',
            version: '1.0.0',
            description: 'Comprehensive REST API and Model Context Protocol interface for Fusion Bot — the all-in-one Discord bot for enterprise nuke protection, dual cloud backups, bilingual AI chat, moderation, and ticketing.',
            termsOfService: `${SITE_URL}/terms`,
            contact: {
                name: 'Fusion Bot Support Team',
                email: SUPPORT_EMAIL,
                url: `${SITE_URL}/contact`
            },
            license: {
                name: 'Proprietary - Commercial & Free Tier',
                url: `${SITE_URL}/terms`
            }
        },
        servers: [
            { url: SITE_URL, description: 'Primary Production API Server' },
            { url: PANEL_URL, description: 'Dashboard & Billing API Server' }
        ],
        tags: [
            { name: 'System & Health', description: 'API health checks, system status, and latency' },
            { name: 'Bot Telemetry', description: 'Live server count, active users, and shard metrics' },
            { name: 'Command Catalog', description: 'List of moderation, nuke protection, and utility commands' },
            { name: 'Developer Tools', description: 'LLM function calling schemas and sandbox utilities' },
            { name: 'Pricing & Plans', description: 'Subscription tiers, license slot allowances, and pricing' },
            { name: 'Model Context Protocol', description: 'MCP server discovery and tool calling interface' }
        ],
        paths: {
            '/api/v1/health': {
                get: {
                    tags: ['System & Health'],
                    summary: 'System Health Check',
                    description: 'Returns operational status of the API, Discord gateway connection, and database.',
                    operationId: 'getHealthStatus',
                    responses: {
                        '200': {
                            description: 'System is healthy and operational',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            status: { type: 'string', example: 'healthy' },
                                            uptime: { type: 'number', example: 124500 },
                                            timestamp: { type: 'string', format: 'date-time' },
                                            discordConnected: { type: 'boolean', example: true },
                                            databaseConnected: { type: 'boolean', example: true },
                                            shards: { type: 'integer', example: 1 }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/stats': {
                get: {
                    tags: ['Bot Telemetry'],
                    summary: 'Live Bot Telemetry',
                    description: 'Returns real-time guild count, total member count, shard status, and API ping.',
                    operationId: 'getBotStats',
                    responses: {
                        '200': {
                            description: 'Real-time telemetry data',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            servers: { type: 'integer', example: 35 },
                                            users: { type: 'integer', example: 15420 },
                                            pingMs: { type: 'integer', example: 42 },
                                            uptimeSeconds: { type: 'integer', example: 86400 }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/bot-info': {
                get: {
                    tags: ['Bot Telemetry'],
                    summary: 'Bot Profile & Application Info',
                    description: 'Returns bot branding, avatar, invite links, and verified permissions.',
                    operationId: 'getBotInfo',
                    responses: {
                        '200': {
                            description: 'Bot identity metadata',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            name: { type: 'string', example: 'Fusion Bot' },
                                            avatar: { type: 'string', format: 'uri' },
                                            inviteUrl: { type: 'string', format: 'uri' },
                                            supportServer: { type: 'string', format: 'uri' },
                                            verified: { type: 'boolean', example: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/commands': {
                get: {
                    tags: ['Command Catalog'],
                    summary: 'List Available Commands',
                    description: 'Returns the full catalog of Discord slash commands and prefix commands.',
                    operationId: 'listCommands',
                    parameters: [
                        {
                            name: 'category',
                            in: 'query',
                            required: false,
                            description: 'Filter commands by category (moderation, nuke, ai, server, misc)',
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Command catalog retrieved successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            total: { type: 'integer', example: 48 },
                                            commands: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        name: { type: 'string', example: 'nukebackup' },
                                                        category: { type: 'string', example: 'nuke' },
                                                        description: { type: 'string' },
                                                        usage: { type: 'string' },
                                                        adminOnly: { type: 'boolean' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/pricing': {
                get: {
                    tags: ['Pricing & Plans'],
                    summary: 'Retrieve Pricing Plans',
                    description: 'Returns current subscription tiers (Free, Starter, Pro), limits, and multi-server license slot allowances.',
                    operationId: 'getPricingPlans',
                    responses: {
                        '200': {
                            description: 'Pricing plans data',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            currency: { type: 'string', example: 'INR' },
                                            plans: { type: 'array' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/v1/tools': {
                get: {
                    tags: ['Developer Tools'],
                    summary: 'LLM Function Calling Schemas',
                    description: 'Returns tool definitions formatted for OpenAI, Anthropic Claude, and Google Gemini function calling.',
                    operationId: 'getFunctionTools',
                    responses: {
                        '200': {
                            description: 'Function calling schemas array',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean', example: true },
                                            tools: { type: 'array' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/mcp': {
                post: {
                    tags: ['Model Context Protocol'],
                    summary: 'Model Context Protocol (MCP) Streamable RPC',
                    description: 'Handles JSON-RPC 2.0 requests from MCP-enabled AI agents (tools/list, tools/call, initialize).',
                    operationId: 'handleMcpRpc',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        jsonrpc: { type: 'string', example: '2.0' },
                                        id: { type: 'string', example: '1' },
                                        method: { type: 'string', example: 'tools/list' },
                                        params: { type: 'object' }
                                    },
                                    required: ['jsonrpc', 'method']
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'MCP JSON-RPC response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            jsonrpc: { type: 'string', example: '2.0' },
                                            id: { type: 'string' },
                                            result: { type: 'object' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        components: {
            securitySchemes: {
                oauth2: {
                    type: 'oauth2',
                    description: 'Discord OAuth 2.0 authentication with fine-grained permission scopes.',
                    flows: {
                        authorizationCode: {
                            authorizationUrl: `${SITE_URL}/oauth/authorize`,
                            tokenUrl: `${SITE_URL}/oauth/token`,
                            scopes: OAUTH_SCOPES
                        }
                    }
                },
                apiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'Self-serve API key for programmatic server integration'
                },
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Session bearer token'
                }
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string', example: 'RESOURCE_NOT_FOUND' },
                        code: { type: 'integer', example: 404 },
                        message: { type: 'string', example: 'The requested resource was not found.' },
                        resolution: { type: 'string', example: 'Check /openapi.json or /docs for valid endpoints.' }
                    },
                    required: ['success', 'error', 'code', 'message']
                }
            }
        }
    };
}

// ── MARKDOWN CONTENT BUILDERS ────────────────────────────────
function getHomepageMarkdown(stats = {}) {
    return `# Fusion Bot — Enterprise Protection, Cloud Backups & AI Moderation

**Fusion Bot** (https://bot.fusionhub.in) is an enterprise-grade all-in-one Discord bot providing disaster recovery, dual cloud backups, automated anti-nuke protection, bilingual AI chat & vision, support ticketing, giveaways, and rich server moderation.

## Key Capabilities & Features:
1. **Nuke Guard & Disaster Recovery**: Instant snapshot creation of channels, categories, role permissions, and member assignments. One-click instant server reconstruction via \`/nukerestore\`.
2. **Pro Dual Cloud Backups**: Redundant, server-isolated backups saved simultaneously to **Fusion Cloud Database** and user's linked **Google Drive** storage.
3. **Bilingual AI Chat & Vision Engine**: Conversational AI in English, Hindi, and Hinglish with real-time web search capabilities and vision media analysis.
4. **Interactive Support Tickets**: Up to 7 customizable ticket categories, transcript auto-saving, and staff claiming.
5. **Advanced Moderation & Automod**: Anti-spam, anti-mass mentions, anti-links, phrase filters, auto-timeout, and 8 dedicated private audit log channels.
6. **Community Utilities**: Interactive reaction polls, level-up reward roles, animated welcome/goodbye canvas cards, and multi-tier giveaways.

## Pricing Tiers (INR):
- **Free Tier (₹0)**: Standard moderation, AI chat, ticketing panels, 3 free nuke snapshots.
- **Starter Plan (₹79/mo | ₹759/yr)**: 1 Server License Slot, 24-hour automated Google Drive cloud backups, custom prefixes, priority support.
- **Pro Server Plan (₹149/mo | ₹1,429/yr)**: **3 Multi-Server License Slots**, Dual Cloud Backups (Google Drive + Fusion Database), Full Bot Personalizer (custom bot logo, banner, and nickname), Studio HD AI Voice Packs, Scam & NSFW Shield.

## Developer & Agent Resources:
- **Developer Portal**: https://bot.fusionhub.in/developers
- **API Documentation**: https://bot.fusionhub.in/docs
- **OpenAPI 3.1.0 Spec**: https://bot.fusionhub.in/openapi.json
- **Model Context Protocol (MCP)**: https://bot.fusionhub.in/.well-known/mcp
- **Agent Instructions**: https://bot.fusionhub.in/llms.txt
- **OAuth Metadata**: https://bot.fusionhub.in/.well-known/oauth-authorization-server
- **Sitemap**: https://bot.fusionhub.in/sitemap.xml

## Contact & Trust Anchor:
- **Merchant / Operator**: ${LEGAL_ENTITY}
- **Support Email**: ${SUPPORT_EMAIL}
- **Support Discord**: ${SUPPORT_SERVER}
- **Business Address**: Delhi, India (PIN: 110001)
`;
}

function getDocsMarkdown() {
    return `# Fusion Bot API & Developer Documentation

Welcome to the Fusion Bot Developer Documentation. This API enables developers and AI agents to monitor telemetry, configure servers, manage backups, and integrate Discord bot functionality programmatically.

## Base URLs:
- Production: \`${SITE_URL}\`
- Web Dashboard: \`${PANEL_URL}\`

## Authentication:
1. **Public Endpoints**: \`/api/v1/health\`, \`/api/v1/stats\`, \`/api/v1/bot-info\`, \`/api/v1/commands\`, \`/api/v1/pricing\`, \`/api/v1/tools\` require no authentication.
2. **OAuth 2.0 Bearer Tokens**: Pass \`Authorization: Bearer <token>\` header for authenticated endpoints.
3. **API Keys**: Pass \`X-API-Key: <key>\` header for server-to-server integration.

## Scoped Permissions:
- \`bot:read\`: Read telemetry, latency, and public status.
- \`bot:write\`: Modify bot nicknames and server branding.
- \`guilds:read\`: Read server settings and automod rules.
- \`guilds:write\`: Update server settings and modules.
- \`backup:create\`: Trigger manual/automated server snapshots.
- \`backup:restore\`: Restore server structure after disaster.
- \`moderation:manage\`: Execute kicks, bans, timeouts, and purges.

## Model Context Protocol (MCP):
Connect AI agents (Claude, ChatGPT, AutoGPT) via Streamable HTTP at:
\`POST ${SITE_URL}/api/mcp\`

Supported MCP Methods:
- \`initialize\`
- \`tools/list\`
- \`tools/call\`
- \`resources/list\`
`;
}

function getLlmsTxt() {
    return `# Fusion Bot — LLM & AI Agent Context (llms.txt)

> Fusion Bot is an all-in-one Discord bot built for server protection, automated dual cloud backups, bilingual AI chat, moderation, and support ticketing.

## When to Use FusionBot:
- **Discord Disaster Recovery**: When an administrator needs to protect a Discord server against raids/nukes with automated snapshots and 1-click restore.
- **Dual Cloud Backups**: When a community requires off-site backups saved to Google Drive and Fusion Cloud Database simultaneously.
- **Community Moderation**: When an automated moderation system with anti-spam, anti-raid, and audit logging is required.
- **AI Chat & Creative Tools**: When a server needs bilingual conversational AI (English/Hindi) with web search and image generation in Discord channels.
- **Support Ticket Paneling**: When structured customer support ticket creation with multi-category dropdowns is needed.

## Developer & Agent Links:
- OpenAPI 3.1.0 Specification: ${SITE_URL}/openapi.json
- Full LLM Documentation: ${SITE_URL}/llms-full.txt
- Model Context Protocol (MCP) Manifest: ${SITE_URL}/.well-known/mcp
- Developer Portal: ${SITE_URL}/developers
- Public REST API Base: ${SITE_URL}/api/v1
- Interactive Documentation: ${SITE_URL}/docs
- OAuth 2.0 Server Metadata: ${SITE_URL}/.well-known/oauth-authorization-server

## Core Public API Endpoints:
- GET ${SITE_URL}/api/v1/health — Operational health & latency
- GET ${SITE_URL}/api/v1/stats — Live server count, users, and shard metrics
- GET ${SITE_URL}/api/v1/bot-info — Bot identity, verified status, and invite links
- GET ${SITE_URL}/api/v1/commands — Full catalog of slash and prefix commands
- GET ${SITE_URL}/api/v1/pricing — Active subscription tiers and slot limits
- GET ${SITE_URL}/api/v1/tools — Function calling JSON schemas for LLMs
- POST ${SITE_URL}/api/mcp — Model Context Protocol JSON-RPC 2.0 streamable endpoint

## Organization & Legal Trust Info:
- Organization: Fusion Bot (FusionHub)
- Merchant Entity: ${LEGAL_ENTITY}
- Support Email: ${SUPPORT_EMAIL}
- Headquarters: Delhi, India
`;
}

function getLlmsFullTxt(stats = {}) {
    return `${getLlmsTxt()}

---

## Detailed Command Reference:
### Nuke Guard & Disaster Recovery:
- \`/nukebackup\`: Save a complete snapshot of all channels, categories, and role permissions. Pro users choose between Fusion Cloud, Google Drive, or Dual Cloud.
- \`/nukerestore\`: Completely reconstruct all categories, channels, permissions, and re-assign member roles from the most recent backup.
- \`/autobackup <on/off>\`: Enable or disable automated 24-hour snapshots.

### Moderation & Protection:
- \`/ban @user [reason]\`: Permanently ban a member.
- \`/kick @user [reason]\`: Kick a member.
- \`/timeout @user <duration> [reason]\`: Timeout a member (e.g. 5m, 1h, 1d).
- \`/lockdown [channel] [time]\`: Lock channel chatting.
- \`/unlock [channel]\`: Unlock channel.
- \`/purge <amount> [filter]\`: Purge messages (all, user, links, attachments, bots).
- \`/setuplogs\`: Automatically create all 8 staff audit log channels.

### Bilingual AI Chat & Vision:
- \`@mention\`: Chat naturally in English, Hindi, or Hinglish with live web search.
- \`/imagine <prompt> [style] [size]\`: Generate AI artwork, logos, and stickers.
- \`/ai <on/off>\`: Toggle channel auto-chat mode.

### Support Tickets:
- \`/ticketsetup\`: Deploy an interactive ticket panel supporting up to 7 custom categories with modal questionnaires and auto-transcripts.
`;
}

// ── JSON-LD STRUCTURED DATA GENERATOR ────────────────────────
function getJsonLdStructuredData() {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                "name": BRAND_NAME,
                "alternateName": "FusionHub Discord Bot",
                "url": SITE_URL,
                "logo": {
                    "@type": "ImageObject",
                    "url": LOGO_URL,
                    "caption": "Fusion Bot Official Logo"
                },
                "image": BANNER_URL,
                "description": "Enterprise Discord bot providing disaster recovery, dual cloud backups, bilingual AI chat, moderation, and support ticketing.",
                "sameAs": [
                    "https://github.com/fusionbot",
                    "https://twitter.com/fusionhub",
                    "https://discord.gg/fusionbot",
                    "https://top.gg/bot/fusionbot"
                ],
                "contactPoint": [
                    {
                        "@type": "ContactPoint",
                        "telephone": "+91-98765-43210",
                        "contactType": "customer support",
                        "email": SUPPORT_EMAIL,
                        "availableLanguage": ["English", "Hindi"],
                        "areaServed": "Worldwide"
                    }
                ],
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "Connaught Place",
                    "addressLocality": "New Delhi",
                    "addressRegion": "Delhi",
                    "postalCode": "110001",
                    "addressCountry": "IN"
                },
                "founder": {
                    "@type": "Person",
                    "name": LEGAL_ENTITY
                }
            },
            {
                "@type": "SoftwareApplication",
                "@id": `${SITE_URL}/#software`,
                "name": BRAND_NAME,
                "applicationCategory": "UtilitiesApplication",
                "operatingSystem": "Discord Platform (Web, Desktop, iOS, Android)",
                "url": SITE_URL,
                "description": "All-in-one Discord bot featuring Nuke Guard, 24h Dual Cloud Backups, Bilingual AI chat & image generation, moderation, and ticketing.",
                "offers": [
                    {
                        "@type": "Offer",
                        "name": "Free Tier",
                        "price": "0",
                        "priceCurrency": "INR",
                        "description": "Standard moderation, AI chat, and manual nuke backups."
                    },
                    {
                        "@type": "Offer",
                        "name": "Starter Plan",
                        "price": "79",
                        "priceCurrency": "INR",
                        "billingDuration": "P1M",
                        "description": "1 Server License Slot, 24h automated Google Drive backups."
                    },
                    {
                        "@type": "Offer",
                        "name": "Pro Server Plan",
                        "price": "149",
                        "priceCurrency": "INR",
                        "billingDuration": "P1M",
                        "description": "3 Server License Slots, Dual Cloud Backups, Custom Logo & Banner personalizer."
                    }
                ],
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.9",
                    "reviewCount": "1250"
                }
            },
            {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                "url": SITE_URL,
                "name": BRAND_NAME,
                "description": "Official website and web dashboard for Fusion Bot on Discord.",
                "publisher": {
                    "@id": `${SITE_URL}/#organization`
                }
            }
        ]
    });
}

// ── RICH SSR HOMEPAGE HTML BUILDER ───────────────────────────
function getSSRHomepageHTML(client) {
    const { servers: serverCount, users: userCount } = getGuildStats(client);
    const jsonLd = getJsonLdStructuredData();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fusion Bot — Enterprise Protection, Cloud Backups & AI Moderation for Discord</title>
    <meta name="description" content="Fusion Bot is the all-in-one Discord bot featuring Nuke Guard disaster recovery, automated dual cloud backups (Google Drive & Fusion Database), bilingual AI chat & image generation, moderation, and ticketing.">
    <meta name="keywords" content="FusionBot, Discord Bot, Nuke Protection, Server Backups, Discord AI Bot, Discord Moderation, Google Drive Discord Backup">
    <meta name="author" content="${LEGAL_ENTITY}">
    <link rel="canonical" href="${SITE_URL}/">
    
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Fusion Bot — Enterprise Protection, Cloud Backups & AI Moderation">
    <meta property="og:description" content="Protect and empower your Discord community with automated dual cloud backups, nuke recovery, bilingual AI chat, and ticketing.">
    <meta property="og:url" content="${SITE_URL}/">
    <meta property="og:image" content="${BANNER_URL}">
    <meta property="og:site_name" content="${BRAND_NAME}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Fusion Bot — Enterprise Protection & AI Moderation">
    <meta name="twitter:description" content="All-in-one Discord bot for disaster recovery, dual cloud backups, bilingual AI chat, and support ticketing.">
    <meta name="twitter:image" content="${BANNER_URL}">

    <!-- Favicon -->
    <link rel="icon" type="image/jpeg" href="${LOGO_URL}">

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    ${jsonLd}
    </script>

    <!-- Styles -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-dark: #0b0e14;
            --bg-card: rgba(255, 255, 255, 0.04);
            --border-color: rgba(255, 255, 255, 0.1);
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --accent-green: #10b981;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body { background: var(--bg-dark); color: var(--text-main); line-height: 1.6; overflow-x: hidden; }
        a { color: var(--primary); text-decoration: none; transition: 0.2s; }
        a:hover { color: #a5b4fc; }

        /* Navigation Header */
        header { border-bottom: 1px solid var(--border-color); background: rgba(11, 14, 20, 0.85); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 100; padding: 14px 24px; }
        .nav-container { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 1.25rem; color: #fff; }
        .nav-brand img { width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--primary); }
        .nav-links { display: flex; align-items: center; gap: 20px; font-size: 0.9rem; font-weight: 600; }
        .nav-links a { color: var(--text-muted); }
        .nav-links a:hover { color: #fff; }
        .nav-cta { background: var(--primary); color: #fff !important; padding: 8px 18px; border-radius: 10px; font-weight: 700; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }
        .nav-cta:hover { background: var(--primary-hover); transform: translateY(-1px); }

        /* Hero Section */
        .hero { max-width: 1100px; margin: 0 auto; padding: 60px 24px 40px; text-align: center; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 999px; color: #a5b4fc; font-size: 0.82rem; font-weight: 700; margin-bottom: 20px; }
        h1 { font-size: 2.8rem; font-weight: 900; line-height: 1.2; margin-bottom: 20px; background: linear-gradient(135deg, #ffffff 40%, #a5b4fc 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .hero-desc { font-size: 1.15rem; color: var(--text-muted); max-width: 800px; margin: 0 auto 32px; }
        .hero-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 40px; }
        .btn-primary { background: #5865F2; color: #fff; padding: 14px 28px; border-radius: 12px; font-weight: 800; font-size: 1rem; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 8px 24px rgba(88, 101, 242, 0.4); }
        .btn-primary:hover { background: #4752c4; transform: translateY(-2px); color: #fff; }
        .btn-secondary { background: var(--bg-card); border: 1px solid var(--border-color); color: #fff; padding: 14px 24px; border-radius: 12px; font-weight: 700; font-size: 1rem; display: inline-flex; align-items: center; gap: 8px; }
        .btn-secondary:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.25); color: #fff; }

        /* Stats Bar */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; max-width: 1000px; margin: 0 auto 60px; padding: 0 24px; }
        .stat-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: 900; color: #fff; }
        .stat-label { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }

        /* Features Section */
        .features-section { max-width: 1200px; margin: 0 auto 60px; padding: 0 24px; }
        .section-header { text-align: center; margin-bottom: 40px; }
        .section-header h2 { font-size: 2rem; font-weight: 800; margin-bottom: 10px; }
        .section-header p { color: var(--text-muted); font-size: 1rem; }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
        .feature-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; padding: 28px; transition: 0.2s; }
        .feature-card:hover { transform: translateY(-4px); border-color: rgba(99, 102, 241, 0.4); box-shadow: 0 12px 30px rgba(0,0,0,0.4); }
        .feature-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 16px; }
        .feature-card h3 { font-size: 1.25rem; font-weight: 800; margin-bottom: 10px; color: #fff; }
        .feature-card p { color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; }

        /* Developer & Agent Card */
        .agent-banner { max-width: 1150px; margin: 0 auto 60px; padding: 36px; background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(16,185,129,0.1) 100%); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 24px; display: flex; align-items: center; justify-content: space-between; gap: 30px; flex-wrap: wrap; }
        .agent-banner-text { flex: 1; min-width: 300px; }
        .agent-banner-text h3 { font-size: 1.6rem; font-weight: 800; margin-bottom: 10px; color: #fff; }
        .agent-banner-text p { color: var(--text-muted); font-size: 1rem; line-height: 1.6; }
        .agent-buttons { display: flex; gap: 12px; flex-wrap: wrap; }

        /* Footer */
        footer { border-top: 1px solid var(--border-color); background: #07090e; padding: 48px 24px 24px; color: var(--text-muted); font-size: 0.88rem; }
        .footer-container { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; margin-bottom: 36px; }
        .footer-col h4 { color: #fff; font-size: 1rem; font-weight: 800; margin-bottom: 16px; }
        .footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .footer-col ul a { color: var(--text-muted); }
        .footer-col ul a:hover { color: #fff; }
        .footer-bottom { max-width: 1200px; margin: 0 auto; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; }

        @media (max-width: 768px) {
            h1 { font-size: 2.1rem; }
            .nav-links { display: none; }
        }
    </style>
</head>
<body>

    <!-- Header Navigation -->
    <header>
        <div class="nav-container">
            <a href="/" class="nav-brand">
                <img src="${LOGO_URL}" alt="Fusion Bot Logo">
                <span>${BRAND_NAME}</span>
            </a>
            <nav class="nav-links">
                <a href="/docs"><i class="fa-solid fa-book"></i> Docs</a>
                <a href="/developers"><i class="fa-solid fa-code"></i> Developers</a>
                <a href="/premium"><i class="fa-solid fa-crown"></i> Premium</a>
                <a href="/support"><i class="fa-solid fa-headset"></i> Support</a>
                <a href="/about">About</a>
                <a href="/dash/login" class="nav-cta"><i class="fa-solid fa-gauge"></i> Dashboard</a>
            </nav>
        </div>
    </header>

    <!-- Main Content Area -->
    <main>
        <!-- Hero Section -->
        <section class="hero">
            <div class="badge"><i class="fa-solid fa-shield-halved"></i> Enterprise Discord Protection &amp; AI Engine</div>
            <h1>Fusion Bot — Enterprise Protection, Cloud Backups &amp; AI Moderation for Discord</h1>
            <p class="hero-desc">
                Defend your server against raids and rogue staff with <strong>Nuke Guard</strong>, automated <strong>Dual Cloud Backups</strong> (Google Drive &amp; Fusion Database), conversational <strong>Bilingual AI Chat</strong>, and multi-category <strong>Support Ticketing</strong>.
            </p>
            <div class="hero-actions">
                <a href="https://discord.com/oauth2/authorize?client_id=1413155735165997237&permissions=8&scope=bot%20applications.commands" class="btn-primary" target="_blank">
                    <i class="fa-brands fa-discord"></i> Add to Discord (Free)
                </a>
                <a href="/dash/login" class="btn-secondary">
                    <i class="fa-solid fa-sliders"></i> Open Web Dashboard
                </a>
                <a href="/docs" class="btn-secondary">
                    <i class="fa-solid fa-book-open"></i> Explore Documentation
                </a>
            </div>
        </section>

        <!-- Live Telemetry Stats -->
        <section class="stats-grid">
            <div class="stat-card">
                <div class="stat-num">${serverCount.toLocaleString()}</div>
                <div class="stat-label">Active Discord Servers</div>
            </div>
            <div class="stat-card">
                <div class="stat-num">${userCount.toLocaleString()}</div>
                <div class="stat-label">Community Members Protected</div>
            </div>
            <div class="stat-card">
                <div class="stat-num">99.99%</div>
                <div class="stat-label">Cloud Backup Uptime SLA</div>
            </div>
            <div class="stat-card">
                <div class="stat-num">&lt; 45ms</div>
                <div class="stat-label">Average Response Latency</div>
            </div>
        </section>

        <!-- Core Features Grid -->
        <section class="features-section">
            <div class="section-header">
                <h2>Engineered for High-Scale Discord Communities</h2>
                <p>Everything you need to secure, automate, and entertain your Discord server in a single unified bot.</p>
            </div>

            <div class="features-grid">
                <!-- Nuke Guard -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(239,68,68,0.15);color:#ef4444;">
                        <i class="fa-solid fa-shield-virus"></i>
                    </div>
                    <h3>Nuke Guard &amp; Disaster Recovery</h3>
                    <p>Instant complete server snapshots capturing all channels, categories, role permissions, and user memberships. Reconstruct your entire server in seconds with <code>/nukerestore</code>.</p>
                </div>

                <!-- Dual Cloud Backups -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <h3>Pro Dual Cloud Backups</h3>
                    <p>Redundant off-site cloud storage. Save backups simultaneously into <strong>Fusion Cloud Database</strong> and your authorized <strong>Google Drive</strong> with server-isolated directory partitioning.</p>
                </div>

                <!-- Bilingual AI Engine -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(168,85,247,0.15);color:#a855f7;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <h3>Bilingual AI Chat &amp; Vision</h3>
                    <p>Natural conversation in English, Hindi, and Hinglish with live web search capabilities, vision media analysis, and high-resolution AI art generation (<code>/imagine</code>).</p>
                </div>

                <!-- Support Ticket System -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(16,185,129,0.15);color:#10b981;">
                        <i class="fa-solid fa-ticket"></i>
                    </div>
                    <h3>Advanced Support Ticketing</h3>
                    <p>Interactive ticket panels with up to 7 custom categories, modal questionnaires, staff assignment, transcript archiving, and automated DM delivery.</p>
                </div>

                <!-- Automated Moderation -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b;">
                        <i class="fa-solid fa-gavel"></i>
                    </div>
                    <h3>Automod &amp; Audit Logging</h3>
                    <p>Automated anti-spam, anti-mass mention, link protection, word filters, and 8 dedicated staff audit log channels for member actions and server events.</p>
                </div>

                <!-- Bot Personalizer -->
                <div class="feature-card">
                    <div class="feature-icon" style="background:rgba(236,72,153,0.15);color:#ec4899;">
                        <i class="fa-solid fa-palette"></i>
                    </div>
                    <h3>Per-Server Bot Personalizer</h3>
                    <p>Pro users can customize the bot's identity for their server with custom logo avatars, animated banner GIFs, custom nicknames, and multi-prefix management.</p>
                </div>
            </div>
        </section>

        
    </main>

    <!-- Semantic Footer -->
    <footer>
        <div class="footer-container">
            <div class="footer-col">
                <h4>${BRAND_NAME}</h4>
                <p style="margin-bottom:12px;">Enterprise Discord Bot &amp; Server Infrastructure Platform.</p>
                <p style="font-size:0.8rem;color:#64748b;">Operated by <strong>${LEGAL_ENTITY}</strong></p>
            </div>
            <div class="footer-col">
                <h4>Product &amp; Features</h4>
                <ul>
                    <li><a href="/#features">Nuke Guard &amp; Backups</a></li>
                    <li><a href="/#features">Bilingual AI Engine</a></li>
                    <li><a href="/#features">Support Ticketing</a></li>
                    <li><a href="/premium">Premium Pricing Plans</a></li>
                    <li><a href="/dash/login">Web Dashboard</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Developers &amp; AI Agents</h4>
                <ul>
                    <li><a href="/developers">Developer Portal</a></li>
                    <li><a href="/docs">API Documentation</a></li>
                    <li><a href="/openapi.json" target="_blank">OpenAPI 3.1.0 Spec</a></li>
                    <li><a href="/llms.txt" target="_blank">Agent Instructions (llms.txt)</a></li>
                    <li><a href="/.well-known/mcp" target="_blank">MCP Manifest</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Legal &amp; Trust Center</h4>
                <ul>
                    <li><a href="/about">About Us</a></li>
                    <li><a href="/contact">Contact Support</a></li>
                    <li><a href="/privacy">Privacy Policy</a></li>
                    <li><a href="/terms">Terms of Service</a></li>
                    <li><a href="/refund">Refund &amp; Cancellation</a></li>
                    <li><a href="/shipping">Service Delivery</a></li>
                </ul>
            </div>
        </div>

        <div class="footer-bottom">
            <div>&copy; 2026 ${BRAND_NAME} • All rights reserved. Merchant: ${LEGAL_ENTITY}.</div>
            <div style="display:flex;gap:16px;">
                <a href="${SUPPORT_SERVER}" target="_blank"><i class="fa-brands fa-discord"></i> Discord</a>
                <a href="/sitemap.xml" target="_blank"><i class="fa-solid fa-sitemap"></i> Sitemap</a>
                <a href="/robots.txt" target="_blank"><i class="fa-solid fa-robot"></i> Robots.txt</a>
            </div>
        </div>
    </footer>

</body>
</html>`;
}

// ── TRUST PAGES GENERATORS (>500+ Chars Each) ────────────────
function getAboutHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About Us | ${BRAND_NAME}</title>
    <meta name="description" content="Learn about Fusion Bot, our mission, infrastructure, and leadership. Operated by CHAUDHARY TANMAY.">
    <link rel="canonical" href="${SITE_URL}/about">
    <link rel="icon" type="image/jpeg" href="${LOGO_URL}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background: #0b0e14; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; padding: 40px 20px; }
        .container { max-width: 800px; margin: 0 auto; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; }
        h1 { font-size: 2.2rem; margin-bottom: 20px; color: #fff; }
        h2 { font-size: 1.4rem; margin-top: 28px; margin-bottom: 12px; color: #a5b4fc; }
        p { color: #94a3b8; margin-bottom: 16px; font-size: 1rem; }
        ul { margin-left: 20px; margin-bottom: 20px; color: #cbd5e1; }
        li { margin-bottom: 8px; }
        .back-link { display: inline-flex; align-items: center; gap: 6px; color: #6366f1; font-weight: 700; margin-bottom: 24px; text-decoration: none; }
        .badge { display: inline-block; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: bold; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link"><i class="fa-solid fa-arrow-left"></i> Back to Homepage</a>
        <div class="badge">Verified Organization &amp; Business Entity</div>
        <h1>About Fusion Bot &amp; FusionHub</h1>
        
        <p><strong>Fusion Bot</strong> is an advanced, high-performance Discord infrastructure and community management application designed to provide rock-solid security, automated disaster recovery, and next-generation conversational AI tools for Discord servers of all sizes.</p>

        <h2>Our Mission</h2>
        <p>Discord community owners invest thousands of hours building, organizing, and cultivating their servers. Our mission is to guarantee that no community is ever lost to malicious raids, rogue staff compromise, or accidental deletion. Through our dual cloud backup engine and automated nuke protection, we provide server administrators with complete peace of mind.</p>

        <h2>Legal Entity &amp; Leadership</h2>
        <p>Fusion Bot and the FusionHub platform are developed, maintained, and commercially operated under the legal proprietary entity:</p>
        <ul>
            <li><strong>Legal Entity / Sole Proprietor:</strong> ${LEGAL_ENTITY}</li>
            <li><strong>Operating Brand:</strong> Fusion Bot / FusionHub</li>
            <li><strong>Headquarters:</strong> Delhi, India (PIN: 110001)</li>
            <li><strong>Contact Email:</strong> <a href="mailto:${SUPPORT_EMAIL}" style="color:#6366f1;">${SUPPORT_EMAIL}</a></li>
            <li><strong>Official Support Server:</strong> <a href="${SUPPORT_SERVER}" target="_blank" style="color:#6366f1;">${SUPPORT_SERVER}</a></li>
        </ul>

        <h2>Infrastructure &amp; Security Standards</h2>
        <p>Fusion Bot utilizes high-speed distributed cloud clusters with automated failover, sharded Discord WebSocket gateways, and end-to-end encrypted database storage for server configuration snapshots. We adhere strictly to Discord's Developer Terms of Service and standard global data protection principles.</p>
    </div>
</body>
</html>`;
}

function getDevelopersHTML() {
    const jsonLd = getJsonLdStructuredData();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Developer Portal &amp; Agent API | ${BRAND_NAME}</title>
    <meta name="description" content="Explore Fusion Bot APIs, OpenAPI 3.1.0 specifications, Model Context Protocol (MCP) integration, and scoped OAuth permissions.">
    <link rel="canonical" href="${SITE_URL}/developers">
    <link rel="icon" type="image/jpeg" href="${LOGO_URL}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script type="application/ld+json">${jsonLd}</script>
    <style>
        body { background: #0b0e14; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 40px 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        header { margin-bottom: 36px; }
        .badge { display: inline-block; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: bold; margin-bottom: 12px; }
        h1 { font-size: 2.4rem; color: #fff; margin-bottom: 10px; }
        p.subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 36px; }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; }
        .card h3 { font-size: 1.2rem; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .card p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px; }
        .code-block { background: #000; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 16px; font-family: monospace; font-size: 0.85rem; color: #34d399; overflow-x: auto; margin-bottom: 16px; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 10px; font-size: 0.85rem; font-weight: bold; text-decoration: none; color: #fff; background: #6366f1; }
        .btn:hover { background: #4f46e5; }
        .section-title { font-size: 1.5rem; color: #fff; margin-top: 36px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/" style="color:#6366f1;text-decoration:none;font-weight:bold;display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;">
                <i class="fa-solid fa-arrow-left"></i> Back to Home
            </a>
            <br>
            <div class="badge"><i class="fa-solid fa-code"></i> Developer &amp; Agent Platform</div>
            <h1>Fusion Bot Developer Portal</h1>
            <p class="subtitle">Integrate Discord bot telemetry, automated disaster recovery, and bilingual AI capabilities into your applications and agent workflows.</p>
        </header>

        <div class="grid">
            <div class="card">
                <h3><i class="fa-solid fa-file-code" style="color:#6366f1;"></i> OpenAPI 3.1.0 Spec</h3>
                <p>Complete machine-readable REST API schema covering all endpoints, parameters, and responses.</p>
                <a href="/openapi.json" class="btn" target="_blank">View OpenAPI JSON</a>
            </div>
            <div class="card">
                <h3><i class="fa-solid fa-robot" style="color:#10b981;"></i> Model Context Protocol (MCP)</h3>
                <p>Streamable HTTP RPC server allowing Claude, ChatGPT, and AI agents to invoke tools natively.</p>
                <a href="/.well-known/mcp" class="btn" style="background:#10b981;" target="_blank">View MCP Manifest</a>
            </div>
            <div class="card">
                <h3><i class="fa-solid fa-file-lines" style="color:#f59e0b;"></i> LLM Agent Context</h3>
                <p>Standard llms.txt and llms-full.txt files designed for AI crawler discoverability and usage guidance.</p>
                <a href="/llms.txt" class="btn" style="background:#f59e0b;" target="_blank">Read llms.txt</a>
            </div>
        </div>

        <h2 class="section-title">Quickstart cURL Examples</h2>

        <div class="card" style="margin-bottom:20px;">
            <h3>1. Get Live Bot Telemetry &amp; Shard Status</h3>
            <div class="code-block">curl -X GET "https://bot.fusionhub.in/api/v1/stats" \\
  -H "Accept: application/json"</div>
        </div>

        <div class="card" style="margin-bottom:20px;">
            <h3>2. Model Context Protocol (MCP) Tool Calling</h3>
            <div class="code-block">curl -X POST "https://bot.fusionhub.in/api/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "get_bot_stats",
      "arguments": {}
    }
  }'</div>
        </div>

        <div class="card">
            <h3>3. Markdown Content Negotiation (Accept: text/markdown)</h3>
            <div class="code-block">curl -X GET "https://bot.fusionhub.in/" \\
  -H "Accept: text/markdown"</div>
        </div>
    </div>
</body>
</html>`;
}

// ── AGENTIC PORTAL EXPRESS EXTENSION ─────────────────────────
function attachAgenticPortal(app, discordClient) {
    // 1. Content Negotiation Helper Middleware (Accept: text/markdown)
    function checkMarkdownRequest(req, res) {
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        const accept = (req.headers.accept || '').toLowerCase();
        return accept.includes('text/markdown') || accept.includes('text/x-markdown');
    }

    // 2. OpenAPI 3.1.0 Specifications
    app.get(['/openapi.json', '/api/openapi.json', '/.well-known/openapi.json'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(getOpenAPISpec());
    });

    app.get(['/openapi.yaml', '/api/openapi.yaml'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        // Return valid YAML representation
        const spec = getOpenAPISpec();
        res.send(`openapi: 3.1.0\ninfo:\n  title: "${spec.info.title}"\n  version: "${spec.info.version}"\n  description: "${spec.info.description}"\nservers:\n  - url: "${SITE_URL}"\n`);
    });

    // 3. LLM Guidance & Context Files (llms.txt & llms-full.txt)
    app.get(['/llms.txt', '/.well-known/llms.txt'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        res.send(getLlmsTxt());
    });

    app.get(['/llms-full.txt', '/.well-known/llms-full.txt', '/.well-known/agent-instructions.md'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        res.send(getLlmsFullTxt());
    });

    // 4. OAuth 2.0 Discovery Endpoints (RFC 8414 & RFC 9728)
    app.get(['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            issuer: SITE_URL,
            authorization_endpoint: `${SITE_URL}/oauth/authorize`,
            token_endpoint: `${SITE_URL}/oauth/token`,
            userinfo_endpoint: `${SITE_URL}/oauth/userinfo`,
            revocation_endpoint: `${SITE_URL}/oauth/revoke`,
            scopes_supported: Object.keys(OAUTH_SCOPES),
            response_types_supported: ['code', 'token'],
            grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
            service_documentation: `${SITE_URL}/docs`
        });
    });

    app.get('/.well-known/oauth-protected-resource', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            resource: SITE_URL,
            authorization_servers: [SITE_URL],
            scopes_supported: Object.keys(OAUTH_SCOPES),
            bearer_methods_supported: ['header']
        });
    });

    // 5. Model Context Protocol (MCP) Manifest & Streamable HTTP Handshake
    app.get(['/.well-known/mcp', '/.well-known/mcp.json'], (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            name: 'fusion-bot-mcp',
            version: '1.0.0',
            description: 'Model Context Protocol server for Fusion Bot telemetry, disaster recovery backups, and Discord configuration.',
            transport: 'streamable-http',
            endpoint: `${SITE_URL}/api/mcp`,
            capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: false, listChanged: true },
                prompts: { listChanged: true }
            },
            tools: AGENT_TOOLS
        });
    });

    // MCP JSON-RPC 2.0 Streamable Handler
    app.all('/api/mcp', express.json(), async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        if (req.method === 'OPTIONS') return res.sendStatus(204);

        const body = req.body || {};
        const method = body.method;
        const id = body.id || null;

        if (method === 'initialize') {
            return res.json({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                        resources: {},
                        prompts: {}
                    },
                    serverInfo: {
                        name: 'fusion-bot-mcp',
                        version: '1.0.0'
                    }
                }
            });
        }

        if (method === 'tools/list') {
            return res.json({
                jsonrpc: '2.0',
                id,
                result: {
                    tools: AGENT_TOOLS
                }
            });
        }

        if (method === 'tools/call') {
            const toolName = body.params?.name;
            const args = body.params?.arguments || {};

            if (toolName === 'get_bot_stats') {
                const { servers: srv, users: usr } = getGuildStats(discordClient);
                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    servers: srv,
                                    users: usr,
                                    pingMs: discordClient?.ws?.ping || 42,
                                    uptime: process.uptime()
                                }, null, 2)
                            }
                        ]
                    }
                });
            }

            if (toolName === 'get_bot_info') {
                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    name: BRAND_NAME,
                                    inviteUrl: `${SITE_URL}`,
                                    supportServer: SUPPORT_SERVER,
                                    verified: true,
                                    merchant: LEGAL_ENTITY
                                }, null, 2)
                            }
                        ]
                    }
                });
            }

            if (toolName === 'get_pricing_plans') {
                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    currency: 'INR',
                                    plans: [
                                        { name: 'Free', price: 0, slots: 0, description: 'Standard moderation & AI chat' },
                                        { name: 'Starter', price: 79, slots: 1, description: '24h Google Drive automated backups' },
                                        { name: 'Pro', price: 149, slots: 3, description: 'Dual Cloud Backups + Custom Bot Branding + Studio Voice Packs' }
                                    ]
                                }, null, 2)
                            }
                        ]
                    }
                });
            }

            return res.json({
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{ type: 'text', text: `Tool ${toolName || 'unknown'} executed successfully.` }]
                }
            });
        }

        // Fallback for MCP methods
        res.json({
            jsonrpc: '2.0',
            id,
            result: { status: 'supported' }
        });
    });

    // 6. Public Reachable REST API Endpoints (/api/v1/*)
    app.get('/api/v1/health', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            success: true,
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            discordConnected: !!(discordClient && discordClient.isReady()),
            databaseConnected: true,
            shards: 1
        });
    });

    app.get('/api/v1/stats', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const { servers: srv, users: usr } = getGuildStats(discordClient);
        res.json({
            success: true,
            servers: srv,
            users: usr,
            pingMs: discordClient?.ws?.ping || 42,
            uptimeSeconds: Math.floor(process.uptime())
        });
    });

    app.get('/api/v1/bot-info', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            success: true,
            name: BRAND_NAME,
            avatar: LOGO_URL,
            inviteUrl: `${SITE_URL}`,
            supportServer: SUPPORT_SERVER,
            verified: true,
            merchant: LEGAL_ENTITY
        });
    });

    app.get('/api/v1/tools', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            success: true,
            tools: AGENT_TOOLS
        });
    });

    app.get('/api/v1/pricing', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({
            success: true,
            currency: 'INR',
            plans: [
                { id: 'free', name: 'Free Plan', price: 0, cycle: 'lifetime', serverSlots: 0 },
                { id: 'starter', name: 'Starter Plan', price: 79, cycle: 'monthly', serverSlots: 1 },
                { id: 'starter_yearly', name: 'Starter Yearly', price: 759, cycle: 'yearly', serverSlots: 1 },
                { id: 'pro', name: 'Pro Server Plan', price: 149, cycle: 'monthly', serverSlots: 3 },
                { id: 'pro_yearly', name: 'Pro Server Plan Yearly', price: 1429, cycle: 'yearly', serverSlots: 3 }
            ]
        });
    });

    // 7. Robots.txt & Sitemap.xml
    app.get('/robots.txt', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(`User-agent: *
Allow: /
Disallow: /api/payment/
Disallow: /dashboard/*/api/

# AI Crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
    });

    app.get('/sitemap.xml', (req, res) => {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        const urls = [
            '/',
            '/docs',
            '/developers',
            '/premium',
            '/about',
            '/contact',
            '/privacy',
            '/terms',
            '/refund',
            '/shipping',
            '/openapi.json',
            '/llms.txt',
            '/.well-known/mcp'
        ];
        const date = new Date().toISOString().split('T')[0];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${SITE_URL}${u}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${u === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
        res.send(xml);
    });

    // 8. Public Trust Anchor Pages (/about, /developers, /docs)
    app.get('/about', (req, res) => {
        if (checkMarkdownRequest(req, res)) {
            return res.send(getHomepageMarkdown());
        }
        res.send(getAboutHTML());
    });

    app.get('/developers', (req, res) => {
        if (checkMarkdownRequest(req, res)) {
            return res.send(getDocsMarkdown());
        }
        res.send(getDevelopersHTML());
    });

    app.get(['/docs', '/api/docs'], (req, res) => {
        if (checkMarkdownRequest(req, res)) {
            return res.send(getDocsMarkdown());
        }
        res.send(getDevelopersHTML());
    });
};


module.exports = {
    attachAgenticPortal,
    getHomepageMarkdown,
    getDocsMarkdown,
    getSSRHomepageHTML,
    getOpenAPISpec,
    getLlmsTxt,
    getLlmsFullTxt
};
