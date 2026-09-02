// ============================================================
// 🚀 FUSION BOT — SHARD + CLUSTER MANAGER (shard.js)
// Run:  node shard.js
// ============================================================
const { ShardingManager } = require('discord.js');
const path  = require('path');
const http  = require('http');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ('MTQ4NTM3NTkxMDU2Mjc1ODk2Nw' + '.' + 'GR8e_U' + '.' + 'CVX6WS4QNq6EOzPUG5pODxc5CZITM5JzJfWSzA');

// ── Cluster config ──────────────────────────────────────────
// A "cluster" is one shard.js process. If you run multiple
// shard.js processes on different machines, give each a unique
// CLUSTER_ID env var so /ping can display it.
const CLUSTER_ID    = parseInt(process.env.CLUSTER_ID   || '0');
const SHARDS_PER_CLUSTER = parseInt(process.env.SHARDS_PER_CLUSTER || 'auto');

// ── Stats store ─────────────────────────────────────────────
// shardId → { guilds, ping, status, uptime, clusterId }
const shardStats = new Map();

// ── ShardingManager ─────────────────────────────────────────
const manager = new ShardingManager(path.join(__dirname, 'server.js'), {
    token:       DISCORD_TOKEN,
    totalShards: SHARDS_PER_CLUSTER === 'auto' || isNaN(SHARDS_PER_CLUSTER) ? 'auto' : SHARDS_PER_CLUSTER,
    respawn:     true,
    shardArgs:   [],
    execArgv:    [],
    // Pass CLUSTER_ID into every shard process via env
    env: {
        ...process.env,
        SHARDING_MANAGER: 'true',
        CLUSTER_ID:       String(CLUSTER_ID),
    }
});

// ── Shard lifecycle ──────────────────────────────────────────
manager.on('shardCreate', shard => {
    console.log(`[Cluster #${CLUSTER_ID}] 🟡 Shard #${shard.id} spawning...`);

    shardStats.set(shard.id, {
        guilds:    0,
        ping:      -1,
        status:    'spawning',
        uptime:    0,
        clusterId: CLUSTER_ID,
    });

    shard.on('ready', () => {
        console.log(`[Cluster #${CLUSTER_ID}] ✅ Shard #${shard.id} READY`);
        const prev = shardStats.get(shard.id) || {};
        shardStats.set(shard.id, { ...prev, status: 'ready' });
    });

    shard.on('disconnect', () => {
        console.log(`[Cluster #${CLUSTER_ID}] 🔴 Shard #${shard.id} disconnected`);
        const prev = shardStats.get(shard.id) || {};
        shardStats.set(shard.id, { ...prev, status: 'disconnected' });
    });

    shard.on('reconnecting', () => {
        console.log(`[Cluster #${CLUSTER_ID}] 🟡 Shard #${shard.id} reconnecting...`);
        const prev = shardStats.get(shard.id) || {};
        shardStats.set(shard.id, { ...prev, status: 'reconnecting' });
    });

    shard.on('death', proc => {
        console.log(`[Cluster #${CLUSTER_ID}] ☠️  Shard #${shard.id} died (exit code: ${proc.exitCode})`);
        const prev = shardStats.get(shard.id) || {};
        shardStats.set(shard.id, { ...prev, status: 'dead' });
    });

    shard.on('error', err => {
        console.error(`[Cluster #${CLUSTER_ID}] ❌ Shard #${shard.id} error: ${err.message}`);
    });

    // Receive stats pushed from server.js via process.send()
    shard.on('message', msg => {
        if (msg?.type === 'shardStats') {
            const prev = shardStats.get(shard.id) || {};
            shardStats.set(shard.id, {
                ...prev,
                ...msg.data,
                status:    'ready',
                clusterId: CLUSTER_ID,
            });
        }
    });
});

// ── Spawn ────────────────────────────────────────────────────
manager.spawn({ amount: 'auto', delay: 5500, timeout: 60000 })
    .then(() => {
        console.log(`[Cluster #${CLUSTER_ID}] 🎉 All shards spawned! Total: ${manager.totalShards}`);
    })
    .catch(err => {
        console.error(`[Cluster #${CLUSTER_ID}] 💥 Spawn error (will retry):`, err.message);
        // Do NOT exit — let the manager recover and try again
    });

// ── Broadcast eval: collect live stats every 30s ─────────────
setInterval(async () => {
    try {
        const results = await manager.broadcastEval(client => ({
            shardId:  client.shard?.ids?.[0] ?? 0,
            guilds:   client.guilds.cache.size,
            ping:     client.ws.ping,
            uptime:   client.uptime,
            users:    client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
            status:   client.ws.status,   // 0 = READY
        }));

        results.forEach(data => {
            if (!data) return;
            const prev = shardStats.get(data.shardId) || {};
            shardStats.set(data.shardId, {
                ...prev,
                ...data,
                status:    data.status === 0 ? 'ready' : 'connecting',
                clusterId: CLUSTER_ID,
            });
        });
    } catch(e) { /* shards may still be booting */ }
}, 30000);

// ── HTTP stats + health endpoint ─────────────────────────────
const STATS_PORT = parseInt(process.env.SHARD_STATS_PORT || '25625');

http.createServer((req, res) => {
    if (req.url === '/stats') {
        const shards = [];
        shardStats.forEach((data, id) => shards.push({ id, ...data }));

        const totalGuilds = shards.reduce((a, s) => a + (s.guilds || 0), 0);
        const totalUsers  = shards.reduce((a, s) => a + (s.users  || 0), 0);
        const avgPing     = shards.length
            ? Math.round(shards.reduce((a, s) => a + (s.ping || 0), 0) / shards.length)
            : -1;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            clusterId:    CLUSTER_ID,
            totalShards:  manager.totalShards,
            totalGuilds,
            totalUsers,
            avgPing,
            shards,
            timestamp:    Date.now(),
        }, null, 2));

    } else if (req.url === '/health') {
        const allReady = [...shardStats.values()].every(s => s.status === 'ready');
        res.writeHead(allReady ? 200 : 503);
        res.end(allReady ? 'OK' : 'NOT_READY');

    } else {
        res.writeHead(404);
        res.end('Not found');
    }
}).listen(STATS_PORT, '127.0.0.1', () => {
    console.log(`[Cluster #${CLUSTER_ID}] 📊 Stats: http://127.0.0.1:${STATS_PORT}/stats`);
    console.log(`[Cluster #${CLUSTER_ID}] 💓 Health: http://127.0.0.1:${STATS_PORT}/health`);
});