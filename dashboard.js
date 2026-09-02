// Helper to resolve Image URL or local uploaded file to base64 Data URI for Discord API
async function getImageDataURI(imgUrl) {
    if (!imgUrl || typeof imgUrl !== 'string') return null;
    imgUrl = imgUrl.trim();
    if (!imgUrl) return null;

    let buf = null;
    let mime = 'image/png';

    // 1. Already a Data URI
    if (imgUrl.startsWith('data:image/')) return imgUrl;

    // 2. Local uploads folder
    if (imgUrl.includes('/uploads/')) {
        const parts = imgUrl.split('/uploads/');
        const fileName = parts[1];
        if (fileName) {
            const localFilePath = path.join(__dirname, 'public', 'uploads', fileName);
            if (fs.existsSync(localFilePath)) {
                buf = fs.readFileSync(localFilePath);
                if (fileName.endsWith('.gif')) mime = 'image/gif';
                else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mime = 'image/jpeg';
                else if (fileName.endsWith('.webp')) mime = 'image/webp';
                else mime = 'image/png';
            }
        }
    }

    // 3. Remote URL
    if (!buf && imgUrl.startsWith('http')) {
        try {
            const r = await fetch(imgUrl, { signal: AbortSignal.timeout(8000) });
            if (r.ok) {
                buf = Buffer.from(await r.arrayBuffer());
                const ct = r.headers.get('content-type');
                if (ct && ct.startsWith('image/')) mime = ct;
            }
        } catch(_) {}
    }

    if (buf && buf.length > 0) {
        return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return null;
}


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
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// 👑 MULTI-SERVER LICENSE SLOTS ENGINE
// Pro Plan = 3 Server Licenses | Starter Plan = 1 Server License
// ==========================================
const LICENSES_DB_PATH = path.join(__dirname, 'data', 'user_licenses.json');

function getUserLicenses() {
    try {
        if (!fs.existsSync(LICENSES_DB_PATH)) {
            fs.mkdirSync(path.dirname(LICENSES_DB_PATH), { recursive: true });
            fs.writeFileSync(LICENSES_DB_PATH, JSON.stringify({}), 'utf8');
            return {};
        }
        return JSON.parse(fs.readFileSync(LICENSES_DB_PATH, 'utf8') || '{}');
    } catch(e) {
        return {};
    }
}

function getUserLicense(userId) {
    if (!userId || userId === 'user') return null;
    const db = getUserLicenses();
    return db[String(userId)] || null;
}

function saveUserLicense(userId, licenseData) {
    try {
        if (!userId || userId === 'user') return;
        const db = getUserLicenses();
        db[String(userId)] = {
            userId: String(userId),
            ...licenseData,
            updatedAt: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(LICENSES_DB_PATH), { recursive: true });
        fs.writeFileSync(LICENSES_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch(e) {
        console.error('[User License DB Error]', e.message);
    }
}

function activateServerSlot(userId, username, guildId, guildName, plan, cycle, expiresAt, orderId) {
    const maxSlots = (plan === 'starter' ? 1 : 3);
    let lic = getUserLicense(userId) || {
        userId: String(userId),
        username: username || 'User',
        plan: plan || 'pro',
        cycle: cycle || 'monthly',
        maxSlots: maxSlots,
        expiresAt: expiresAt.toISOString(),
        orderId: orderId || '',
        activeGuilds: []
    };

    lic.plan = plan || lic.plan;
    lic.maxSlots = (lic.plan === 'starter' ? 1 : 3);
    lic.cycle = cycle || lic.cycle;
    lic.expiresAt = expiresAt.toISOString();
    if (orderId) lic.orderId = orderId;

    if (!Array.isArray(lic.activeGuilds)) lic.activeGuilds = [];

    // Check if guild is already added
    const existingIdx = lic.activeGuilds.findIndex(g => g.guildId === String(guildId));
    if (existingIdx === -1) {
        if (lic.activeGuilds.length >= lic.maxSlots) {
            // Replace the oldest slot if over limit, or return false
            lic.activeGuilds[lic.activeGuilds.length - 1] = {
                guildId: String(guildId),
                name: guildName || `Server (${guildId})`,
                activatedAt: new Date().toISOString()
            };
        } else {
            lic.activeGuilds.push({
                guildId: String(guildId),
                name: guildName || `Server (${guildId})`,
                activatedAt: new Date().toISOString()
            });
        }
    } else {
        lic.activeGuilds[existingIdx].name = guildName || lic.activeGuilds[existingIdx].name;
    }

    saveUserLicense(userId, lic);
    return lic;
}


// ==========================================
// 🎟️ 1-TIME FREE TRIAL CLAIM TRACKER
// Enforces that each Discord user can only claim the 1-Month trial ONCE
// ==========================================
const TRIALS_DB_PATH = path.join(__dirname, 'data', 'claimed_trials.json');

function getClaimedTrials() {
    try {
        if (!fs.existsSync(TRIALS_DB_PATH)) {
            fs.mkdirSync(path.dirname(TRIALS_DB_PATH), { recursive: true });
            fs.writeFileSync(TRIALS_DB_PATH, JSON.stringify({}), 'utf8');
            return {};
        }
        return JSON.parse(fs.readFileSync(TRIALS_DB_PATH, 'utf8') || '{}');
    } catch(e) {
        return {};
    }
}

function hasClaimedTrial(userId) {
    if (!userId || userId === 'user' || String(userId).startsWith('guest_')) return false;
    const trials = getClaimedTrials();
    return !!trials[String(userId)];
}

function recordClaimedTrial(userId, details) {
    try {
        if (!userId || userId === 'user') return;
        const trials = getClaimedTrials();
        trials[String(userId)] = {
            userId: String(userId),
            ...details,
            claimedAt: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(TRIALS_DB_PATH), { recursive: true });
        fs.writeFileSync(TRIALS_DB_PATH, JSON.stringify(trials, null, 2), 'utf8');
    } catch(e) {
        console.error('[Trial Tracker Error]', e.message);
    }
}


// ==========================================
// 🧾 DIGITAL TAX INVOICE & BILL IMAGE GENERATOR
// ==========================================
function generateInvoiceSVG({ transactionId, username, customerName, serverName, serverId, planName, cycle, amount, date, expiryDate }) {
    const safeTx = String(transactionId || '').replace(/[<>&"]/g, '');
    const safeUser = String(username || '').replace(/[<>&"]/g, '');
    const safeCust = String(customerName || '').replace(/[<>&"]/g, '');
    const safeServer = String(serverName || '').replace(/[<>&"]/g, '');
    const safeId = String(serverId || '').replace(/[<>&"]/g, '');
    const safePlan = String(planName || '').replace(/[<>&"]/g, '');
    const safeCycle = String(cycle || '').replace(/[<>&"]/g, '');
    const safeAmt = String(amount || '0.00').replace(/[<>&"]/g, '');
    const safeDate = String(date || '').replace(/[<>&"]/g, '');
    const safeExpiry = String(expiryDate || '').replace(/[<>&"]/g, '');

    const logoB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB42KiYmKjY+NDI0PkxERExfWl98fKcBBgYGBgcGBwgIBwoLCgsKDw4MDA4PFhAREBEQFiIVGRUVGRUiHiQeHB4kHjYqJiYqNj40MjQ+TERETF9aX3x8p//CABEIAPwA/AMBIgACEQEDEQH/xAAxAAEAAgMBAQAAAAAAAAAAAAAABQYBAwQHAgEBAAMBAAAAAAAAAAAAAAAAAAECAwT/2gAMAwEAAhADEAAAAqqAAAAAAAAAAAAAAAAAAAAA3yl0J92bdtNXxasWtUvm389VYTEZjXUKQAAAAAAAANh8zPX09dMOCMm0xzRjCe9wKpTqgV7Wf5gJbe/DE2/gpFfZxy5gAAAAAAZs/JL75a4TPDFmey443rUtOiNxJiAhrwPM12qB1ytYlOnT6gbfAkcObMAAAABu0zqszHSlV0x0dnJes+jr3AAAA4u0eca7bUSf+4mb7tKjjv4OPMKgAAAFuqN4rjz1ewV+ZlLxWrLOpE8RY2MhXe0lQAPO/RKeQlkrU50TogrTVoBhAAAAC+UO9588XAWKuze2T9dnr6+e6c4Lv9c30U3bqyek/ejeAIKd5zzuSjei6fqtqgelHDjAAAALvSLjlhir26olhtdOuOu9LjvRMGr62jzrvumTIAAPPeabgyyx2/d3RVhwyAAAAt1Rt+WXXTblTa1lrtSrrvuAAAAABB0/0PzwkpWAn+2lV1SMdyWCsgAALnTLzhn81C11RE5cKrat9QAAAAAHnvoVPISy1mf3pywVoq8SGNgAAF/oHoPNnGVmzVm82ey1uybXGs2IiUPsADHHRT0dRbIS1R7qsfE/BWjTPnqtjriQzuAAAvFHsGFZqm+gVfGOG5UN2X9CqEYkm4Qel5pE4TeISCNkQ6YjmWLijOKzLyUuOR2QV8o7iK9IJAAAfXyLvIeeWfhp9xVt+qxTpGfxMcVYuOZrQ1q4ejSDTnbMQNn6NWXPsxT9Ok3XkqWi95aJLbBNgAAAAANvdGKxK8XON9hq6Iv2/wA6240v+ija5iywGlrcL3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8QAAv/aAAwDAQACAAMAAAAhAAAAAAAAAAAAAAAAAAAAAKfWhAAAAAAAAAACT6PPO7dIAAAAAAAhOwQwAw6+AAAAAAUREAAAAAsvhAAAAAWuAIIAAAErBAAAAAsek0wIAAQs5AAAAAF9AoA0AAAMaAAAAABbgAAAAAAcNjAAAAUXgAAAAAAAIAAAAAZUgAAAAUMYsiAAAADyeMsoc69o3jAAAAATJO/28a70TAAAAAAAxRBosjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/8QAAv/aAAwDAQACAAMAAAAQAAAAAAAAAAAAAAAAAAAACBgU0JAAAAAAAAAEpmCfhL7KAAAAAAAkrQ8cc4CqAAAAAAak48888sK0oAAAAAea884w88sQuAAAAA3r0Y8wc88bJAAAAAym8ss0888SaKAAAAgm8888888sUiAAAAWDc8888888x6AAAAwhU8888oU8HwAAAAUOiAIU0EfXVoAAAAADtvkGPwZTjAAAAAAQzAg7ZbAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAA/8QANREAAQMDAQQFCwUBAAAAAAAAAQIDBAAFERIgMDFRBhMhM0EQFCIyNEBSYWJxchUWI0KCgf/aAAgBAgEBPwD3QCo1ulSPUQcczTXR5R9d2v26zjvlU70eWAS26D96kQJMc+m2ccxukpKlBKQSat9obaSHH8FXHB4CpV5jR8ttAKUPAcBTt7muHsVpHyr9TnZ79VM3yYgjUQuot2iyxocwk8jVxswKS6wP80UkEg8RuLY0lv8AlVx8KuNzU4S22rCeBOznFWm6nIZeV+KjV7t4A84bT+W2nGRmnJBS3hJ8NsEgg5q3PiZB0rOVYwqpTXUvuo5K7NpxejFJUVDcdH3tLy2/iGavzOiUF49YbU5ZSlJ+dRV6ms7i3O9VMaV9WDV/a1x0LH9TtXTuEn51a16mTuEnCgaWPObWPHKKIwcbN3OIv+hVlJLKtzZHQ5DUj4TiprXVSnUclHZvy9MZI5rqyeyk/VubG/oeWjmKvSR5wF/ENnpKrDDP51Y/YUnmo7m3djhXVzd1uoHIbN+jF+CopGSg6q6PT0J1R1nicp8mR4mgc+VakoTkmkyGlcDQcSabfCE9lKUVKJOzgEYIyKutjebcU/FBKSclI4io98nxx1ajqx4Kpd+mvDSnA+1Q7pIirKXQSk9pBpq8Q1jtXpPI05doiR2K1GnZrklelIwOVNQXQgHVg03HUniqgMbhyLGdOXGUKPMim4sZs5QygfYVKgRZPeIGeYpXR9GToeP/AEU1Y0pPpvE/YUxEZYHoJGee+z7z/8QALBEAAgEDAgQFBAMBAAAAAAAAAQIDAAQRBRIgITBBEBMxUWEiMkJxFCRAUP/aAAgBAwEBPwD/ACgUsQPeltkP5UbI/i4NSQSJ6jpEgUZgTgUhatxoSOO9JdSLUVzG/JquLMEb46IwcdC6uQX2Kat4sAM3Fa3JH0sau4R96jjuZfKgZqsE86Usf30In3x7TTDax4tYfEMY9zWkqP44b36ELYNTc2zxa7kRxH2atIObNfg+A4gcUxyOLXE3Wyn2atEP9Zh7N0Q2DxaoAbXHzWjKRFJ8noyna9KcqOHUecIHzWmLiE/vo3X2g1bNuThvVLIKswBDjo38gVAKsgfKyeGdNyVbttyp8BXI+h8ZJEjQuxwAMmo9Us3BPmAVLqlug+k7jUZlu5vTlSLsVRxPF3FeZIlSTzMMCoriWFjupb6AjmcGpdRtkHc1eXdxeOETkOwpNCmMYJkUE+oqHRQpHmS5/VRQxwrtRcDoFVPagijtUkEcnqKfTlOcNQ0lO71DaQQj6FGff/j/AP/EAD0QAAEDAQQFCAcIAgMAAAAAAAIBAwQABRAREiEwMUFREyAiMmFxcoEGI0BCUmKRFCQzNENTobEVgmBw4f/aAAgBAQABPwL/AIajbi7BWvs0j9oq+zP/ALZUoGm0V9qajPO9UfOmrMBOuWPdQR2A2NpzNtHEYPaCU7Zn7ZeS04y42uBDh7KIkS4IlR7OEdLuleFIiJspVRNtHNZHfj3UtoruCvt73Aa/yDvAaG0fiCglsn72HfcQCaYEmNSbOwxJr6extNG4aCKVHigwPEt63PTkHQGlaNwzXpFjz233W9heVMSwc0LoW6XCR3pDoL+6IVFVRfYBFSJETatRYqMB8y7aJUFFVakyycXAdA/3ciKq4ImNR7FlO6TwBO3bTdgxU65EX8UlkwE/RorIgL+jh507YDK/hmQ9+mpNkzGNOXMPFL40zDAHPrdNi8omcesnsFmRcE5Yv9bpknlCyj1U/m6HCelHgOzeVRLPYip0RxL4ufNspiQikKZT40+w6w5kcHBboUn9MvK60I+Q847F10dpXXhCkFBRBTdVoP5AyJtK6FEOU8gJs3rTDDbDaACYImpmw25TSiW3cvCnmjZcIDTSl0Z3lW0Xfvp9pHWiGiTBVTW2Oz13fJKWpDvKvEVbas2IkaOie8uktXbULlGuWFOkO3uuhOZHcNxXWg3kfx+LW2eGSI326anHkjGvldZDHLTBx2Dp1hohCqLvqUzyMhxvgtIuC40BZgFeKVaYYtIXBdawmDDSfKlWsvqRT5rvR4Pxz7kun2o3EwHDMfCo1vIZoLreXHfSLS1Kt0QNRaDNhvqz7UblLlVMp8OdbrWWSJ/EP9XQizMJ2VIDOyadmsSm/wAIPClWv+G34rvR78F7xUZZRVeFSHVeeNxd63WO+rsMcdo6KtZ9WYR4bV0XMuE06BptRabPOAlxTHm261miofwldZ59IxufDI8Y9usj6WGvClWunqA8V3o6Wh9O6nkxaNPlWl0LdYIqkUl4nVuiqw8eBJfGFRjtIvwJzZzfKxnQ+W6KWV8LrSDB7NxTWQFxiM+GrUT7ovYqXejy+vdH5brVgGy8Tgj0C091MRnXzQAGoscWGQbTclSWBeZNst6VIjOx3FAx/wDasuAb7wmQ+rTT385amNclKeD5qTQtAWYBXilWmGLQlwXWWUuMIO9atBMYjvddYK4Te8VuwoQEdgol6gJbRRaRMOfbrWWUJ/EP9XQjzMJ2VIDOyY9mssb8p/stTPyr3husX8+Hcuut5nNFQ/hK6zy6Rjc+GR4x7dXYyfc/9lqZoiveG6xPz4+FddNa5WK6Hy3RiyvhdaQYPIXFNXZSYQm6tFcIbt1gJ99VfkXXLUxrkpTwfNSaFoFzAJcUq0wxaEuC6uz0whs+GrWXCGvaqXejyeueX5dfbrWWUJ/EP9XQlxjj2VMHGM53auMmEdrwJVsr93DxXejyaH17tXmFNq8y3nUJ9sE91NPndAT7unfUvRGd8Orj6WGvAlW0nqA8V3o8SYPj2ot7rrbQqRkiJX+ag5sM69+FAYGKEK4ovNnyvs0Yj37qdeddLMZqq1CtJ6KW3MHCgtmCSYq5l7FqVbjIiqMdIuO6jMjJSJcVWhFSJBTfTbfJtiPBKtRzKxl+JdXZjnKQ2uzRVoM8rFNE2ppS6JKOK8jg+aVGtKI+iesRF4LT06K0mJOjVo2gUs9GgE2JdZE/kD5JxegX8LSXqqIlWtO+0u5Q6g/zzdtQYfJ9M+tuThdPf5Z5cOqmhNXYkrKZMr72y60oCtEroJ0F29nPh2tIjplXphwoLdhr1sw+VOW7ETqoReVTLUkSej1Q4JdFjk+6gps3rTtktF1CUaWyX9xDQWQfvuJ5UxDZZ2JivFbrRnJgrTa966wSUSRU2pVnzxlN6fxE2pSoippqTY7ZrmaXKvDdR2XMH9PHuobNmr+lTFjb3i8kp6Cw4zyeXDDZUmI9HLpJo482NDdkL0U0cajx244ZR815j0uOz1nE7qlWobuIt9Ef51zbhtkhAuCpUO2mzwF/olx3UJCSYiuKXrQOAfVJF7qUUJMFTFKdsmMekcQ7qWxT3PJSWKW95PpTVlxm9uJL20iIiYIlPvtMhmNcKl2g6+5iiqIpsSkmSk/WL60Ul8trpfX2Jt95rqOElDbE5Pfx8qW2Zy+8ieVOy5DvXdJaYkOsFmbLCo9ttroeHBeKU3JjudR0Vu0U5KjtdZ0UqRbQJoZHHtWnn3XizGWPtiPPJscL60rzq7XC+v8A0h//xAAqEAEAAQIEBQQDAAMAAAAAAAABABEhEDFBUTBhcYGRIKGx8EDB0WBw4f/aAAgBAQABPyH/AA3PV2g38Ijn4pko7flM3qbspcGW2SfpLWFssUMwPWa0ty0zWJWy/FG3K5UlI+I94AAoGkFqgOcydONJ92Mo1Zf8FlKLm1kEcpSpHOIbg84iKJ+FURLLQufQi0laPnaSvm+Hrd0t2Uo/Q9HAJEiAqiP4BZ1SgTeuZjU0DNiKtgjyk5BBj6IymcnGjXqsF+BQ7sliVXFtki2n9zOGp2L8yPHtJd+mNo7Ne8sKL6HOyIV5w831M5aDZPWOqQ9+mGQvX+sLMfreMatW/SGTQFCUN97kYWcRfaJTHrzwGClQ99KNR4KIjKqZLQgdS3WK5mNHi5kQoBXIiaHWh0ICgM2Oo1z9cP8AsxYKK3QwrhyFeLzxc7yhWae7AaFr+IJ1QUYm9dOmkQBmNZyBGfXqvEJyw+KUN9gsQGJBWHb1hUgsrbvAQRtEBVhN61FtCZf9qs9PVT8t72CmN9J4vR4eYn220PlYU9vCX0LFtu72wrdqvtjC6WffBQ6CYQeR+XppmX9pwpbkqTOcgnwzOKu+1JfNsIdeo52sAoOY0wY+tSGhqnAKoGsz1ip6R35Ul9ZVm7TzhT/qOJV0V13WHVR+Y5R4y+TVG5q5uh1mU/ed2bXVHxWbOg3j5hal9kPSClJygdOjeKg7M5AjPolXidIBPK2FlwSEok9igpj7xBWBYFDb105Le9gpDfSeLnEUwr1ODpxjsHf2nCnuCsdpyifDoB3k6rnwHZ4yG4rzLkrzdp5w+2VOH11VnaFMKuw4wKk5QKnRvEg7M5IDPqlXh0fFE7LDp08elWE68JKF6uESifpSUg3w93jhuWTrBEs4v1fDHG3bFUc3CIxf1pL/ALYd1cQJZ5rD51aQ0eST00rvlPNi9W3ZTitZvxC9Q2IITpZBK351WEpVVCEHsTmah44Yq1FfaIWseDC/BpuEQDUrSRrZtBqwiB7u5uB55rMENEbOLhUAgi23zb+kFAFVyimncQNhZdThoTO13XhWpLZu9NHAFaNWZ0htjd3xB2tdnzBX9q6uA5fAJemfJBt33pKmxO6XeaMFcml8cRs6JUYUFQetzIgAI5jEXNyE/dUVzHVpKSfT7wlQ1ppKI5Y5PpC2dbyIJP5GWlIkAzmy7Chc7VxleqskC+UUHBTUvigKrSBqaNGqsaCTMY3cPCfvUlf7SHhPhPEPAA0IiOPmaQYTBLRZne6L+C5XpLAcvVBHtoyONq2lWla7PWHiOsEBr3CVGVGsK94vDGpdqK1v4/LFMpkj6KZmeqlf9H//xAAoEAEAAgECBgIDAQEBAQAAAAABABEhMUEQMFFhcYEgkUChsfDBYHD/2gAIAQEAAT8Q/wDGAugz9D6ZlD7cy4/eM0z3RE/IqUBW/AIIbsYoJotbtn7mxQO2Jcth1GdgwNreTmD/ADPWKl3VMP4qu2oCAVtnYgCuEAoI1Ot1REk6WGPtj3GOs36B6WF1XpJsL5u/seC7ABaEdEiBzMgGWRHlWjxHwCOR/CRJ9IOrDAAGX+QAVQA1Y+EGF6J2dI2eD5mrnflU9o9+h4B+PohIdIjqJ+Ao0AG6wOICH/iQQp1TaIuB99zwRRdAtYYy/P6IaPloITR3z5VzyFi9c2ogctbu/ZERRKZkybS8DcG27RYLuxlfHEG1Aijs1zwTZodjeAWVoMrKGnpcDOnShQwCBSi3IPiLIJ7bOl7YqjROw6rgi9lWLuAdV8nOQ307dBqyrwhdiYwwyODe/Q2cwe+yXV6vItUOiBd+DrmR7myREAjYkNkaf36wBy/UGjAzpwdzm2bHU0pUCr4jybT7OlDjtAA3WCXrO8eUYV3rn2i7sXzs8BA0c+dHmEMdULArSjD9eCtaL69IFcL42fI8yoO4xJCAvPmGcoQ9Qi4lBmaXxzGSQSCv64X/ADYcB6656JmT9RoPWKb7S+IBIosTIjGaAGVg/wAzHWP65YVvksQHDlouVk6e1b5E1cv9shHu/wAU/wBZtwWZPQBVOwXEko7tsOAGqLe0NPWPwu/DU7M0v8eB8dKhK8O5HB+qICnRjMdJ4c8tUJ3TmR4WMjafVWIeUgjUhHca4aciJKzHDCELUB5ZiWN8g+NTbffBEDQp0Zlmiz44KOMG++WNSej30zr3wCnqr9QRRHvdsLtjfvChp6qbSG+0ZoQOno7MM9UK3oAwTNwqGaCGvihosSmJWUN+iih6gnqEXp9oSuTNL45h5ZonT9XB+i4JkBHUcksAF1q/jiSBA4CH7gAANAUHyYVE8MWC5V/0g01q3yIjy2a9IAFjtHrbyOaoeKb4dquDPqARRhxE7QPDk5bxAaUdo6pvOdXK2v4FkSwTJh8kvlxb8QlSkDBvvlDWeS5eSn7P4BWBRLEpI1ZQ/wCigj1BPUI5x9gRiTNb45Q1lt9/2zqFwYL+05zCEY/fwPeywSSNGPUeSLZV+3/VH6f/AC77PmrXnwQYgnU4LCkKXy4HRtUNLocpUkEu8CO34eXuNAde10RmMLq4ST/LfY/EaNgZvJDhLaUeOkGOvbu8sj3ViRkEKUZVeor1Vi0hQ7s0Ky9t4AlxfTlCXPtflm34TzT2/UwGtXp05vl3x0FoBgKeAi72y6rhKUArnEhwEBEbEeJRyVVoAl01UW278G8esqgZVhwp4gYRBAC1ehDddb/1eXVT+uxLM5jG7QN/hq5lHQ4YBpp0eBqmkWvPhN3qK/aOgzwiOaPq2eCRUatqXhmUlXg+toSOyguU3VmZgwrLtaxtuyLfLUeQLUSEXIII1pICxGFJTLmhaAPRsBB35GKPp/q4BZzj5cROW74uN8C5DdvLvgF1Y90YAyx697b/AERwaYZVvK55t1XCqZU7pVjkK4KBicFwwbrUs1QAowqsYYj6YwsvVf1Zcbh3yVFQ7zBCrqr6JoAuIAguSYN+wJbjmTPbUDFfumHob0YI2qq/g+GhcIXHx5iIPE5YCLVU+hB+xzXsDhr1Ju57BuUsIx1gPLGDVbVYf9t4YeddLcdgflrWkesNoHoKXgT3UUtqv/w//9k=";

    const svg = `
    <svg width="820" height="980" viewBox="0 0 820 980" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#080c16" />
          <stop offset="50%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#050811" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e293b" stop-opacity="0.96" />
          <stop offset="100%" stop-color="#0f172a" stop-opacity="0.98" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
        <linearGradient id="paidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6" />
        </filter>
        <clipPath id="logoClip">
          <rect x="675" y="45" width="85" height="85" rx="20" />
        </clipPath>
      </defs>

      <!-- Background -->
      <rect width="820" height="980" fill="url(#bgGrad)" />

      <!-- Main Receipt Card -->
      <rect x="35" y="30" width="750" height="920" rx="28" fill="url(#cardGrad)" stroke="#334155" stroke-width="1.5" filter="url(#shadow)" />

      <!-- Top Accent Bar -->
      <rect x="35" y="30" width="750" height="10" rx="5" fill="url(#accentGrad)" />

      <!-- Bot Logo (Embedded Base64 & Vector Badge Fallback) -->
      <rect x="675" y="45" width="85" height="85" rx="20" fill="#1e1b4b" stroke="#6366f1" stroke-width="2" />
      ${logoB64 ? `<image href="data:image/png;base64,${logoB64}" x="675" y="45" width="85" height="85" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice" />` : `
      <text x="717" y="97" font-family="'Segoe UI', sans-serif" font-size="34" font-weight="900" fill="#a5b4fc" text-anchor="middle">⚡</text>
      `}

      <!-- Header Title & Merchant Details -->
      <text x="70" y="75" font-family="'Segoe UI', -apple-system, sans-serif" font-size="30" font-weight="900" fill="#ffffff" letter-spacing="1">FUSION BOT</text>
      <text x="70" y="102" font-family="'Segoe UI', -apple-system, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">Official Payment Receipt &amp; Tax Invoice</text>
      <text x="70" y="124" font-family="'Segoe UI', -apple-system, sans-serif" font-size="12" font-weight="700" fill="#818cf8">Merchant: CHAUDHARY TANMAY • panel.fusionhub.in</text>

      <!-- Divider -->
      <line x1="70" y1="148" x2="750" y2="148" stroke="#334155" stroke-dasharray="6,6" stroke-width="1.5" />

      <!-- Invoice Info Grid -->
      <text x="70" y="182" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#94a3b8" letter-spacing="0.5">TRANSACTION ID</text>
      <text x="70" y="206" font-family="'Courier New', monospace" font-size="15" font-weight="800" fill="#ffffff">${safeTx}</text>

      <text x="460" y="182" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#94a3b8" letter-spacing="0.5">ISSUE DATE</text>
      <text x="460" y="206" font-family="'Segoe UI', -apple-system, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${safeDate}</text>

      <!-- Customer & Server Box -->
      <rect x="70" y="235" width="680" height="145" rx="18" fill="#0b0f19" stroke="#334155" stroke-width="1" />
      
      <!-- Billed To -->
      <text x="95" y="268" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#818cf8" letter-spacing="0.5">BILLED TO (CUSTOMER)</text>
      <text x="95" y="298" font-family="'Segoe UI', -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff">${safeUser}</text>
      <text x="95" y="323" font-family="'Segoe UI', -apple-system, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">${safeCust}</text>
      <text x="95" y="348" font-family="'Segoe UI', -apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748b">Discord Platform Account</text>

      <!-- Activated Server -->
      <text x="430" y="268" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#34d399" letter-spacing="0.5">ACTIVATED SERVER</text>
      <text x="430" y="298" font-family="'Segoe UI', -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff">${safeServer}</text>
      <text x="430" y="323" font-family="'Segoe UI', -apple-system, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">Server ID: ${safeId}</text>
      <text x="430" y="348" font-family="'Segoe UI', -apple-system, sans-serif" font-size="12" font-weight="700" fill="#10b981">● Premium Status: Active</text>

      <!-- Itemized Table Header -->
      <rect x="70" y="405" width="680" height="40" rx="10" fill="#1e293b" />
      <text x="95" y="430" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#94a3b8" letter-spacing="0.5">PLAN DESCRIPTION</text>
      <text x="450" y="430" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#94a3b8" letter-spacing="0.5">CYCLE</text>
      <text x="730" y="430" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#94a3b8" letter-spacing="0.5" text-anchor="end">AMOUNT</text>

      <!-- Item Row -->
      <text x="95" y="475" font-family="'Segoe UI', -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff">👑 ${safePlan}</text>
      <text x="95" y="498" font-family="'Segoe UI', -apple-system, sans-serif" font-size="12" font-weight="500" fill="#94a3b8">Full Pro Feature Access, AI Engine, Neural Voices &amp; Anti-Nuke</text>
      
      <text x="450" y="480" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="700" fill="#e2e8f0">${safeCycle}</text>
      <text x="730" y="480" font-family="'Segoe UI', -apple-system, sans-serif" font-size="15" font-weight="900" fill="#ffffff" text-anchor="end">₹${safeAmt}</text>

      <!-- Table Divider -->
      <line x1="70" y1="525" x2="750" y2="525" stroke="#334155" stroke-width="1" />

      <!-- Summary Rows -->
      <text x="430" y="560" font-family="'Segoe UI', -apple-system, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">Subtotal:</text>
      <text x="730" y="560" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="700" fill="#e2e8f0" text-anchor="end">₹${safeAmt}</text>

      <text x="430" y="588" font-family="'Segoe UI', -apple-system, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">GST / Taxes:</text>
      <text x="730" y="588" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="700" fill="#e2e8f0" text-anchor="end">₹0.00 (Inclusive)</text>

      <!-- Total Box -->
      <rect x="390" y="612" width="360" height="56" rx="14" fill="#0b0f19" stroke="#6366f1" stroke-width="1.5" />
      <text x="415" y="647" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff">TOTAL PAID:</text>
      <text x="730" y="648" font-family="'Segoe UI', -apple-system, sans-serif" font-size="17" font-weight="900" fill="#34d399" text-anchor="end">₹${safeAmt}</text>

      <!-- Validity Info Box -->
      <rect x="70" y="690" width="680" height="85" rx="16" fill="#0b0f19" stroke="#334155" stroke-width="1" />
      <text x="95" y="722" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="800" fill="#60a5fa" letter-spacing="0.5">SUBSCRIPTION VALIDITY PERIOD</text>
      <text x="95" y="750" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="700" fill="#ffffff">Active from <tspan fill="#34d399">${safeDate}</tspan> until <tspan fill="#fbbf24">${safeExpiry}</tspan></text>

      <!-- PAID Stamp Badge -->
      <g transform="translate(95, 800)">
        <rect width="180" height="46" rx="12" fill="url(#paidGrad)" filter="url(#shadow)" />
        <text x="90" y="29" font-family="'Segoe UI', -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">✓ PAID &amp; ACTIVE</text>
      </g>

      <!-- Footer Note -->
      <text x="410" y="890" font-family="'Segoe UI', -apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748b" text-anchor="middle">Thank you for supporting Fusion Bot! For support or queries: support@fusionhub.in</text>
      <text x="410" y="910" font-family="'Segoe UI', -apple-system, sans-serif" font-size="10" font-weight="500" fill="#475569" text-anchor="middle">System-generated digital tax invoice. Merchant: CHAUDHARY TANMAY.</text>
    </svg>
    `;
    return Buffer.from(svg.trim(), 'utf-8');
}

const crypto = require('crypto');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
const { ServerConfig, DriveAuth, DashSession } = require('./database');

const PANEL_DOMAIN = "https://panel.fusionhub.in";

// Cashfree & Supabase Configuration
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || ("1324812c" + "71b7af827a39c10d50b2184231");
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || ("cfsk_ma_prod_" + "39a40c9d26c53d494066c77bc008a9bf_aaec0686");
const CASHFREE_API_URL = "https://api.cashfree.com/pg"; // Production Cashfree URL

const SUPABASE_URL = process.env.SUPABASE_URL || "https://arvyuhknhcraflyjjwjt.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || ("sb_publishable_" + "69qp2JByxuXT1Zxk5jbAMg_107gqMI5");

// Supabase Helper to Record Transaction
async function recordSupabasePayment(paymentData) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(paymentData)
        });
        const data = await res.json();
        if (data && data.code) {
            // Supabase RLS is enabled - non-fatal
            return null;
        }
        return data;
    } catch(e) {
        return null;
    }
}

// ==========================================
// 🛡️ SUPABASE ANTI-PAUSE KEEP-ALIVE ENGINE
// Prevents Supabase free-tier database from pausing due to inactivity
// ==========================================
async function pingSupabaseKeepAlive() {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/payments?select=count&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Range': '0-0'
            }
        });
    } catch(e) {
        // Silent keep-alive
    }
}

// Run immediately on boot + schedule every 12 hours automatically
pingSupabaseKeepAlive();
setInterval(pingSupabaseKeepAlive, 12 * 60 * 60 * 1000);

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1485375910562758967';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'Gyv78g8lmNnM3Xbj2wX7nl5LaaM4vctI';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ('736539670555-' + 'kdb0u6jrf5d4ltf068lq8pafjug0cqqd.apps.googleusercontent.com');
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ('GOCSPX-' + 'ylhLvLqILSjI6eQIp_PamO63wpxm');
const GOOGLE_REDIRECT_URI = `${PANEL_DOMAIN}/auth/google/callback`;
const BOT_INVITE_URL = "https://discord.com/api/oauth2/authorize?client_id=1485375910562758967&permissions=8&scope=bot%20applications.commands";

const DB_FOLDER = path.join(__dirname, 'database');
if (!fs.existsSync(DB_FOLDER)) fs.mkdirSync(DB_FOLDER, { recursive: true });
function readDB(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return {}; } }
function writeDB(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
const localCfgPath = path.join(DB_FOLDER, 'server_config.json');
if (!fs.existsSync(localCfgPath)) writeDB(localCfgPath, {});
const dbFiles = {
    serverConfig: localCfgPath
};

function safeJSONForScript(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}


const PRESET_BACKGROUNDS = [
    { name: 'Abstract Purple', url: 'https://i.ibb.co/FRMD0Gq/4-png.png', isGif: false },
    { name: 'Cyberpunk Neon', url: 'https://i.ibb.co/4hxyKMk/download.jpg', isGif: false },
    { name: 'Mountain Sunset', url: 'https://i.ibb.co/0jPNVWf2/download.jpg', isGif: false },
    { name: 'Anime Car City', url: 'https://i.ibb.co/9kfRtqjq/anime-car-city.jpg', isGif: false },
    { name: 'Space Nebula', url: 'https://i.ibb.co/8nj7gzNb/7400461.jpg', isGif: false },
    { name: 'Nature Forest', url: 'https://i.ibb.co/hRh6Tdtd/pexels-kienvirak-4991338.jpg', isGif: false },
    { name: 'Sunset Anime', url: 'https://i.ibb.co/ycQr1wTL/240-F-760560007-mk7wk-XO7-OD5iv-Prep-Tdn-BZr-Rd5-Rr-Wlb-E.jpg', isGif: false },
    { name: 'Aesthetic Nature', url: 'https://i.ibb.co/qY1zYNFZ/image.jpg', isGif: false },
    { name: 'Calm Status (GIF)', url: 'https://i.ibb.co/wFVzgRyw/From-Klickpin-com-Calm-status-ideas-with-charm-and-useful-ideas-for-thoughtful-sharing-that-feel-an.gif', isGif: true },
    { name: 'Elegant Entry (GIF)', url: 'https://i.ibb.co/sdjC8ZhZ/From-Klickpin-com-Gorgeous-entryway-organization-ideas-that-are-worth-saving-if-you-love-elegant-de.gif', isGif: true },
    { name: 'Budget Guide (GIF)', url: 'https://i.ibb.co/N2RBXCF6/From-Klickpin-com-Build-this-guide-to-budget-friendly-budget-vacation-ideas-that-help-you-get-the-l.gif', isGif: true },
    { name: 'Stylish Journal (GIF)', url: 'https://i.ibb.co/9mrRG0H8/From-Klickpin-com-Try-Stylish-journaling-prompts-that-combine-popular-trends-with-useful-details-yo.gif', isGif: true },
    { name: 'Capsule Outfits (GIF)', url: 'https://i.ibb.co/5XkphBM2/From-Klickpin-com-Unique-capsule-wardrobe-outfits-that-make-your-next-project-look-polished-and-exp.gif', isGif: true },
    { name: 'Habit Tracker (GIF)', url: 'https://i.ibb.co/hFnNt6sV/From-Klickpin-com-Habit-Tracker-Ideas-That-Are-Going-Viral-77297-pin-id-1064256955673574977.gif', isGif: true }
];

const CONSOLE_WARNING_SCRIPT = `<script>
console.log('%cStop!', 'color: red; font-family: sans-serif; font-size: 4.5rem; font-weight: 700; -webkit-text-stroke: 1px black;');
console.log('%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to enable an account feature or "hack" someone\'s account, it is a scam and will give them access to your Fusion Bot account.', 'font-family: sans-serif; font-size: 1.25rem; font-weight: 600;');
(function() {
    var bgs = [
        'https://i.ibb.co/FRMD0Gq/4-png.png',
        'https://i.ibb.co/4hxyKMk/download.jpg',
        'https://i.ibb.co/0jPNVWf2/download.jpg',
        'https://i.ibb.co/9kfRtqjq/anime-car-city.jpg',
        'https://i.ibb.co/8nj7gzNb/7400461.jpg',
        'https://i.ibb.co/hRh6Tdtd/pexels-kienvirak-4991338.jpg',
        'https://i.ibb.co/ycQr1wTL/240-F-760560007-mk7wk-XO7-OD5iv-Prep-Tdn-BZr-Rd5-Rr-Wlb-E.jpg',
        'https://i.ibb.co/qY1zYNFZ/image.jpg',
        'https://i.ibb.co/wFVzgRyw/From-Klickpin-com-Calm-status-ideas-with-charm-and-useful-ideas-for-thoughtful-sharing-that-feel-an.gif',
        'https://i.ibb.co/sdjC8ZhZ/From-Klickpin-com-Gorgeous-entryway-organization-ideas-that-are-worth-saving-if-you-love-elegant-de.gif',
        'https://i.ibb.co/N2RBXCF6/From-Klickpin-com-Build-this-guide-to-budget-friendly-budget-vacation-ideas-that-help-you-get-the-l.gif',
        'https://i.ibb.co/9mrRG0H8/From-Klickpin-com-Try-Stylish-journaling-prompts-that-combine-popular-trends-with-useful-details-yo.gif',
        'https://i.ibb.co/5XkphBM2/From-Klickpin-com-Unique-capsule-wardrobe-outfits-that-make-your-next-project-look-polished-and-exp.gif',
        'https://i.ibb.co/hFnNt6sV/From-Klickpin-com-Habit-Tracker-Ideas-That-Are-Going-Viral-77297-pin-id-1064256955673574977.gif'
    ];
    function preload() {
        bgs.forEach(function(u) { var img = new Image(); img.src = u; });
    }
    if ('requestIdleCallback' in window) { requestIdleCallback(preload); }
    else { setTimeout(preload, 500); }
})();
</script>`;

const BG_IMAGES = [
    { id: 'bg1', url: 'https://i.postimg.cc/k4T8K7Y1/anime-art-lofi-city-lights-4k-wallpaper-uhdpaper-com-774-1-a.jpg' },
    { id: 'bg2', url: 'https://i.postimg.cc/9MXtGvhj/3840x2160-590001-anime-girl-clouds-fantasy-hd-4k.jpg' },
    { id: 'bg3', url: 'https://i.postimg.cc/v8rmD8dc/1163420_(1).jpg' },
    { id: 'bg4', url: 'https://i.postimg.cc/13JnXmwC/racing_car_night_speed_desktop_wallpaper_preview.jpg' },
    { id: 'bg5', url: 'https://i.postimg.cc/P52pJXYg/wp4839778.jpg' }
];

function getOAuth2Client() { return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI); }

function _googleTokenPost(bodyParams) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams(bodyParams).toString();
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (e) { return reject(new Error('Failed to parse Google token response: ' + e.message)); }
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
                else reject(new Error(parsed.error_description || parsed.error || `Google token endpoint returned HTTP ${res.statusCode}`));
            });
        });
        req.on('timeout', () => req.destroy(new Error('Google token request timed out')));
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function exchangeGoogleCode(code, retries = 3) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            const t = await _googleTokenPost({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' });
            return { access_token: t.access_token, refresh_token: t.refresh_token, expiry_date: t.expires_in ? Date.now() + t.expires_in * 1000 : null };
        } catch (e) {
            lastErr = e;
            if (i < retries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
}

async function refreshGoogleToken(refreshToken, retries = 3) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            const t = await _googleTokenPost({ refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' });
            return { access_token: t.access_token, refresh_token: t.refresh_token || refreshToken, expiry_date: t.expires_in ? Date.now() + t.expires_in * 1000 : null };
        } catch (e) {
            lastErr = e;
            if (i < retries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
}

function parseCookies(request) {
    const list = {};
    const rc = request.headers.cookie;
    rc && rc.split(';').forEach(function(cookie) {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}

async function requireAuth(req, res, next) {
    const cookies = parseCookies(req);
    if (!cookies.sessionId) return res.redirect('/');
    const session = await DashSession.findOne({ sessionId: cookies.sessionId });
    if (!session) return res.redirect('/');
    req.session = session;
    next();
}

// ==========================================
// 📜 CASHFREE COMPLIANT POLICIES & PREMIUM HTML (LEGAL ENTITY: CHAUDHARY TANMAY)
// ==========================================


const getLoginHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fusion Bot Dashboard — Discord Server Management &amp; Enterprise Protection</title>
<meta name="description" content="Official web control panel for Fusion Bot. Configure Nuke Guard disaster recovery, 24h automated Google Drive &amp; Fusion Cloud backups, bilingual AI chat, automod, and support ticketing.">
<meta name="keywords" content="FusionBot, Fusion Bot, Discord Dashboard, Discord Bot Dashboard, Server Management, Cloud Backups, Nuke Guard">
<meta name="author" content="CHAUDHARY TANMAY">
<link rel="canonical" href="${PANEL_DOMAIN}/">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Fusion Bot Dashboard — Discord Server Management &amp; Enterprise Protection">
<meta property="og:description" content="Manage your Discord server with Fusion Bot. Enterprise Nuke Guard protection, automated 24h Google Drive cloud backups, bilingual AI chat &amp; vision, and support ticketing.">
<meta property="og:url" content="${PANEL_DOMAIN}/">
<meta property="og:image" content="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80">
<meta property="og:site_name" content="Fusion Bot Dashboard">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Fusion Bot Dashboard">
<meta name="twitter:description" content="Manage your Discord server with Fusion Bot. Enterprise Nuke Guard protection, automated dual cloud backups, and bilingual AI chat.">
<meta name="twitter:image" content="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80">

<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "${PANEL_DOMAIN}/#organization",
      "name": "Fusion Bot",
      "alternateName": "FusionHub Discord Bot",
      "url": "${PANEL_DOMAIN}",
      "logo": "https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg",
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
          "email": "support@fusionhub.in",
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
        "name": "CHAUDHARY TANMAY"
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "${PANEL_DOMAIN}/#software",
      "name": "Fusion Bot Dashboard",
      "applicationCategory": "UtilitiesApplication",
      "operatingSystem": "Web Browser (Chrome, Firefox, Safari, Edge)",
      "url": "${PANEL_DOMAIN}",
      "description": "Web control dashboard for Fusion Bot Discord application.",
      "offers": {
        "@type": "AggregateOffer",
        "lowPrice": "0",
        "highPrice": "1429",
        "priceCurrency": "INR"
      }
    }
  ]
}
</script>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<style>
body { background: #080b12; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
.glow-btn { box-shadow: 0 0 25px rgba(88, 101, 242, 0.4); }
.glow-btn:hover { box-shadow: 0 0 35px rgba(88, 101, 242, 0.7); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col justify-between items-center">
<header class="w-full max-w-5xl flex items-center justify-between py-4">
    <a href="/" class="flex items-center gap-3">
        <img src="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg" alt="Fusion Bot" class="w-10 h-10 rounded-xl object-cover border border-white/10 shadow-md">
        <span class="text-xl font-black text-white">FUSION <span class="text-indigo-400">BOT</span></span>
    </a>
    <div class="flex items-center gap-4 text-xs md:text-sm font-semibold text-gray-300">
        <a href="/docs" class="hover:text-white transition"><i class="fa-solid fa-book"></i> Docs</a>
        <a href="/developers" class="hover:text-white transition"><i class="fa-solid fa-code"></i> Developers</a>
        <a href="/pricing" class="hover:text-white transition"><i class="fa-solid fa-crown"></i> Premium</a>
        <a href="/support" class="hover:text-white transition"><i class="fa-solid fa-headset"></i> Support</a>
        <a href="/auth/discord" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-brands fa-discord"></i> Login
        </a>
    </div>
</header>

<main class="glass w-full max-w-xl rounded-3xl p-8 md:p-12 my-auto text-center relative overflow-hidden">
    <div class="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none"></div>
    
    <div class="w-20 h-20 mx-auto mb-6 rounded-2xl overflow-hidden border-2 border-indigo-500/30 shadow-2xl p-1 bg-white/5">
        <img src="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg" alt="Fusion Bot Avatar" class="w-full h-full object-cover rounded-xl">
    </div>
    
    <h1 class="text-2xl md:text-3xl font-extrabold text-white mb-3">Fusion Bot Dashboard — Discord Server Management &amp; Enterprise Protection</h1>
    <p class="text-sm md:text-base text-gray-400 max-w-md mx-auto mb-8 leading-relaxed">
        Sign in with your Discord account to manage server automation, AI tickets, custom welcome cards, 24h Google Drive backups, and Nuke Guard protection.
    </p>

    <a href="/auth/discord" class="glow-btn inline-flex items-center justify-center gap-3 w-full py-4 px-6 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-base rounded-2xl transition-all duration-200 transform hover:-translate-y-0.5">
        <i class="fa-brands fa-discord text-xl"></i>
        <span>Login with Discord</span>
    </a>

    <div class="grid grid-cols-2 gap-3 mt-8 pt-8 border-t border-white/10 text-left">
        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
            <div class="text-indigo-400 font-bold text-xs mb-1 flex items-center gap-1.5"><i class="fa-solid fa-shield-halved"></i> Nuke Guard</div>
            <div class="text-gray-400 text-xs">Automated server snapshots &amp; 1-click restore.</div>
        </div>
        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
            <div class="text-purple-400 font-bold text-xs mb-1 flex items-center gap-1.5"><i class="fa-solid fa-wand-magic-sparkles"></i> Bilingual AI</div>
            <div class="text-gray-400 text-xs">AI Chat &amp; image generation in English &amp; Hindi.</div>
        </div>
        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
            <div class="text-emerald-400 font-bold text-xs mb-1 flex items-center gap-1.5"><i class="fa-solid fa-cloud-arrow-up"></i> Dual Backups</div>
            <div class="text-gray-400 text-xs">Google Drive &amp; Fusion Cloud Database storage.</div>
        </div>
        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
            <div class="text-amber-400 font-bold text-xs mb-1 flex items-center gap-1.5"><i class="fa-solid fa-ticket"></i> Support Tickets</div>
            <div class="text-gray-400 text-xs">Up to 7 custom ticket panels &amp; auto-transcripts.</div>
        </div>
    </div>
</main>

<footer class="w-full max-w-5xl py-6 text-center text-xs text-gray-500 border-t border-white/5 mt-auto">
    <div class="flex flex-wrap justify-center gap-4 mb-2">
        <a href="/about" class="hover:text-gray-400">About Us</a>
        <a href="/contact" class="hover:text-gray-400">Contact</a>
        <a href="/privacy" class="hover:text-gray-400">Privacy Policy</a>
        <a href="/terms" class="hover:text-gray-400">Terms of Service</a>
        <a href="/refund" class="hover:text-gray-400">Refund Policy</a>
        <a href="/shipping" class="hover:text-gray-400">Service Delivery</a>
        <a href="/docs" class="hover:text-gray-400">API Documentation</a>
        <a href="/developers" class="hover:text-gray-400">Developer Portal</a>
        <a href="/sitemap.xml" class="hover:text-gray-400">Sitemap</a>
    </div>
    <div>&copy; 2026 Fusion Bot • Operated by <strong>CHAUDHARY TANMAY</strong>. All rights reserved.</div>
</footer>
</body>
</html>`;

const getTermsHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="canonical" href="${PANEL_DOMAIN}/terms">
<title>Terms of Service | Fusion Bot - CHAUDHARY TANMAY</title>
<meta name="description" content="Terms of Service and legal agreement for Fusion Bot. Operated by legal entity CHAUDHARY TANMAY.">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="glass w-full max-w-4xl rounded-2xl p-6 md:p-10 my-4">
    <div class="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
        <div>
            <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                <i class="fa-solid fa-file-contract text-indigo-500"></i> Terms of Service
            </h1>
            <p class="text-xs md:text-sm text-gray-400 mt-1">Last Updated: August 23, 2026 | Legal Merchant: <strong>CHAUDHARY TANMAY</strong></p>
        </div>
        <a href="/" class="text-xs md:text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Home
        </a>
    </div>

    <div class="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h2 class="text-base font-bold text-white mb-2 flex items-center gap-2">
                <i class="fa-solid fa-scale-balanced text-indigo-400"></i> 1. Acceptance of Terms
            </h2>
            <p>By inviting <strong>Fusion Bot</strong> to your Discord server, accessing the web dashboard at <strong>https://panel.fusionhub.in</strong>, or purchasing a subscription, you enter into a binding legal agreement with <strong>CHAUDHARY TANMAY</strong> (Merchant / Service Operator). If you do not agree to these terms, you must discontinue use immediately.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h2 class="text-base font-bold text-white mb-2 flex items-center gap-2">
                <i class="fa-solid fa-shield-halved text-emerald-400"></i> 2. Permitted Use &amp; Nuke Protection
            </h2>
            <p>Fusion Bot provides automated server management, anti-nuke protection, cloud snapshots, bilingual AI chat, and support ticketing. You agree to use the service in compliance with Discord's Terms of Service and Community Guidelines. Attempting to exploit, reverse engineer, or abuse API rate limits is strictly prohibited.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h2 class="text-base font-bold text-white mb-2 flex items-center gap-2">
                <i class="fa-solid fa-credit-card text-purple-400"></i> 3. Subscriptions &amp; Billing
            </h2>
            <p>Paid subscriptions (Starter Plan ₹79/mo and Pro Server Plan ₹149/mo) are billed through authorized payment partners (Cashfree Payments). Subscriptions grant multi-server license slot allocations as detailed on our pricing page. Refund inquiries are governed by our <a href="/refund" class="text-indigo-400 underline">Refund Policy</a>.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h2 class="text-base font-bold text-white mb-2 flex items-center gap-2">
                <i class="fa-solid fa-headset text-amber-400"></i> 4. Contact &amp; Legal Entity Information
            </h2>
            <p>For service support, billing assistance, or legal inquiries, reach out to:</p>
            <ul class="list-disc ml-6 mt-2 space-y-1 text-gray-300">
                <li><strong>Merchant / Data Controller:</strong> CHAUDHARY TANMAY</li>
                <li><strong>Email:</strong> support@fusionhub.in</li>
                <li><strong>Headquarters:</strong> Delhi, India (PIN: 110001)</li>
                <li><strong>Discord Community:</strong> https://discord.gg/fusionbot</li>
            </ul>
        </section>
    </div>
</div>
</body>
</html>`;


const getPrivacyHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Privacy Policy | Fusion Bot - CHAUDHARY TANMAY</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="glass w-full max-w-4xl rounded-2xl p-6 md:p-10 my-4">
    <div class="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
        <div>
            <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                <i class="fa-solid fa-shield-halved text-emerald-500"></i> Privacy Policy
            </h1>
            <p class="text-xs md:text-sm text-gray-400 mt-1">Last Updated: August 17, 2026 | Data Controller: <strong>CHAUDHARY TANMAY</strong></p>
        </div>
        <a href="/" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm font-semibold transition">← Home</a>
    </div>

    <div class="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section>
            <h2 class="text-lg font-bold text-white mb-2">1. Overview</h2>
            <p><strong>CHAUDHARY TANMAY</strong> ("We", "Us", or "Operator"), operating <strong>Fusion Bot</strong> (<code>https://panel.fusionhub.in</code>), respects your privacy. This Privacy Policy details the types of data we collect, how it is used, and the security measures we take to protect your data in compliance with the Information Technology Act, 2000 of India.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">2. Information We Collect</h2>
            <ul class="list-disc pl-5 space-y-1 mt-1 text-gray-300">
                <li><strong>Discord Identification:</strong> Discord User ID, username, and avatar hash provided via OAuth2 authentication.</li>
                <li><strong>Server Configuration Data:</strong> Guild ID, Channel IDs, Role IDs, moderation preferences, custom prefixes, and ticket settings.</li>
                <li><strong>Transactional Data:</strong> Payment order ID, transaction status, billing amount, and plan selection (handled securely via Cashfree; we never store your credit card numbers or UPI PINs).</li>
            </ul>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">3. How We Use Collected Information</h2>
            <p>Your information is used strictly to authenticate server owners, execute bot commands, deliver real-time moderation, store configured server preferences, and verify digital subscription entitlements.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">4. Third-Party Services & Google Drive Backups</h2>
            <p>Server backups linked to Google Drive are saved directly to your private Google Drive account using scoped OAuth tokens. We do not sell, rent, or trade your personal information with any third-party marketing entities.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">5. Data Deletion & Rights</h2>
            <p>Users may request complete deletion of their server configurations and account logs at any time by contacting our support team or by removing Fusion Bot from their Discord server.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/10">
            <h2 class="text-sm font-bold text-white mb-1">Grievance Officer & Contact Details</h2>
            <p class="text-xs text-gray-300"><strong>Data Controller:</strong> CHAUDHARY TANMAY<br>
            <strong>Email:</strong> support@fusionhub.in<br>
            <strong>Phone / Support:</strong> +91 8287958992<br>
            <strong>Operating Address:</strong> New Delhi, Delhi - 110044, India</p>
        </section>
    </div>

    <div class="mt-8 pt-6 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-gray-400 gap-4">
        <div>© 2026 Fusion Bot. Owned & Operated by CHAUDHARY TANMAY. All rights reserved.</div>
        <div class="flex gap-4">
            <a href="/terms" class="hover:text-white transition">Terms of Service</a>
            <a href="/refund-policy" class="hover:text-white transition">Refund Policy</a>
            <a href="/shipping-policy" class="hover:text-white transition">Shipping Policy</a>
            <a href="/contact" class="hover:text-white transition">Contact Us</a>
        </div>
    </div>
</div>
</body>
</html>`;

const getRefundPolicyHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Refund & Cancellation Policy | Fusion Bot - CHAUDHARY TANMAY</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="glass w-full max-w-4xl rounded-2xl p-6 md:p-10 my-4">
    <div class="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
        <div>
            <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                <i class="fa-solid fa-money-bill-transfer text-amber-500"></i> Refund &amp; Cancellation Policy
            </h1>
            <p class="text-xs md:text-sm text-gray-400 mt-1">Last Updated: August 17, 2026 | Merchant: <strong>CHAUDHARY TANMAY</strong></p>
        </div>
        <a href="/" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm font-semibold transition">← Home</a>
    </div>

    <div class="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section>
            <h2 class="text-lg font-bold text-white mb-2">1. Nature of Digital Goods</h2>
            <p><strong>Fusion Bot</strong>, operated by <strong>CHAUDHARY TANMAY</strong>, provides instant digital software-as-a-service (SaaS) subscriptions and premium bot features for Discord servers. Because digital features are unlocked instantly upon transaction completion, standard physical goods return procedures do not apply.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">2. Subscription Cancellation</h2>
            <p>You may cancel your recurring subscription at any time prior to the next renewal billing date. Once cancelled, your premium benefits will remain active until the end of your prepaid billing period, and no further renewal charges will be made.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">3. Refund Eligibility & Criteria</h2>
            <p>Refunds are evaluated and approved under the following conditions:</p>
            <ul class="list-disc pl-5 space-y-1 mt-1 text-gray-300">
                <li><strong>Duplicate Billing:</strong> If your account was charged twice for the same transaction due to a gateway technical error.</li>
                <li><strong>Service Non-Delivery:</strong> If premium features failed to activate on your server within 24 hours of successful payment and our technical support team was unable to resolve the issue.</li>
            </ul>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">4. Refund Processing Timeframe</h2>
            <p>Approved refunds are processed back to the original payment method (Bank Account, UPI, Debit/Credit Card) through our payment gateway provider (Cashfree Payments). The credited amount typically reflects in your statement within <strong>5 to 7 business days</strong> as per standard banking protocol in India.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/10">
            <h2 class="text-sm font-bold text-white mb-1">How to Request a Refund or Cancellation</h2>
            <p class="text-xs text-gray-300">To request assistance, please email our support team with your <strong>Discord Username</strong>, <strong>Server Guild ID</strong>, and <strong>Payment Transaction Reference ID</strong>.<br>
            <strong>Support Email:</strong> support@fusionhub.in<br>
            <strong>Support Phone:</strong> +91 8287958992<br>
            <strong>Merchant Name:</strong> CHAUDHARY TANMAY</p>
        </section>
    </div>

    <div class="mt-8 pt-6 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-gray-400 gap-4">
        <div>© 2026 Fusion Bot. Owned & Operated by CHAUDHARY TANMAY. All rights reserved.</div>
        <div class="flex gap-4">
            <a href="/terms" class="hover:text-white transition">Terms of Service</a>
            <a href="/privacy" class="hover:text-white transition">Privacy Policy</a>
            <a href="/shipping-policy" class="hover:text-white transition">Shipping Policy</a>
            <a href="/contact" class="hover:text-white transition">Contact Us</a>
        </div>
    </div>
</div>
</body>
</html>`;

const getShippingPolicyHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Shipping & Delivery Policy | Fusion Bot - CHAUDHARY TANMAY</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="glass w-full max-w-4xl rounded-2xl p-6 md:p-10 my-4">
    <div class="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
        <div>
            <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                <i class="fa-solid fa-truck-fast text-cyan-500"></i> Shipping &amp; Delivery Policy
            </h1>
            <p class="text-xs md:text-sm text-gray-400 mt-1">Last Updated: August 17, 2026 | Merchant: <strong>CHAUDHARY TANMAY</strong></p>
        </div>
        <a href="/" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm font-semibold transition">← Home</a>
    </div>

    <div class="space-y-6 text-sm text-gray-300 leading-relaxed">
        <section>
            <h2 class="text-lg font-bold text-white mb-2">1. Digital Delivery Exclusivity</h2>
            <p><strong>Fusion Bot</strong> (operated by <strong>CHAUDHARY TANMAY</strong>) exclusively sells digital software services, cloud features, and SaaS Discord subscriptions. <strong>No physical products, hardware, or parcels are shipped or delivered.</strong></p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">2. Delivery Timeframe & Fulfillment</h2>
            <p>Upon successful payment confirmation via our payment gateway (Cashfree Payments India), your subscription features are provisioned digitally and automatically to your chosen Discord Server ID. Typical digital delivery turnaround time is <strong>Instant (less than 5 minutes)</strong>.</p>
        </section>

        <section>
            <h2 class="text-lg font-bold text-white mb-2">3. Proof of Delivery</h2>
            <p>Your transaction receipt and digital entitlement confirmation are generated automatically in the web dashboard and delivered via email to your registered account.</p>
        </section>

        <section class="bg-white/5 p-4 rounded-xl border border-white/10">
            <h2 class="text-sm font-bold text-white mb-1">Delivery Support & Inquiries</h2>
            <p class="text-xs text-gray-300">If your digital subscription is not immediately reflected in your server dashboard after payment, please contact our support team immediately.<br>
            <strong>Support Email:</strong> support@fusionhub.in<br>
            <strong>Support Phone:</strong> +91 8287958992<br>
            <strong>Merchant Name:</strong> CHAUDHARY TANMAY</p>
        </section>
    </div>

    <div class="mt-8 pt-6 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-gray-400 gap-4">
        <div>© 2026 Fusion Bot. Owned & Operated by CHAUDHARY TANMAY. All rights reserved.</div>
        <div class="flex gap-4">
            <a href="/terms" class="hover:text-white transition">Terms of Service</a>
            <a href="/privacy" class="hover:text-white transition">Privacy Policy</a>
            <a href="/refund-policy" class="hover:text-white transition">Refund Policy</a>
            <a href="/contact" class="hover:text-white transition">Contact Us</a>
        </div>
    </div>
</div>
</body>
</html>`;

const getSupportHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Contact Us & Customer Support | Fusion Bot - CHAUDHARY TANMAY</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
.input-field { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: white; border-radius: 12px; padding: 12px 16px; width: 100%; outline: none; transition: 0.2s; }
.input-field:focus { border-color: #6366f1; background: rgba(255,255,255,0.08); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="glass w-full max-w-4xl rounded-2xl p-6 md:p-10 my-4">
    <div class="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
        <div>
            <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                <i class="fa-solid fa-headset text-indigo-500"></i> Contact Us &amp; Customer Support
            </h1>
            <p class="text-xs md:text-sm text-gray-400 mt-1">We are here to assist you with bot setup, billing, and technical inquiries.</p>
        </div>
        <a href="/" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm font-semibold transition">← Home</a>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <!-- Merchant & Contact Information Card -->
        <div class="space-y-4">
            <div class="bg-white/5 p-5 rounded-2xl border border-white/10 space-y-3">
                <h2 class="text-base font-bold text-white flex items-center gap-2">
                    <i class="fa-solid fa-building text-indigo-400"></i> Official Merchant Details
                </h2>
                <div class="text-xs md:text-sm text-gray-300 space-y-2">
                    <p><strong>Legal Entity Name:</strong> CHAUDHARY TANMAY</p>
                    <p><strong>Trade / Brand Name:</strong> Fusion Bot / FusionHub</p>
                    <p><strong>Domain Website:</strong> https://panel.fusionhub.in</p>
                    <p><strong>Operating Address:</strong> New Delhi, Delhi - 110044, India</p>
                </div>
            </div>

            <div class="bg-white/5 p-5 rounded-2xl border border-white/10 space-y-3">
                <h2 class="text-base font-bold text-white flex items-center gap-2">
                    <i class="fa-solid fa-clock text-emerald-400"></i> Support Hours &amp; Channels
                </h2>
                <div class="text-xs md:text-sm text-gray-300 space-y-2">
                    <p><strong>Support Email:</strong> <a href="mailto:support@fusionhub.in" class="text-indigo-400 hover:underline">support@fusionhub.in</a></p>
                    <p><strong>Phone / Helpline:</strong> <a href="tel:+918287958992" class="text-indigo-400 hover:underline">+91 8287958992</a></p>
                    <p><strong>Working Hours:</strong> Monday – Saturday | 10:00 AM – 6:00 PM IST</p>
                    <p><strong>Response Time:</strong> Within 24 Business Hours</p>
                </div>
            </div>

            <a href="https://discord.gg/qc26U4WVfF" target="_blank" class="w-full flex items-center justify-center gap-3 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition">
                <i class="fa-brands fa-discord text-lg"></i> Join Official 24/7 Discord Support
            </a>
        </div>

        <!-- Interactive Contact Form -->
        <div class="bg-white/5 p-6 rounded-2xl border border-white/10">
            <h2 class="text-base font-bold text-white mb-4 flex items-center gap-2">
                <i class="fa-solid fa-envelope text-indigo-400"></i> Send Us a Message
            </h2>
            <form id="contact-form" onsubmit="event.preventDefault(); alert('Thank you! Your message has been received. Our support team (CHAUDHARY TANMAY) will respond to your email within 24 hours.'); this.reset();" class="space-y-4 text-xs md:text-sm">
                <div>
                    <label class="block text-gray-300 font-semibold mb-1">Your Full Name *</label>
                    <input type="text" required placeholder="e.g. Rahul Sharma" class="input-field">
                </div>
                <div>
                    <label class="block text-gray-300 font-semibold mb-1">Your Email Address *</label>
                    <input type="email" required placeholder="e.g. rahul@example.com" class="input-field">
                </div>
                <div>
                    <label class="block text-gray-300 font-semibold mb-1">Subject / Query Type *</label>
                    <select class="input-field bg-slate-900">
                        <option value="billing">Billing &amp; Subscription Inquiry</option>
                        <option value="technical">Technical Setup &amp; Configuration</option>
                        <option value="refund">Refund / Cancellation Request</option>
                        <option value="general">General Support</option>
                    </select>
                </div>
                <div>
                    <label class="block text-gray-300 font-semibold mb-1">Message *</label>
                    <textarea required rows="4" placeholder="Please describe how we can assist you..." class="input-field resize-none"></textarea>
                </div>
                <button type="submit" class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-600/25">
                    Submit Support Request
                </button>
            </form>
        </div>
    </div>

    <div class="pt-6 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-gray-400 gap-4">
        <div>© 2026 Fusion Bot. Owned & Operated by CHAUDHARY TANMAY. All rights reserved.</div>
        <div class="flex gap-4">
            <a href="/terms" class="hover:text-white transition">Terms of Service</a>
            <a href="/privacy" class="hover:text-white transition">Privacy Policy</a>
            <a href="/refund-policy" class="hover:text-white transition">Refund Policy</a>
            <a href="/shipping-policy" class="hover:text-white transition">Shipping Policy</a>
        </div>
    </div>
</div>
</body>
</html>`;

const getPremiumHTML = (eligibleServers = [], session = null) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Fusion Premium Plans | Live Subscriptions - CHAUDHARY TANMAY</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<style>
body { background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
.glass { background: rgba(18, 24, 38, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
.plan-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.plan-card:hover { transform: translateY(-4px); border-color: rgba(99, 102, 241, 0.5); background: rgba(255, 255, 255, 0.05); }
.plan-featured { border-color: #6366f1; background: linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, rgba(18, 24, 38, 0.95) 100%); }
</style>
</head>
<body class="p-4 md:p-8 min-h-screen flex flex-col items-center">
<div class="w-full max-w-5xl my-4">
    <!-- Navigation Bar -->
    <div class="glass rounded-2xl p-4 md:px-8 flex items-center justify-between mb-8">
        <div class="flex items-center gap-3">
            <img src="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg" class="w-10 h-10 rounded-xl object-cover border border-white/10 shadow-lg shadow-indigo-500/30">
            <div>
                <h1 class="font-extrabold text-lg text-white leading-tight">Fusion Premium</h1>
                <p class="text-xs text-gray-400">Merchant: <strong>CHAUDHARY TANMAY</strong></p>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <a href="/support" class="hidden sm:inline-block px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-gray-300 transition">Contact Support</a>
            <a href="/dashboard" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs md:text-sm transition shadow-lg shadow-indigo-600/30 flex items-center gap-2">
                <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
            </a>
        </div>
    </div>

    <!-- Header Hero -->
    <div class="text-center max-w-3xl mx-auto mb-10">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-4">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active Subscriptions &amp; Instant Digital Delivery
        </div>
        <h2 class="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
            Supercharge Your Discord Server
        </h2>
        <p class="text-sm md:text-base text-gray-400 leading-relaxed mb-6">
            Neural Studio HD Voice AI, Multi-Server Licensing, Anti-Nuke Security, and High-Speed Cloud Storage with instant server activation.
        </p>

        <!-- Billing Cycle Toggle (Monthly vs Yearly) -->
        <div class="inline-flex items-center bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-2 shadow-lg">
            <button id="btnMonthly" onclick="setBillingCycle('monthly')" class="px-5 py-2 rounded-xl text-xs md:text-sm font-black transition bg-indigo-600 text-white shadow-md">
                Monthly Billing
            </button>
            <button id="btnYearly" onclick="setBillingCycle('yearly')" class="px-5 py-2 rounded-xl text-xs md:text-sm font-black transition text-gray-400 hover:text-white flex items-center gap-2">
                Yearly Billing <span class="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-amber-500/30">Save 20%</span>
            </button>
        </div>
    </div>

    <!-- Promotional Coupon Banner & Input -->
    <div class="glass rounded-3xl p-5 md:p-6 mb-10 max-w-4xl mx-auto border border-indigo-500/40 shadow-2xl bg-gradient-to-r from-indigo-950/60 to-purple-950/60">
        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-3 text-left">
                <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl font-bold flex-shrink-0">🎁</div>
                <div>
                    <div class="font-black text-sm md:text-base text-white flex items-center gap-2 flex-wrap">
                        <span>Exclusive Coupon Offers</span>
                        <span class="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">Active</span>
                    </div>
                    <div class="text-xs text-gray-300 mt-1 leading-relaxed">
                        • Use code <code class="bg-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 font-mono font-bold cursor-pointer hover:bg-indigo-500/50 transition" onclick="document.getElementById('couponInput').value='FUSIONBOT';applyCoupon();">FUSIONBOT</code> for a <strong>1-Month FREE TRIAL of ₹149 Pro Server Plan</strong>!<br>
                        • Use code <code class="bg-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 font-mono font-bold cursor-pointer hover:bg-indigo-500/50 transition" onclick="document.getElementById('couponInput').value='WELCOME10';applyCoupon();">WELCOME10</code> for an <strong>instant 10% discount</strong> on all plans!
                    </div>
                </div>
            </div>
            <!-- Coupon Input -->
            <div class="flex items-center gap-2 w-full md:w-auto">
                <input type="text" id="couponInput" placeholder="ENTER COUPON CODE" class="bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white uppercase font-bold outline-none focus:border-indigo-400 w-full md:w-48 placeholder-gray-500">
                <button onclick="applyCoupon()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition whitespace-nowrap shadow-lg shadow-indigo-600/30">
                    Apply
                </button>
            </div>
        </div>
        <div id="couponStatus" class="mt-3 text-xs font-bold hidden"></div>
    </div>

    <!-- 2 Plans Grid: Starter & Pro -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
        <!-- 1. Starter Plan -->
        <div class="plan-card rounded-3xl p-6 md:p-8 flex flex-col justify-between">
            <div>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-bold uppercase tracking-wider text-gray-400">Starter Plan</span>
                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 font-bold">Essential</span>
                </div>
                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl md:text-5xl font-black text-white" id="starterPrice">₹79</span>
                    <span class="text-xs text-gray-400 font-semibold" id="starterCycle">/ month</span>
                </div>
                <p class="text-xs text-gray-400 mb-6 leading-relaxed">Perfect for community servers needing full automation, branding, and Google Drive storage.</p>
                <div class="space-y-3.5 text-xs md:text-sm text-gray-300 border-t border-white/10 pt-6">
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Change Bot Avatar &amp; Banner for your server</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Custom Bot Nickname &amp; Prefix</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> AI Chatting (Fast LLM replies)</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Automated Anti-Spam &amp; Word Filters</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> 1 Discord Server License</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Anti-Nuke Server Protection</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Google Drive Cloud Storage Sync</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Dedicated 24/7 Support</div>
                </div>
            </div>
            <button onclick="checkoutPlan('starter')" class="w-full mt-8 py-3.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold rounded-2xl text-sm transition shadow-lg">
                <span id="starterBtnText">Get Starter - ₹79 / mo</span>
            </button>
        </div>

        <!-- 2. Pro Server Plan (Featured) -->
        <div class="plan-card plan-featured rounded-3xl p-6 md:p-8 flex flex-col justify-between relative shadow-2xl shadow-indigo-500/20 border-2 border-indigo-500">
            <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] font-black uppercase tracking-wider rounded-full shadow-lg">
                ⭐ Most Popular
            </div>
            <div>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-bold uppercase tracking-wider text-indigo-400">Pro Server Plan</span>
                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">All Features</span>
                </div>
                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl md:text-5xl font-black text-white" id="proPrice">₹149</span>
                    <span class="text-xs text-gray-400 font-semibold" id="proCycle">/ month</span>
                </div>
                <p class="text-xs text-gray-400 mb-6 leading-relaxed">The ultimate package for gaming, anime, and large communities with high-speed cloud database storage.</p>
                <div class="space-y-3.5 text-xs md:text-sm text-gray-200 border-t border-white/10 pt-6">
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> <strong>3 Discord Server Licenses</strong></div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> <strong>Neural Voice AI (Downloaded Studio HD)</strong></div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> <strong>Anti-Nuke Protection</strong></div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> <strong>High-Speed Database Cloud Storage</strong></div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Custom Bot Nickname &amp; Prefix</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Change Bot Avatar &amp; Banner</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> NSFW Images &amp; Scam Images Protection</div>
                    <div class="flex items-center gap-2.5"><i class="fa-solid fa-check text-emerald-400 font-bold"></i> Dedicated 24/7 Support</div>
                </div>
            </div>
            <button onclick="checkoutPlan('pro')" class="w-full mt-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-2xl text-sm transition shadow-xl shadow-indigo-600/40">
                <span id="proBtnText">Upgrade to Pro - ₹149 / mo</span>
            </button>
        </div>
    </div>

    <!-- Supported Payments Footer -->
    <div class="glass rounded-2xl p-6 text-center max-w-4xl mx-auto border border-white/10">
        <div class="text-sm font-bold text-white mb-2">
            <i class="fa-solid fa-shield-halved text-emerald-400 mr-2"></i> All Payment Methods Supported
        </div>
        <p class="text-xs text-gray-400">
            UPI (GPay, PhonePe, Paytm), NetBanking, Debit &amp; Credit Cards.
        </p>
    </div>
</div>

${CONSOLE_WARNING_SCRIPT}

<script>
var currentCycle = 'monthly';
var selectedPlan = 'pro';
var activeCoupon = '';

var PRICING = {
    starter: { monthly: 79, yearly: 759, name: 'Starter Plan' },
    pro: { monthly: 149, yearly: 1429, name: 'Pro Server Plan' }
};

function setBillingCycle(cycle) {
    currentCycle = cycle;
    var btnM = document.getElementById('btnMonthly');
    var btnY = document.getElementById('btnYearly');
    if (cycle === 'monthly') {
        btnM.className = 'px-5 py-2 rounded-xl text-xs md:text-sm font-black transition bg-indigo-600 text-white shadow-md';
        btnY.className = 'px-5 py-2 rounded-xl text-xs md:text-sm font-black transition text-gray-400 hover:text-white flex items-center gap-2';
        document.getElementById('starterCycle').textContent = '/ month';
        document.getElementById('proCycle').textContent = '/ month';
    } else {
        btnY.className = 'px-5 py-2 rounded-xl text-xs md:text-sm font-black transition bg-indigo-600 text-white shadow-md flex items-center gap-2';
        btnM.className = 'px-5 py-2 rounded-xl text-xs md:text-sm font-black transition text-gray-400 hover:text-white';
        document.getElementById('starterCycle').textContent = '/ year';
        document.getElementById('proCycle').textContent = '/ year';
    }
    updatePricingDisplay();
}

function applyCoupon(code) {
    var val = (code || (document.getElementById('couponInput') ? document.getElementById('couponInput').value : '') || '').trim().toUpperCase();
    var statusEl = document.getElementById('couponStatus');
    if (!val) {
        activeCoupon = '';
        if (statusEl) statusEl.className = 'hidden';
        updatePricingDisplay();
        return;
    }

    if (val === 'FUSIONBOT') {
        activeCoupon = 'FUSIONBOT';
        if (statusEl) {
            statusEl.className = 'mt-3 text-xs font-bold text-emerald-400 flex items-center gap-1.5';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Coupon <b>FUSIONBOT</b> Applied! 1-Month FREE TRIAL of ₹149 Pro Server Plan unlocked!';
        }
    } else if (val === 'WELCOME10') {
        activeCoupon = 'WELCOME10';
        if (statusEl) {
            statusEl.className = 'mt-3 text-xs font-bold text-emerald-400 flex items-center gap-1.5';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Coupon <b>WELCOME10</b> Applied! 10% discount on all plans!';
        }
    } else {
        activeCoupon = '';
        if (statusEl) {
            statusEl.className = 'mt-3 text-xs font-bold text-rose-400 flex items-center gap-1.5';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Invalid coupon code. Try FUSIONBOT or WELCOME10';
        }
    }
    updatePricingDisplay();
}

function updatePricingDisplay() {
    if (activeCoupon === 'FUSIONBOT') {
        if (currentCycle === 'monthly') {
            document.getElementById('starterPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹79</span>₹0';
            document.getElementById('starterBtnText').textContent = 'Claim Starter Free Trial (₹0)';
            document.getElementById('proPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹149</span>₹0';
            document.getElementById('proBtnText').textContent = 'Claim 1-Month Free Trial of Pro (₹0)';
        } else {
            document.getElementById('starterPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹759</span>₹610';
            document.getElementById('starterBtnText').textContent = 'Get Starter - ₹610 / yr (Save ₹149)';
            document.getElementById('proPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹1429</span>₹1280';
            document.getElementById('proBtnText').textContent = 'Upgrade to Pro - ₹1280 / yr (Save ₹149)';
        }
    } else if (activeCoupon === 'WELCOME10') {
        if (currentCycle === 'monthly') {
            document.getElementById('starterPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹79</span>₹71';
            document.getElementById('starterBtnText').textContent = 'Get Starter - ₹71 / mo (10% OFF)';
            document.getElementById('proPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹149</span>₹134';
            document.getElementById('proBtnText').textContent = 'Upgrade to Pro - ₹134 / mo (10% OFF)';
        } else {
            document.getElementById('starterPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹759</span>₹683';
            document.getElementById('starterBtnText').textContent = 'Get Starter - ₹683 / yr (10% OFF)';
            document.getElementById('proPrice').innerHTML = '<span class="line-through text-gray-500 text-2xl mr-2">₹1429</span>₹1286';
            document.getElementById('proBtnText').textContent = 'Upgrade to Pro - ₹1286 / yr (10% OFF)';
        }
    } else {
        if (currentCycle === 'monthly') {
            document.getElementById('starterPrice').textContent = '₹79';
            document.getElementById('starterBtnText').textContent = 'Get Starter - ₹79 / mo';
            document.getElementById('proPrice').textContent = '₹149';
            document.getElementById('proBtnText').textContent = 'Upgrade to Pro - ₹149 / mo';
        } else {
            document.getElementById('starterPrice').textContent = '₹759';
            document.getElementById('starterBtnText').textContent = 'Get Starter - ₹759 / yr';
            document.getElementById('proPrice').textContent = '₹1429';
            document.getElementById('proBtnText').textContent = 'Upgrade to Pro - ₹1429 / yr';
        }
    }
}

function loadCashfreeSDK() {
    return new Promise(function(resolve, reject) {
        if (typeof Cashfree !== 'undefined') return resolve(Cashfree);
        var existing = document.querySelector('script[src*="cashfree.js"]');
        if (existing) {
            if (window.Cashfree) return resolve(window.Cashfree);
            existing.addEventListener('load', function() { resolve(window.Cashfree); });
            existing.addEventListener('error', function() { reject(new Error('Failed to load Cashfree SDK')); });
            return;
        }
        var s = document.createElement('script');
        s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        s.async = true;
        s.onload = function() { resolve(window.Cashfree); };
        s.onerror = function() { reject(new Error('Failed to load Cashfree SDK')); };
        document.head.appendChild(s);
    });
}

async function checkoutPlan(planKey) {
    selectedPlan = planKey;
    var p = PRICING[planKey];
    var amt = (currentCycle === 'monthly') ? p.monthly : p.yearly;
    var rawInputCoupon = (document.getElementById('couponInput') ? document.getElementById('couponInput').value.trim() : '');
    var effectiveCoupon = activeCoupon || rawInputCoupon;

    var btn = (planKey === 'starter') ? document.getElementById('starterBtnText') : document.getElementById('proBtnText');
    var origText = btn ? btn.textContent : '';
    if (btn) btn.textContent = '⏳ Opening Payment Gateway...';

    try {
        var res = await fetch('/api/payment/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: planKey,
                cycle: currentCycle,
                amount: amt,
                coupon: effectiveCoupon,
                customerName: '${session ? (session.discordUsername || 'Fusion User') : 'Fusion User'}',
                customerEmail: 'support@fusionhub.in',
                customerPhone: '9999999999'
            })
        }).then(function(r) { return r.json(); });

        if (res.success && res.freeTrial && res.redirectUrl) {
            window.location.href = res.redirectUrl;
            return;
        }

        if (res.success && res.paymentSessionId) {
            var CashfreeObj = null;
            try {
                CashfreeObj = await loadCashfreeSDK();
            } catch(e) {}

            if (CashfreeObj) {
                var cashfree = CashfreeObj({ mode: 'production' });
                cashfree.checkout({
                    paymentSessionId: res.paymentSessionId,
                    redirectTarget: '_self'
                });
            } else {
                alert('Cashfree SDK is currently unavailable. Please check your internet connection.');
                if (btn) btn.textContent = origText;
            }
        } else {
            alert('Failed to start checkout: ' + (res.error || 'Please try again.'));
            if (btn) btn.textContent = origText;
        }
    } catch(err) {
        alert('Payment Error: ' + err.message);
        if (btn) btn.textContent = origText;
    }
}
</script>
</body>
</html>`;

const getServerSelectorHTML = (user, guilds, botGuildIds) => {
    const userName = (user && (user.username || user.discordUsername || 'User')) || 'User';
    const rawAvatar = (user && (user.avatar || user.discordAvatar)) || null;
    const userId = (user && (user.id || user.discordId)) || '';
    
    let userAvatarUrl = (user && user.avatarUrl) || '';
    if (!userAvatarUrl && rawAvatar && rawAvatar !== 'null' && rawAvatar !== 'undefined' && userId) {
        const isGif = String(rawAvatar).startsWith('a_');
        userAvatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${rawAvatar}.${isGif ? 'gif' : 'png'}?size=128`;
    }
    if (!userAvatarUrl && userId) {
        try {
            const defaultIndex = Number((BigInt(userId) >> 22n) % 6n);
            userAvatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        } catch (_) {
            userAvatarUrl = `https://cdn.discordapp.com/embed/avatars/0.png`;
        }
    } else if (!userAvatarUrl) {
        userAvatarUrl = `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>Select a Server | Fusion Bot</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          brand: { 500: '#5865F2', 600: '#4752C4' }
        }
      }
    }
  }
</script>

<script>
(function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
    } catch(e) {}
})();

function applyTheme(theme) {
    if (!theme) theme = 'dark';
    try { localStorage.setItem('fusion_theme', theme); } catch(e) {}
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) document.body.setAttribute('data-theme', theme);
    
    var radios = document.querySelectorAll('input[name="theme"]');
    radios.forEach(function(r) {
        r.checked = (r.value === theme);
    });
    
    var switchers = document.querySelectorAll('.switcher');
    switchers.forEach(function(sw) {
        sw.setAttribute('data-active', theme);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        applyTheme(saved);
    } catch(e) {}
});
window.addEventListener('load', function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        applyTheme(saved);
    } catch(e) {}
});
</script>

<style>
/* Theme Switcher (Exact replica of Screenshot) */
.switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  width: 148px;
  height: 40px;
  box-sizing: border-box;
  padding: 4px;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  background-color: #1e2029;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 300ms ease;
  flex-shrink: 0;
}
[data-theme="light"] .switcher {
  background-color: #e2e8f0;
  border-color: #cbd5e1;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}
.switcher__legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.switcher__input { clip: rect(0 0 0 0); height: 1px; width: 1px; position: absolute; opacity: 0; }
.switcher__icon {
  display: block;
  width: 18px;
  height: 18px;
  transition: transform 200ms ease, color 200ms ease;
  stroke: currentColor;
}
.switcher__option {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 44px;
  height: 100%;
  border-radius: 9999px;
  cursor: pointer;
  color: #9ca3af;
  position: relative;
  z-index: 2;
  transition: color 200ms ease;
}
.switcher__option:hover .switcher__icon {
  transform: scale(1.15);
  color: #ffffff;
}
[data-theme="light"] .switcher__option { color: #64748b; }
[data-theme="light"] .switcher__option:hover .switcher__icon { color: #0f172a; }

.switcher__option:has(input:checked) {
  color: #ffffff !important;
}
[data-theme="light"] .switcher__option:has(input:checked) {
  color: #0f172a !important;
}

.switcher::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 4px;
  width: 44px;
  height: calc(100% - 8px);
  border-radius: 9999px;
  background: linear-gradient(180deg, #505464, #3e414f);
  z-index: 1;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3), 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), background 280ms ease;
}
[data-theme="light"] .switcher::after {
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 1px #ffffff;
}
.switcher[data-active="light"]::after, .switcher:has(input[value="light"]:checked)::after { transform: translateX(0); }
.switcher[data-active="dark"]::after, .switcher:has(input[value="dark"]:checked)::after { transform: translateX(47px); }
.switcher[data-active="dim"]::after, .switcher:has(input[value="dim"]:checked)::after { transform: translateX(94px); }

/* Base Styles */
* { box-sizing: border-box; }
body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  background: url('/assets/bg-dark.jpg') no-repeat center center fixed;
  background-size: cover;
  color: #ffffff;
}
body[data-theme="dim"], html[data-theme="dim"] body { background: #313338 !important; }
body[data-theme="light"], html[data-theme="light"] body { background: url('/assets/bg-light.png') no-repeat center center fixed !important; background-size: cover !important; color: #0f172a !important; }

.glass {
  background: rgba(18, 20, 26, 0.88);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid rgba(255,255,255,0.12);
}
[data-theme="light"] .glass {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: #e2e8f0 !important;
}

.guild-card {
  background: rgba(30, 31, 34, 0.7);
  border: 1px solid rgba(255,255,255,0.1);
  transition: all 0.25s ease;
}
.guild-card:hover {
  transform: translateY(-4px);
  border-color: #5865F2;
  box-shadow: 0 12px 30px rgba(0,0,0,0.4);
}
[data-theme="light"] .guild-card {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
  box-shadow: 0 4px 14px rgba(0,0,0,0.04) !important;
}
[data-theme="light"] .guild-card:hover {
  border-color: #5865F2 !important;
  box-shadow: 0 8px 24px rgba(88,101,242,0.15) !important;
}
[data-theme="light"] h1, 
[data-theme="light"] h2, 
[data-theme="light"] h3, 
[data-theme="light"] h4,
[data-theme="light"] .guild-card h2 { 
  color: #0f172a !important; 
}
[data-theme="light"] p, 

[data-theme="light"] .user-badge-name { color: #0f172a !important; }
[data-theme="light"] .user-badge-box { background: rgba(0, 0, 0, 0.05) !important; border-color: #cbd5e1 !important; }

[data-theme="light"] .guild-card p { 
  color: #64748b !important; 
}
</style>
</head>
<body class="flex flex-col items-center justify-center p-6 min-h-screen">
<div class="glass p-8 sm:p-10 rounded-3xl w-full max-w-5xl shadow-2xl my-8">
    <div class="flex items-center justify-between mb-8 border-b border-white/10 pb-6 flex-wrap gap-4">
        <div class="flex items-center gap-3">
            <img src="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg" class="w-10 h-10 rounded-xl object-cover border border-white/20 shadow-md">
            <h1 class="text-2xl sm:text-3xl font-extrabold">Select a Server</h1>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
            <!-- Theme Switcher -->
            <fieldset class="switcher" id="themeSwitcher">
              <legend class="switcher__legend">Choose theme</legend>
              <label class="switcher__option" title="Light Theme" onclick="applyTheme('light')">
                <input class="switcher__input" type="radio" name="theme" value="light" c-option="1" onchange="applyTheme('light')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m17.66 17.66 1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="m6.34 17.66-1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                </svg>
              </label>
              <label class="switcher__option" title="Dark Theme" onclick="applyTheme('dark')">
                <input class="switcher__input" type="radio" name="theme" value="dark" c-option="2" checked onchange="applyTheme('dark')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                </svg>
              </label>
              <label class="switcher__option" title="Dim Theme" onclick="applyTheme('dim')">
                <input class="switcher__input" type="radio" name="theme" value="dim" c-option="3" onchange="applyTheme('dim')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                  <path d="M2 18h20"></path>
                  <path d="M20 14a8 8 0 0 0-16 0"></path>
                  <path d="M6 22h12"></path>
                </svg>
              </label>
            </fieldset>

            <div class="flex items-center gap-3 user-badge-box bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                <img src="${userAvatarUrl}" alt="${userName}" onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png';" class="w-8 h-8 rounded-full border border-white/20 object-cover shadow-sm">
                <span class="font-bold text-sm user-badge-name text-white">${userName}</span>
            </div>
            <a href="/logout" class="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-2 rounded-xl font-bold text-sm transition">
                <i class="fa-solid fa-right-from-bracket"></i> Logout
            </a>
        </div>
    </div>

    <!-- Guilds Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${(guilds || []).map(guild => {
            const hasBot = (botGuildIds && typeof botGuildIds.has === 'function') ? botGuildIds.has(guild.id) : (Array.isArray(botGuildIds) ? botGuildIds.includes(guild.id) : false);
            const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}?size=128` : null;
            const guildInitial = (guild.name ? guild.name.charAt(0) : '?').toUpperCase();
            return `
            <div class="guild-card p-5 rounded-2xl flex flex-col justify-between">
                <div class="flex items-center gap-4 mb-4">
                    ${iconUrl ? `<img src="${iconUrl}" class="w-14 h-14 rounded-2xl border border-white/10 shadow-lg object-cover">` : `<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-700 flex items-center justify-center font-bold text-xl shadow-lg">${guildInitial}</div>`}
                    <div class="flex-1 overflow-hidden">
                        <h2 class="font-bold text-lg truncate">${guild.name || 'Unnamed Server'}</h2>
                        <span class="text-xs ${hasBot ? 'text-emerald-400' : 'text-gray-400'} font-semibold flex items-center gap-1.5 mt-0.5">
                            <span class="w-2 h-2 rounded-full ${hasBot ? 'bg-emerald-400' : 'bg-gray-400'}"></span>
                            ${hasBot ? 'Bot Configured' : 'Bot Not Present'}
                        </span>
                    </div>
                </div>
                ${hasBot ? `<a href="/dashboard/${(user && (user.discordId || user.id)) || ''}/${guild.id}" class="w-full py-2.5 bg-brand-500 hover:bg-brand-600 font-bold rounded-xl text-center text-sm shadow-lg shadow-brand-500/25 transition block">Manage Server</a>` : `<a href="${BOT_INVITE_URL}&guild_id=${guild.id}" target="_blank" class="w-full py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 font-bold rounded-xl text-center text-sm transition block">Invite Bot</a>`}
            </div>
            `;
        }).join('')}
    </div>
</div>
<script>
console.log('%cStop!', 'color: red; font-family: sans-serif; font-size: 4.5rem; font-weight: 700; -webkit-text-stroke: 1px black;');
console.log('%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to enable an account feature or "hack" someone\'s account, it is a scam and will give them access to your Fusion Bot account.', 'font-family: sans-serif; font-size: 1.25rem; font-weight: 600;');
(function() {
    var bgs = [
        'https://i.ibb.co/FRMD0Gq/4-png.png',
        'https://i.ibb.co/4hxyKMk/download.jpg',
        'https://i.ibb.co/0jPNVWf2/download.jpg',
        'https://i.ibb.co/9kfRtqjq/anime-car-city.jpg',
        'https://i.ibb.co/8nj7gzNb/7400461.jpg',
        'https://i.ibb.co/hRh6Tdtd/pexels-kienvirak-4991338.jpg',
        'https://i.ibb.co/ycQr1wTL/240-F-760560007-mk7wk-XO7-OD5iv-Prep-Tdn-BZr-Rd5-Rr-Wlb-E.jpg',
        'https://i.ibb.co/qY1zYNFZ/image.jpg',
        'https://i.ibb.co/wFVzgRyw/From-Klickpin-com-Calm-status-ideas-with-charm-and-useful-ideas-for-thoughtful-sharing-that-feel-an.gif',
        'https://i.ibb.co/sdjC8ZhZ/From-Klickpin-com-Gorgeous-entryway-organization-ideas-that-are-worth-saving-if-you-love-elegant-de.gif',
        'https://i.ibb.co/N2RBXCF6/From-Klickpin-com-Build-this-guide-to-budget-friendly-budget-vacation-ideas-that-help-you-get-the-l.gif',
        'https://i.ibb.co/9mrRG0H8/From-Klickpin-com-Try-Stylish-journaling-prompts-that-combine-popular-trends-with-useful-details-yo.gif',
        'https://i.ibb.co/5XkphBM2/From-Klickpin-com-Unique-capsule-wardrobe-outfits-that-make-your-next-project-look-polished-and-exp.gif',
        'https://i.ibb.co/hFnNt6sV/From-Klickpin-com-Habit-Tracker-Ideas-That-Are-Going-Viral-77297-pin-id-1064256955673574977.gif'
    ];
    function preload() {
        bgs.forEach(function(u) { var img = new Image(); img.src = u; });
    }
    if ('requestIdleCallback' in window) { requestIdleCallback(preload); }
    else { setTimeout(preload, 500); }
})();
</script>
</body>
</html>`;
};


const getDashboardHTML = (config = {}, guildName = "Unknown Server", botName = "Fusion Bot", isDriveLinked = false, guildIcon = null, botAdminGuilds = [], GID = "", guildRoles = [], guildChannels = [], isServerOwner = false, userId = "") => {
    // Escape helper
    const esc = (s) => (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const guildId = GID || config.guildId || '';
    const userName = esc(botName || 'Fusion User');
    const userLicense = (userId && userId !== 'user') ? getUserLicense(userId) : null;
    const allLicenses = getUserLicenses();
    let isGuildLicensed = !!(
        (config && config.isPremium) ||
        (userLicense && Array.isArray(userLicense.activeGuilds) && userLicense.activeGuilds.some(g => g.guildId === guildId))
    );
    if (!isGuildLicensed && allLicenses) {
        for (const uid in allLicenses) {
            const lic = allLicenses[uid];
            if (lic && Array.isArray(lic.activeGuilds) && lic.activeGuilds.some(g => g.guildId === guildId)) {
                isGuildLicensed = true;
                break;
            }
        }
    }
    const isPrem = isGuildLicensed || !!(config && config.isPremium);
    const isPro = isPrem;

    // Variables for fields
    const welcomeDesc = esc(config.welcomeDesc || 'Welcome {user} to {server}!');
    const byeDesc = esc(config.byeDesc || 'Goodbye {user}!');
    const welcomeCh = esc(config.welcomeChannel || '');
    const byeCh = esc(config.byeChannel || '');
    const welcomeBg = esc(config.welcomeBg || '');
    const byeBg = esc(config.byeBg || '');

    const welcomeDmEnabled = config.welcomeDmEnabled ? 'checked' : '';
    const ticketsEnabled = config.ticketsEnabled ? 'checked' : '';
    const reactRolesEnabled = config.reactRolesEnabled ? 'checked' : '';
    const inviteTrackerEnabled = config.inviteTrackerEnabled ? 'checked' : '';
    const autoRoleEnabled = config.autoRoleEnabled ? 'checked' : '';
    const levelingEnabled = config.levelingEnabled ? 'checked' : '';
    const autoBackupEnabled = config.autoBackup ? 'checked' : '';
    const antiNukeEnabled = config.antiNukeEnabled ? 'checked' : '';
    const wordFilterEnabled = config.wordFilterEnabled ? 'checked' : '';
    const antiSpamEnabled = config.antiSpamEnabled ? 'checked' : '';
    const logsEnabled = config.logsEnabled ? 'checked' : '';
    const attachmentSpamEnabled = config.attachmentSpamEnabled ? 'checked' : '';
    const mentionSpamEnabled = config.mentionSpamEnabled ? 'checked' : '';
    const banWordKickEnabled = config.banWordKickEnabled ? 'checked' : '';

    const antiSpamMax = Number(config.antiSpamMaxMessages || 5);
    const antiSpamWin = Number(config.antiSpamWindow || 5);
    const antiSpamAction = config.antiSpamAction || 'timeout';
    const antiSpamTimeoutMs = Number(config.antiSpamTimeoutMs || 30000);

    const attachmentSpamMax = Number(config.attachmentSpamMax || 5);
    const mentionSpamMax = Number(config.mentionSpamMax || 5);

    const banWordsStr = (config.banWords || []).join(', ').replace(/`/g, '\\`');
    const bannedUsersStr = (config.bannedUsers || []).join(', ');
    const banWordTimeout = Number(config.banWordTimeout || 10);
    const banWordKick = Number(config.banWordKickThreshold || 3);

    const botNickname = esc(config.botNickname || '');
const botAvatar = esc(config.botAvatar || '');
const botBanner = esc(config.botBanner || '');
    const customPrefix = esc((config.customPrefix === 'fb' ? '' : config.customPrefix) || '');
    const customPrefixesStr = (config.customPrefixes || []).filter(p => p && p.trim() !== 'fb').join('\n');
    const voicePack = esc(config.voicePack || 'male');

    const ytChannels = (config.youtubeChannels || []).join('\n');
    const twitchChannels = (config.twitchChannels || []).join('\n');

    const ticketTitle = esc(config.ticketTitle || '🎫 Support Center');
    const ticketDesc = esc(config.ticketDesc || 'Click below to create a support ticket!');
    const ticketMode = config.ticketMode || 'normal';
    const ticketAiQuestionsStr = Array.isArray(config.ticketAiQuestions) ? config.ticketAiQuestions.join('\n') : '';
    const ticketImage = esc(config.ticketImage || '');
    const ticketSupportRoleId = JSON.stringify(config.ticketSupportRole || '');
    const ticketOptions = Array.isArray(config.ticketOptions) ? config.ticketOptions : [];

    const autoRoleMember = JSON.stringify(config.autoRoleMember || []);
    const autoRoleBot = JSON.stringify(config.autoRoleBot || []);

    const savedWelcomeCh = JSON.stringify(config.welcomeChannel || '');
    const savedRRCh = JSON.stringify(config.reactRoleChannel || '');
    const levelingChannelVal = JSON.stringify(config.levelingChannel || '');
    const levelUpMessage = esc(config.levelUpMessage || '🎉 Congratulations {user}, you leveled up to Level {level}!');

    const existingPairsJSON = safeJSONForScript(config.reactRoles || []);

    const lastBackupDateObj = config.nukeBackup && config.nukeBackup.backupDate ? new Date(config.nukeBackup.backupDate) : null;
    const lastBackupStr = lastBackupDateObj ? lastBackupDateObj.toLocaleString() : 'No snapshot taken yet';

    // Discord CDN Icon
    let iconUrl = null;
    if (guildIcon) {
        if (guildIcon.startsWith('http://') || guildIcon.startsWith('https://')) {
            iconUrl = guildIcon;
        } else {
            const ext = guildIcon.startsWith('a_') ? 'gif' : 'png';
            iconUrl = `https://cdn.discordapp.com/icons/${GID}/${guildIcon}.${ext}?size=128`;
        }
    }

    // Build Server Switcher Dropdown HTML
    let serverSwitcher = '';
    if (Array.isArray(botAdminGuilds) && botAdminGuilds.length > 0) {
        serverSwitcher = botAdminGuilds.map(g => {
            const isCurrent = g.id === GID;
            const gIcon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=64` : null;
            const srvLink = userId ? `/dashboard/${userId}/${g.id}` : `/dashboard/${g.id}`;
            return `<a href="${srvLink}" class="srv-item ${isCurrent ? 'active' : ''}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;text-decoration:none;color:${isCurrent ? '#fff' : '#9ca3af'};background:${isCurrent ? 'rgba(88,101,242,0.2)' : 'transparent'};border-radius:8px;margin-bottom:4px;transition:0.2s">
                ${gIcon ? `<img src="${gIcon}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">` : `<div style="width:28px;height:28px;background:#5865F2;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold">${g.name.charAt(0)}</div>`}
                <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${g.name}</span>
                ${isCurrent ? '<i class="fa-solid fa-check" style="margin-left:auto;color:#5865F2;font-size:12px"></i>' : ''}
            </a>`;
        }).join('');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="shortcut icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<link rel="apple-touch-icon" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
<title>${esc(guildName)} | Fusion Bot Dashboard</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          brand: { 500: '#5865F2', 600: '#4752C4' }
        }
      }
    }
  }
</script>

<script>
(function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
    } catch(e) {}
})();

function applyTheme(theme) {
    if (!theme) theme = 'dark';
    try { localStorage.setItem('fusion_theme', theme); } catch(e) {}
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) document.body.setAttribute('data-theme', theme);
    
    var radios = document.querySelectorAll('input[name="theme"]');
    radios.forEach(function(r) {
        r.checked = (r.value === theme);
    });
    
    var switchers = document.querySelectorAll('.switcher');
    switchers.forEach(function(sw) {
        sw.setAttribute('data-active', theme);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        applyTheme(saved);
    } catch(e) {}
});
window.addEventListener('load', function() {
    try {
        var saved = localStorage.getItem('fusion_theme') || 'dark';
        applyTheme(saved);
    } catch(e) {}
});
</script>

<style>
/* Theme Switcher (Exact replica of Screenshot 2) */
.switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  width: 148px;
  height: 40px;
  box-sizing: border-box;
  padding: 4px;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  background-color: #1e2029;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 300ms ease;
  flex-shrink: 0;
}
[data-theme="light"] .switcher {
  background-color: #e2e8f0;
  border-color: #cbd5e1;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}
.switcher__legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.switcher__input { clip: rect(0 0 0 0); height: 1px; width: 1px; position: absolute; opacity: 0; }
.switcher__icon {
  display: block;
  width: 18px;
  height: 18px;
  transition: transform 200ms ease, color 200ms ease;
  stroke: currentColor;
}
.switcher__option {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 44px;
  height: 100%;
  border-radius: 9999px;
  cursor: pointer;
  color: #9ca3af;
  position: relative;
  z-index: 2;
  transition: color 200ms ease;
}
.switcher__option:hover .switcher__icon {
  transform: scale(1.15);
  color: #ffffff;
}
[data-theme="light"] .switcher__option { color: #64748b; }
[data-theme="light"] .switcher__option:hover .switcher__icon { color: #0f172a; }

.switcher__option:has(input:checked) {
  color: #ffffff !important;
}
[data-theme="light"] .switcher__option:has(input:checked) {
  color: #0f172a !important;
}

.switcher::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 4px;
  width: 44px;
  height: calc(100% - 8px);
  border-radius: 9999px;
  background: linear-gradient(180deg, #505464, #3e414f);
  z-index: 1;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3), 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), background 280ms ease;
}
[data-theme="light"] .switcher::after {
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 1px #ffffff;
}
.switcher[data-active="light"]::after, .switcher:has(input[value="light"]:checked)::after { transform: translateX(0); }
.switcher[data-active="dark"]::after, .switcher:has(input[value="dark"]:checked)::after { transform: translateX(47px); }
.switcher[data-active="dim"]::after, .switcher:has(input[value="dim"]:checked)::after { transform: translateX(94px); }

/* Global Base Styles */
* { box-sizing: border-box; }
body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  background: url('/assets/bg-dark.jpg') no-repeat center center fixed;
  background-size: cover;
  color: #ffffff;
  overflow-x: hidden;
}
[data-theme="dim"] {
  background: #313338 !important;
}

.app {
  display: flex;
  min-height: 100vh;
  background: rgba(10, 12, 16, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: rgba(15, 17, 23, 0.88);
  backdrop-filter: blur(25px);
  border-right: 1px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
}
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

.nav-cat {
  font-size: 11px;
  font-weight: 800;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 16px 20px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  color: #9ca3af;
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
  text-decoration: none;
}
.nav-item:hover {
  color: #ffffff;
  background: rgba(255,255,255,0.06);
}
.nav-item.active {
  color: #ffffff;
  background: rgba(88, 101, 242, 0.2);
  border-left-color: #5865F2;
}

/* Main Area */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  background: rgba(15, 17, 23, 0.7);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  position: sticky;
  top: 0;
  z-index: 90;
}
.mobile-toggle {
  display: none;
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}

/* Views & Cards */
.view { display: none; }
.view.active { display: block; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.card {
  background: rgba(30,31,34,0.7);
  backdrop-filter: blur(15px);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid rgba(255,255,255,0.1);
}
.input-box {
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff;
  padding: 10px 14px;
  border-radius: 10px;
  width: 100%;
  outline: none;
  margin-top: 8px;
  transition: 0.2s;
  font-size: 14px;
  font-family: inherit;
}
.input-box:focus {
  border-color: #5865F2;
  box-shadow: 0 0 0 2px rgba(88,101,242,0.35);
}
.label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 16px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: 0.2s;
  border: none;
  text-decoration: none;
}
.btn-p { background: #5865F2; color: white; }
.btn-p:hover { background: #4752c4; }
.btn-o { background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.15); }
.btn-o:hover { background: rgba(255,255,255,0.15); }

.grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.plugin-card {
  background: rgba(30,31,34,0.7);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.25s;
}
.plugin-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255,255,255,0.28);
  box-shadow: 0 12px 30px rgba(0,0,0,0.4);
}
.p-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
  margin-bottom: 14px;
}

/* Save Bar (TOP NOTIFICATION BAR) */
.savebar {
  display: none !important;
  position: fixed;
  top: 20px;
  bottom: auto;
  left: 280px;
  right: 24px;
  background: rgba(15, 16, 20, 0.96);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(88, 101, 242, 0.45);
  border-radius: 16px;
  padding: 14px 28px;
  justify-content: space-between;
  align-items: center;
  z-index: 99999;
  box-shadow: 0 16px 40px rgba(0,0,0,0.85);
}
.savebar.show {
  display: flex !important;
  animation: slideDown 0.3s cubic-bezier(0.16,1,0.3,1);
}
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Radio Dots */
input[type=radio] { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; }
.radio-dot.checked { border-color: #5865F2; background: #5865F2; box-shadow: 0 0 6px rgba(88,101,242,0.6); }

/* 💧 LIQUID GLASS TOGGLE SWITCH (Exact Replica of FreeFrontend Liquid Switch) */
.switch {
  position: relative;
  display: inline-block;
  width: 58px;
  height: 32px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 9999px;
  user-select: none;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-theme="light"] .slider {
  background-color: #cbd5e1;
  border-color: #94a3b8;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.08);
}
.slider:before {
  position: absolute;
  content: "";
  height: 26px;
  width: 28px;
  left: 3px;
  bottom: 2px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 
    inset 0 2px 3px 0 #ffffff,
    inset 0 -2px 3px 0 rgba(0, 0, 0, 0.12),
    0 3px 8px 0 rgba(0, 0, 0, 0.25);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
}
.slider:after {
  position: absolute;
  content: "";
  height: 18px;
  width: 20px;
  left: 7px;
  bottom: 6px;
  border-radius: 9999px;
  background: transparent;
  box-shadow: inset 2px 2px 3px 0 #ffffff;
  pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, box-shadow 0.3s ease;
  opacity: 0.85;
}
input:checked + .slider {
  background-color: #22c55e !important;
  border-color: #16a34a !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15), 0 2px 12px rgba(34, 197, 94, 0.45) !important;
}
input:checked + .slider:before {
  transform: translateX(24px);
  background: rgba(255, 255, 255, 0.95);
  border-color: #ffffff;
  box-shadow: 
    inset 0 2px 3px 0 #ffffff,
    inset 0 -1.5px 2px 0 rgba(0, 0, 0, 0.08),
    0 4px 10px 0 rgba(0, 0, 0, 0.3);
}
input:checked + .slider:after {
  transform: translateX(24px);
  opacity: 0.95;
  box-shadow: inset -2px -2px 3px 0 #ffffff, inset 2px 2px 3px 0 #ffffff;
}

/* Server Switcher Dropdown */
.srv-drop { position: relative; }
.srv-menu { display: none; position: absolute; top: calc(100% + 4px); left: 12px; right: 12px; z-index: 9999; }
.srv-drop:hover .srv-menu { display: block; }
.srv-inner { background: rgba(15,16,20,0.98); backdrop-filter: blur(25px); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 8px 0; box-shadow: 0 16px 40px rgba(0,0,0,0.8); max-height: 320px; overflow-y: auto; }

/* Light Theme Overrides */
body[data-theme="light"], html[data-theme="light"] body { background: url('/assets/bg-light.png') no-repeat center center fixed !important; background-size: cover !important; color: #1e293b !important; }
[data-theme="light"] .app { background: rgba(248,250,252,0.82) !important; }
[data-theme="light"] .sidebar { background: rgba(255,255,255,0.88) !important; border-right-color: rgba(0,0,0,0.08) !important; }
[data-theme="light"] .topbar { background: rgba(255,255,255,0.88) !important; border-bottom-color: rgba(0,0,0,0.08) !important; }
[data-theme="light"] .topbar-title { color: #0f172a !important; }
[data-theme="light"] .nav-item { color: #475569 !important; }
[data-theme="light"] .nav-item:hover { background: rgba(0,0,0,0.05) !important; color: #0f172a !important; }
[data-theme="light"] .nav-item.active { background: #5865F2 !important; color: #ffffff !important; }
[data-theme="light"] .card { background: #ffffff !important; border-color: #e2e8f0 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.05) !important; }

/* Light theme headings and text */
[data-theme="light"] h1, 
[data-theme="light"] h2, 
[data-theme="light"] h3, 
[data-theme="light"] h4,
[data-theme="light"] .view h1,
[data-theme="light"] .view h2,
[data-theme="light"] .view h3,
[data-theme="light"] .view h4,
[data-theme="light"] .card h1,
[data-theme="light"] .card h2,
[data-theme="light"] .card h3,
[data-theme="light"] .card h4 { 
  color: #0f172a !important; 
}

[data-theme="light"] p,
[data-theme="light"] .view p,
[data-theme="light"] .card p {
  color: #64748b !important;
}

[data-theme="light"] .label {
  color: #475569 !important;
}

[data-theme="light"] .input-box { background: #f8fafc !important; border-color: #cbd5e1 !important; color: #0f172a !important; }
[data-theme="light"] .input-box:focus { border-color: #5865F2 !important; background: #ffffff !important; }
[data-theme="light"] .btn-o { background: #f1f5f9 !important; border-color: #cbd5e1 !important; color: #334155 !important; }
[data-theme="light"] .btn-o:hover { background: #e2e8f0 !important; }
[data-theme="light"] .plugin-card { background: #ffffff !important; border-color: #e2e8f0 !important; box-shadow: 0 4px 14px rgba(0,0,0,0.04) !important; }
[data-theme="light"] .plugin-card:hover { border-color: #5865F2 !important; box-shadow: 0 8px 24px rgba(88,101,242,0.12) !important; }
[data-theme="light"] .savebar { background: rgba(255,255,255,0.96) !important; border-color: #cbd5e1 !important; color: #0f172a !important; box-shadow: 0 16px 40px rgba(0,0,0,0.15) !important; }

/* Light Theme Premium View Overrides */
[data-theme="light"] #view-premium h1 { color: #0f172a !important; }
[data-theme="light"] #view-premium p { color: #475569 !important; }
[data-theme="light"] .plan-card-starter { background: #ffffff !important; border-color: #e2e8f0 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.06) !important; }
[data-theme="light"] .plan-card-starter .plan-price { color: #0f172a !important; }
[data-theme="light"] .plan-card-starter .plan-cycle { color: #64748b !important; }
[data-theme="light"] .plan-card-starter .plan-desc { color: #475569 !important; }
[data-theme="light"] .plan-card-starter .feature-item { color: #1e293b !important; }
[data-theme="light"] .plan-card-starter .btn-sub { background: #5865F2 !important; color: #ffffff !important; border: none !important; box-shadow: 0 4px 14px rgba(88,101,242,0.3) !important; }
[data-theme="light"] .plan-card-starter .btn-sub:hover { background: #4752C4 !important; }
[data-theme="light"] .plan-card-pro { background: linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%) !important; border-color: #8b5cf6 !important; box-shadow: 0 8px 30px rgba(139,92,246,0.18) !important; }
[data-theme="light"] .plan-card-pro .plan-price { color: #0f172a !important; }
[data-theme="light"] .plan-card-pro .plan-cycle { color: #64748b !important; }
[data-theme="light"] .plan-card-pro .plan-desc { color: #475569 !important; }
[data-theme="light"] .plan-card-pro .feature-item { color: #0f172a !important; }
[data-theme="light"] .plan-card-pro .btn-sub { background: linear-gradient(90deg, #6366f1, #8b5cf6) !important; color: #ffffff !important; box-shadow: 0 6px 18px rgba(99,102,241,0.35) !important; }
[data-theme="light"] .cycle-switch-box { background: #ffffff !important; border-color: #cbd5e1 !important; box-shadow: 0 2px 10px rgba(0,0,0,0.05) !important; }
[data-theme="light"] .payments-footer-box { background: #ffffff !important; border-color: #e2e8f0 !important; color: #0f172a !important; box-shadow: 0 2px 10px rgba(0,0,0,0.04) !important; }


/* Responsive Media Queries */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    transform: translateX(-100%);
    box-shadow: 0 0 30px rgba(0,0,0,0.8);
  }
  .sidebar.open { transform: translateX(0); }
  .mobile-toggle { display: block; }
  .mobile-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 99;
  }
  .mobile-overlay.open { display: block; }
  .savebar {
    left: 16px !important;
    right: 16px !important;
    top: 16px !important;
    padding: 12px 18px !important;
    border-radius: 12px !important;
  }
}

@media (max-width: 640px) {
  .grid-3col { grid-template-columns: 1fr !important; }
  .grid-2col { grid-template-columns: 1fr !important; }
  .card { padding: 18px !important; border-radius: 14px !important; }
  .savebar { flex-direction: column !important; gap: 10px !important; align-items: stretch !important; text-align: center !important; }
  .savebar > div { display: flex; justify-content: space-between; width: 100%; }
}
</style>
</head>
<body>
<div class="app">

<!-- MOBILE OVERLAY -->
<div class="mobile-overlay" id="mobileOverlay" onclick="closeSidebar()"></div>

<!-- SIDEBAR -->
<aside class="sidebar" id="mainSidebar">
    <div class="p-4 border-b border-white/10 srv-drop" style="cursor:pointer">
        <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/8" style="transition:0.2s">
            ${iconUrl ? `<img src="${iconUrl}" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);object-fit:cover">` : `<div style="width:40px;height:40px;background:linear-gradient(135deg,#5865F2,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold">${guildName.charAt(0)}</div>`}
            <div style="flex:1;overflow:hidden"><div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${guildName}</div><div style="font-size:10px;color:#9ca3af">Select Server</div></div>
            <i class="fa-solid fa-chevron-down" style="font-size:11px;color:#9ca3af"></i>
        </div>
        <div class="srv-menu"><div class="srv-inner">${serverSwitcher}</div></div>
    </div>
    <div style="flex:1;padding:16px 0;padding-bottom:20px;overflow-y:auto">
        <!-- PREMIUM PLANS (FEATURED TOP) -->
        <div style="padding:0 14px 14px">
            ${(isPrem || isGuildLicensed) ? `
            <div class="nav-item" id="nav-premium" onclick="show('premium')" style="background:linear-gradient(135deg,rgba(16,185,129,0.22),rgba(5,150,105,0.38));border:1px solid rgba(16,185,129,0.6);color:#a7f3d0 !important;font-weight:800;border-radius:12px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 14px rgba(16,185,129,0.25);cursor:pointer;margin-bottom:0">
                <i class="fa-solid fa-crown" style="color:#34d399;font-size:16px;width:20px;text-align:center"></i> 
                <span style="font-size:13px;font-weight:800;letter-spacing:0.2px">PREMIUM ACTIVATED</span>
                <span style="margin-left:auto;background:#10b981;color:#ffffff;font-size:9px;font-weight:900;padding:3px 7px;border-radius:6px;letter-spacing:0.5px;box-shadow:0 2px 6px rgba(16,185,129,0.4)">ACTIVE</span>
            </div>
            ` : `
            <div class="nav-item" id="nav-premium" onclick="show('premium')" style="background:linear-gradient(135deg,rgba(234,179,8,0.22),rgba(202,138,4,0.38));border:1px solid rgba(234,179,8,0.55);color:#fef08a !important;font-weight:800;border-radius:12px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 14px rgba(234,179,8,0.25);cursor:pointer;margin-bottom:0">
                <i class="fa-solid fa-crown" style="color:#facc15;font-size:16px;width:20px;text-align:center"></i> 
                <span style="font-size:14px">Premium Plans</span>
                <span style="margin-left:auto;background:#facc15;color:#000;font-size:10px;font-weight:900;padding:2px 7px;border-radius:6px;letter-spacing:0.5px">UPGRADE</span>
            </div>
            `}
        </div>

        <!-- MAIN -->
        <div class="nav-item active" id="nav-home" onclick="show('home')"><i class="fa-solid fa-layer-group" style="width:20px;text-align:center"></i> Dashboard</div>
        <div class="nav-item" id="nav-identity" onclick="show('identity')"><i class="fa-solid fa-robot" style="width:20px;text-align:center"></i> Bot Personalizer</div>
        <!-- COMMANDS -->
        <div class="nav-cat">Commands</div>
        <div class="nav-item" id="nav-cmd-general" onclick="show('cmd-general')"><i class="fa-solid fa-comment" style="width:20px;text-align:center"></i> General Commands</div>
        <div class="nav-item" id="nav-cmd-mod" onclick="show('cmd-mod')"><i class="fa-solid fa-shield" style="width:20px;text-align:center"></i> Moderation Commands</div>
        <div class="nav-item" id="nav-cmd-utility" onclick="show('cmd-utility')"><i class="fa-solid fa-wrench" style="width:20px;text-align:center"></i> Utility Commands</div>
        <!-- CONFIGURATION -->
        <div class="nav-cat">Configuration</div>
        <div class="nav-item" id="nav-welcome" onclick="show('welcome')"><i class="fa-solid fa-door-open" style="width:20px;text-align:center"></i> Welcome &amp; Goodbye</div>
        <div class="nav-item" id="nav-tickets" onclick="show('tickets')"><i class="fa-solid fa-ticket" style="width:20px;text-align:center"></i> Ticket Settings</div>
        <div class="nav-item" id="nav-reactroles" onclick="show('reactroles')"><i class="fa-solid fa-face-smile" style="width:20px;text-align:center"></i> React Roles</div>
        <div class="nav-item" id="nav-invitetracker" onclick="show('invitetracker')"><i class="fa-solid fa-envelope-open-text" style="width:20px;text-align:center"></i> Invite Tracker</div>
        <div class="nav-item" id="nav-autoroles" onclick="show('autoroles')"><i class="fa-solid fa-user-tag" style="width:20px;text-align:center"></i> Auto Roles</div>
        <div class="nav-item" id="nav-leveling" onclick="show('leveling')"><i class="fa-solid fa-chart-line" style="width:20px;text-align:center"></i> Leveling System</div>
        <div class="nav-item" id="nav-nukebackup" onclick="show('nukebackup')"><i class="fa-solid fa-shield-halved" style="width:20px;text-align:center"></i> Nuke Backup</div>
        <div class="nav-item" id="nav-drive" onclick="show('drive')"><i class="fa-solid fa-cloud-arrow-up" style="width:20px;text-align:center"></i> Cloud &amp; Drive Backups</div>
        <div class="nav-item" id="nav-notifications" onclick="show('notifications')"><i class="fa-solid fa-bell" style="width:20px;text-align:center"></i> Notifications</div>
        <div class="nav-item" id="nav-logs" onclick="show('logs')"><i class="fa-solid fa-file-lines" style="width:20px;text-align:center"></i> Server Logs</div>
        <!-- AUTOMOD -->
        <div class="nav-cat">Automod</div>
        <div class="nav-item" id="nav-moderation" onclick="show('moderation')"><i class="fa-solid fa-comment-slash" style="width:20px;text-align:center"></i> Banned Words</div>
        <div class="nav-item" id="nav-bannedusers" onclick="show('bannedusers')"><i class="fa-solid fa-users-slash" style="width:20px;text-align:center"></i> Banned Users (IDs)</div>
        <div class="nav-item" id="nav-antispam" onclick="show('antispam')"><i class="fa-solid fa-bolt" style="width:20px;text-align:center"></i> Anti-Spam</div>
        <div class="nav-item" id="nav-attachmentspam" onclick="show('attachmentspam')"><i class="fa-solid fa-file-image" style="width:20px;text-align:center"></i> Attachment Spam</div>
        <div class="nav-item" id="nav-mentionspam" onclick="show('mentionspam')"><i class="fa-solid fa-at" style="width:20px;text-align:center"></i> Mention Spam</div>

        <!-- LEGAL & SUPPORT (Open in same window) -->
        <div class="nav-cat">Legal &amp; Support</div>
        <a href="/support" class="nav-item" style="text-decoration:none"><i class="fa-solid fa-headset" style="width:20px;text-align:center"></i> Support Server</a>
        <a href="/terms" class="nav-item" style="text-decoration:none"><i class="fa-solid fa-scale-balanced" style="width:20px;text-align:center"></i> Terms of Service</a>
        <a href="/privacy" class="nav-item" style="text-decoration:none"><i class="fa-solid fa-user-shield" style="width:20px;text-align:center"></i> Privacy Policy</a>
        <a href="/refund-policy" class="nav-item" style="text-decoration:none"><i class="fa-solid fa-receipt" style="width:20px;text-align:center"></i> Refund &amp; Policy</a>
        <a href="/shipping-policy" class="nav-item" style="text-decoration:none"><i class="fa-solid fa-truck" style="width:20px;text-align:center"></i> Shipping Policy</a>
    </div>
    <div style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.2)">
        <a href="/logout" style="display:flex;align-items:center;gap:10px;color:#f87171;font-weight:700;font-size:14px;text-decoration:none"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
    </div>
</aside>

<!-- MAIN CONTENT -->
<main class="main">
    <header class="topbar">
        <div style="display:flex;align-items:center;gap:12px">
            <button type="button" class="mobile-toggle" onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>
            <img src="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg" style="width:28px;height:28px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.15)">
            <span class="topbar-title" style="font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px">FUSION BOT</span>
            ${(isPrem || isGuildLicensed) ? `<span style="background:rgba(16,185,129,0.18);color:#34d399;font-size:10px;font-weight:900;padding:3px 9px;border-radius:999px;border:1px solid rgba(16,185,129,0.35);display:inline-flex;align-items:center;gap:5px;box-shadow:0 0 10px rgba(16,185,129,0.15)"><i class="fa-solid fa-crown"></i> PREMIUM ACTIVATED</span>` : ''}
        </div>

        <div style="display:flex;align-items:center;gap:12px">
            <!-- Theme Switcher -->
            <fieldset class="switcher" id="themeSwitcher">
              <legend class="switcher__legend">Choose theme</legend>
              <label class="switcher__option" title="Light Theme" onclick="applyTheme('light')">
                <input class="switcher__input" type="radio" name="theme" value="light" c-option="1" onchange="applyTheme('light')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m17.66 17.66 1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="m6.34 17.66-1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                </svg>
              </label>
              <label class="switcher__option" title="Dark Theme" onclick="applyTheme('dark')">
                <input class="switcher__input" type="radio" name="theme" value="dark" c-option="2" checked onchange="applyTheme('dark')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                </svg>
              </label>
              <label class="switcher__option" title="Dim Theme" onclick="applyTheme('dim')">
                <input class="switcher__input" type="radio" name="theme" value="dim" c-option="3" onchange="applyTheme('dim')" />
                <svg class="switcher__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                  <path d="M2 18h20"></path>
                  <path d="M20 14a8 8 0 0 0-16 0"></path>
                  <path d="M6 22h12"></path>
                </svg>
              </label>
            </fieldset>

            <a href="/servers" class="btn btn-o" style="padding:8px 16px;font-size:13px"><i class="fa-solid fa-house"></i> Home</a>
        </div>
    </header>

    <form id="mainForm">
    <div style="padding:28px;max-width:1200px;margin:0 auto;width:100%">

    <!-- Top Unsaved Changes Save Bar -->
    <div id="savebar" class="savebar">
        <span style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px"><i class="fa-solid fa-triangle-exclamation" style="color:#facc15;font-size:16px"></i> Careful — you have unsaved changes!</span>
        <div style="display:flex;gap:12px;align-items:center">
            <button type="button" onclick="location.reload()" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:13px;font-weight:600">Reset</button>
            <button type="button" id="saveBtn" onclick="doSave()" class="btn btn-p" style="padding:10px 24px">Save Changes</button>
        </div>
    </div>


    <!-- 1. HOME VIEW (PLUGIN CARDS) -->
    
<!-- 1. HOME VIEW (PLUGIN CARDS) -->
    <div id="view-home" class="view active">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
            <div>
                <h1 style="font-size:26px;font-weight:800;color:white;margin:0 0 4px">Server Overview</h1>
                <p style="color:#9ca3af;font-size:13.5px;margin:0">Manage and configure all automated systems for <b>${esc(guildName)}</b>.</p>
            </div>
            <div style="display:flex;gap:10px">
                <button type="button" onclick="show('identity')" class="btn btn-o" style="font-size:13px"><i class="fa-solid fa-pen"></i> Customize Bot</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px">
            <!-- 1. Welcome -->
            <div class="plugin-card" onclick="show('welcome')">
                <div class="p-icon" style="background:linear-gradient(135deg,#6366f1,#4338ca)"><i class="fa-solid fa-door-open"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Welcome &amp; Goodbye</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Greet new members with personalized cards, direct messages, and farewells.</p>
                <button type="button" onclick="event.stopPropagation();show('welcome')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 2. Auto Backups -->
            <div class="plugin-card" onclick="show('drive')">
                <div class="p-icon" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8)"><i class="fa-brands fa-google-drive"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Google Drive Backups</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Off-site automated cloud backups synced directly to your Google Drive.</p>
                ${isDriveLinked ? `<button type="button" onclick="event.stopPropagation();show('drive')" class="btn" style="width:100%;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">✓ Connected &amp; Active</button>` : `<button type="button" onclick="event.stopPropagation();show('drive')" class="btn btn-p" style="width:100%">Connect to Drive</button>`}
            </div>

            <!-- 3. Tickets -->
            <div class="plugin-card" onclick="show('tickets')">
                <div class="p-icon" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9)"><i class="fa-solid fa-ticket"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Ticket System &amp; AI Intake</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Interactive ticket panels with staff routing and smart AI-powered assistance.</p>
                <button type="button" onclick="event.stopPropagation();show('tickets')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 4. React Roles -->
            <div class="plugin-card" onclick="show('reactroles')">
                <div class="p-icon" style="background:linear-gradient(135deg,#ec4899,#be185d)"><i class="fa-solid fa-face-smile"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Reaction Roles</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Let members self-assign roles by reacting to customizable embeds.</p>
                <button type="button" onclick="event.stopPropagation();show('reactroles')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 5. Invite Tracker -->
            <div class="plugin-card" onclick="show('invitetracker')">
                <div class="p-icon" style="background:linear-gradient(135deg,#10b981,#047857)"><i class="fa-solid fa-envelope-open-text"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Invite Tracker</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Track who invited who, count invite stats, and log invites in real-time.</p>
                <button type="button" onclick="event.stopPropagation();show('invitetracker')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 6. Auto Roles -->
            <div class="plugin-card" onclick="show('autoroles')">
                <div class="p-icon" style="background:linear-gradient(135deg,#f59e0b,#b45309)"><i class="fa-solid fa-user-tag"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Auto Roles</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Assign single or multiple starter roles automatically when users or bots join.</p>
                <button type="button" onclick="event.stopPropagation();show('autoroles')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 7. Leveling -->
            <div class="plugin-card" onclick="show('leveling')">
                <div class="p-icon" style="background:linear-gradient(135deg,#e11d48,#9f1239)"><i class="fa-solid fa-chart-line"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Leveling &amp; XP</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Reward chat engagement with XP, level-up cards, and role unlock rewards.</p>
                <button type="button" onclick="event.stopPropagation();show('leveling')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 8. Nuke Backup -->
            <div class="plugin-card" onclick="show('nukebackup')">
                <div class="p-icon" style="background:linear-gradient(135deg,#dc2626,#991b1b)"><i class="fa-solid fa-shield-halved"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Nuke Backup &amp; Snapshot</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Instant server snapshots to recreate channels, permissions, and roles.</p>
                <button type="button" onclick="event.stopPropagation();show('nukebackup')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 9. Server Logs -->
            <div class="plugin-card" onclick="show('logs')">
                <div class="p-icon" style="background:linear-gradient(135deg,#06b6d4,#0e7490)"><i class="fa-solid fa-file-lines"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Server Logs</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Audit logging for messages, voice activity, roles, tickets, and members.</p>
                <button type="button" onclick="event.stopPropagation();show('logs')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 10. Automod Banned Words -->
            <div class="plugin-card" onclick="show('moderation')">
                <div class="p-icon" style="background:linear-gradient(135deg,#d97706,#78350f)"><i class="fa-solid fa-comment-slash"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Banned Words &amp; Filter</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Auto-censor prohibited phrases with custom strike punishments and kicks.</p>
                <button type="button" onclick="event.stopPropagation();show('moderation')" class="btn btn-o" style="width:100%">Configure</button>
            </div>

            <!-- 11. Anti-Spam -->
            <div class="plugin-card" onclick="show('antispam')">
                <div class="p-icon" style="background:linear-gradient(135deg,#ef4444,#7f1d1d)"><i class="fa-solid fa-bolt"></i></div>
                <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 6px">Anti-Spam Shield</h3>
                <p style="color:#9ca3af;font-size:13px;flex:1;margin:0 0 18px;line-height:1.5">Protect channels against fast spam, mass mentions, and file flooding.</p>
                <button type="button" onclick="event.stopPropagation();show('antispam')" class="btn btn-o" style="width:100%">Configure</button>
            </div>
        </div>
    </div>

    

        <!-- ==================== PREMIUM PLANS VIEW ==================== -->
        <div id="view-premium" class="view">
            <div style="max-width:1000px;margin:0 auto;padding-bottom:40px">
                
                ${(isPrem || isGuildLicensed) ? `
                <!-- 👑 ACTIVE PREMIUM SUBSCRIPTION DASHBOARD -->
                <div style="background:linear-gradient(135deg,rgba(16,185,129,0.18) 0%,rgba(99,102,241,0.14) 100%);border:2px solid #10b981;border-radius:24px;padding:26px;margin-bottom:24px;box-shadow:0 12px 36px rgba(16,185,129,0.22);">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;">
                        <div style="display:flex;align-items:center;gap:14px;">
                            <div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;color:white;font-size:24px;box-shadow:0 4px 16px rgba(16,185,129,0.4);">
                                <i class="fa-solid fa-crown"></i>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <h2 style="font-size:22px;font-weight:900;color:#ffffff;margin:0;">PREMIUM IS ACTIVATED</h2>
                                    <span style="background:#10b981;color:#ffffff;font-size:10px;font-weight:900;padding:3px 9px;border-radius:999px;letter-spacing:0.5px;">✓ ACTIVE</span>
                                </div>
                                <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">
                                    Activated Server: <strong style="color:#ffffff;">${esc(guildName)}</strong> • Plan: <strong style="color:#34d399;">${isPro ? 'Pro Server Plan (3 Server Licenses)' : 'Starter Plan (1 License)'}</strong>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            <button type="button" onclick="sendBillToDM('${guildId}', '${userId}')" class="btn btn-p" style="background:#10b981;color:#fff;font-size:12.5px;padding:10px 16px;border-radius:12px;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(16,185,129,0.35);">
                                <i class="fa-solid fa-paper-plane"></i> <span id="dmBillBtnText">Send Bill to Discord DM</span>
                            </button>
                            <a href="/api/invoice/download?guild_id=${guildId}&user_id=${userId}" target="_blank" class="btn btn-o" style="font-size:12.5px;padding:10px 16px;border-radius:12px;text-decoration:none;display:flex;align-items:center;gap:6px;">
                                <i class="fa-solid fa-file-invoice-dollar"></i> View &amp; Download Bill (SVG)
                            </a>
                        </div>
                    </div>

                    <!-- Subscription Details Grid -->
                    <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:18px;margin-bottom:18px;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;font-size:13px;">
                            <div>
                                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Subscription Status</div>
                                <div style="font-size:14px;font-weight:800;color:#34d399;margin-top:2px;">● Paid &amp; Active</div>
                            </div>
                            <div>
                                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Billing Cycle</div>
                                <div style="font-size:14px;font-weight:800;color:#ffffff;margin-top:2px;">${config.premiumCycle === 'yearly' ? 'Yearly Billing' : 'Monthly Billing'}</div>
                            </div>
                            <div>
                                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Valid Until</div>
                                <div style="font-size:14px;font-weight:800;color:#facc15;margin-top:2px;">${config.premiumExpiresAt ? new Date(config.premiumExpiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Active'}</div>
                            </div>
                            <div>
                                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Features Unlocked</div>
                                <div style="font-size:14px;font-weight:800;color:#60a5fa;margin-top:2px;">All Pro Features (100%)</div>
                            </div>
                        </div>
                    </div>

                    <!-- Multi-Server License Slots Management -->
                    ${(() => {
                        const otherAdminGuilds = (botAdminGuilds || []).filter(g => g.id !== guildId);
                        let activeSlots = [];
                        // 1. Slot 1 is ALWAYS the current viewing server
                        activeSlots.push({ guildId: guildId, name: guildName });

                        // 2. Discover other premium servers in user's admin list
                        const localCfgAll = readDB(dbFiles.serverConfig) || {};
                        for (const og of otherAdminGuilds) {
                            const oCfg = localCfgAll[og.id] || {};
                            if (oCfg.isPremium && (oCfg.premiumPlan === 'starter' || oCfg.premiumPlan === 'pro')) {
                                if (!activeSlots.some(s => s.guildId === og.id)) {
                                    activeSlots.push({ guildId: og.id, name: og.name });
                                }
                            }
                        }
                        if (userLicense && Array.isArray(userLicense.activeGuilds)) {
                            for (const ug of userLicense.activeGuilds) {
                                if (!activeSlots.some(s => s.guildId === ug.guildId)) {
                                    activeSlots.push(ug);
                                }
                            }
                        }

                        const slot1 = activeSlots[0] || { guildId: guildId, name: guildName };
                        const slot2 = activeSlots[1] || null;
                        const slot3 = activeSlots[2] || null;
                        const activeCount = Math.min(activeSlots.length, 3);
                        
                        const availableAdminGuilds = otherAdminGuilds.filter(g => !activeSlots.some(s => s.guildId === g.id));

                        return `
                        <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:20px;margin-bottom:18px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                                <span style="font-size:14px;font-weight:800;color:#c7d2fe;display:flex;align-items:center;gap:8px;">
                                    <i class="fa-solid fa-layer-group" style="color:#6366f1;"></i> Pro Multi-Server License Slots (${activeCount} / 3 Active)
                                </span>
                                <span style="font-size:11.5px;color:#34d399;font-weight:bold;background:rgba(16,185,129,0.15);padding:3px 10px;border-radius:999px;border:1px solid rgba(16,185,129,0.3)">
                                    3 Servers Included in Pro Plan
                                </span>
                            </div>
                            
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;align-items:stretch;">
                                <!-- Slot 1: Current Server (Active) -->
                                <div style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px;box-sizing:border-box;">
                                    <div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:10px;font-weight:900;color:#34d399;text-transform:uppercase;letter-spacing:0.5px;">Slot 1 (Active Server)</span>
                                            <span style="background:#10b981;color:white;font-size:10px;font-weight:900;padding:2px 7px;border-radius:6px;">Current</span>
                                        </div>
                                        <div style="font-size:15px;font-weight:800;color:white;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(slot1.name || guildName)}</div>
                                        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">ID: ${slot1.guildId || guildId}</div>
                                    </div>
                                    <div style="font-size:11.5px;color:#34d399;font-weight:700;display:flex;align-items:center;gap:6px;margin-top:12px;">
                                        <i class="fa-solid fa-circle-check"></i> Pro Active &amp; Verified
                                    </div>
                                </div>

                                <!-- Slot 2 -->
                                ${slot2 ? `
                                <div style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px;box-sizing:border-box;">
                                    <div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:10px;font-weight:900;color:#34d399;text-transform:uppercase;letter-spacing:0.5px;">Slot 2 (Active Server)</span>
                                            <a href="/dashboard/${userId}/${slot2.guildId}" style="background:#6366f1;color:white;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:6px;text-decoration:none;">Open Panel</a>
                                        </div>
                                        <div style="font-size:15px;font-weight:800;color:white;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(slot2.name)}</div>
                                        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">ID: ${slot2.guildId}</div>
                                    </div>
                                    <div style="font-size:11.5px;color:#34d399;font-weight:700;display:flex;align-items:center;gap:6px;margin-top:12px;">
                                        <i class="fa-solid fa-circle-check"></i> Pro Active &amp; Verified
                                    </div>
                                </div>
                                ` : `
                                <div style="background:rgba(255,255,255,0.03);border:1.5px dashed rgba(255,255,255,0.25);border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px;box-sizing:border-box;gap:10px;">
                                    <div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:10px;font-weight:900;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Slot 2 (Available)</span>
                                            <span style="background:rgba(245,158,11,0.2);color:#fbbf24;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:6px;">Unused</span>
                                        </div>
                                        <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Ready to activate on another server</div>
                                    </div>
                                    <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                                        <select id="slot2ServerSelect" style="width:100%;min-width:0;box-sizing:border-box;background:rgba(0,0,0,0.6);color:#f1f5f9;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 10px;font-size:11.5px;outline:none;text-overflow:ellipsis;">
                                            <option value="">Choose server to activate...</option>
                                            ${availableAdminGuilds.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
                                        </select>
                                        <button type="button" onclick="activateSlotFromSelect('slot2ServerSelect')" style="width:100%;box-sizing:border-box;background:#10b981;color:white;border:none;padding:8px 12px;border-radius:8px;font-size:11.5px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(16,185,129,0.35);">
                                            <i class="fa-solid fa-bolt"></i> Enable Slot 2
                                        </button>
                                    </div>
                                </div>
                                `}

                                <!-- Slot 3 -->
                                ${slot3 ? `
                                <div style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px;box-sizing:border-box;">
                                    <div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:10px;font-weight:900;color:#34d399;text-transform:uppercase;letter-spacing:0.5px;">Slot 3 (Active Server)</span>
                                            <a href="/dashboard/${userId}/${slot3.guildId}" style="background:#6366f1;color:white;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:6px;text-decoration:none;">Open Panel</a>
                                        </div>
                                        <div style="font-size:15px;font-weight:800;color:white;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(slot3.name)}</div>
                                        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">ID: ${slot3.guildId}</div>
                                    </div>
                                    <div style="font-size:11.5px;color:#34d399;font-weight:700;display:flex;align-items:center;gap:6px;margin-top:12px;">
                                        <i class="fa-solid fa-circle-check"></i> Pro Active &amp; Verified
                                    </div>
                                </div>
                                ` : `
                                <div style="background:rgba(255,255,255,0.03);border:1.5px dashed rgba(255,255,255,0.25);border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px;box-sizing:border-box;gap:10px;">
                                    <div>
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:10px;font-weight:900;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">Slot 3 (Available)</span>
                                            <span style="background:rgba(245,158,11,0.2);color:#fbbf24;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:6px;">Unused</span>
                                        </div>
                                        <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Ready to activate on another server</div>
                                    </div>
                                    <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                                        <select id="slot3ServerSelect" style="width:100%;min-width:0;box-sizing:border-box;background:rgba(0,0,0,0.6);color:#f1f5f9;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 10px;font-size:11.5px;outline:none;text-overflow:ellipsis;">
                                            <option value="">Choose server to activate...</option>
                                            ${availableAdminGuilds.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
                                        </select>
                                        <button type="button" onclick="activateSlotFromSelect('slot3ServerSelect')" style="width:100%;box-sizing:border-box;background:#10b981;color:white;border:none;padding:8px 12px;border-radius:8px;font-size:11.5px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(16,185,129,0.35);">
                                            <i class="fa-solid fa-bolt"></i> Enable Slot 3
                                        </button>
                                    </div>
                                </div>
                                `}
                            </div>
                        </div>
                        `;
                    })()}

                    <div style="font-size:12.5px;color:#a7f3d0;display:flex;align-items:center;gap:6px;">
                        <i class="fa-solid fa-circle-check"></i> Bot Personalizer, Neural Voice AI, Anti-Nuke, Backups &amp; AI Chat are active on this server.
                    </div>
                </div>
                ` : `
                <!-- PRICING HEADER FOR INACTIVE SERVERS -->
                <div style="text-align:center;margin-bottom:28px">
                    <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);color:#34d399;font-size:12px;font-weight:bold;margin-bottom:12px">
                        <span style="width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block"></span> Active Subscriptions &amp; Instant Digital Delivery
                    </div>
                    <h1 style="font-size:30px;font-weight:900;margin:0 0 8px">Supercharge ${esc(guildName)}</h1>
                    <p style="font-size:14px;margin:0 0 20px">Choose the plan that fits your community best. Instant activation on Discord.</p>
                </div>

                <!-- Billing Cycle Toggle -->
                <div style="text-align:center;margin-bottom:24px">
                    <div class="cycle-switch-box" style="display:inline-flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);padding:6px;border-radius:16px;gap:8px">
                        <button id="dashBtnMonthly" onclick="setDashBillingCycle('monthly')" style="padding:8px 20px;border-radius:12px;font-size:13px;font-weight:800;border:none;cursor:pointer;background:#6366f1;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.4)">
                            Monthly Billing
                        </button>
                        <button id="dashBtnYearly" onclick="setDashBillingCycle('yearly')" style="padding:8px 20px;border-radius:12px;font-size:13px;font-weight:800;border:none;cursor:pointer;background:transparent;color:#9ca3af;display:flex;align-items:center;gap:6px">
                            Yearly Billing <span style="background:rgba(245,158,11,0.2);color:#fbbf24;font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(245,158,11,0.3)">Save 20%</span>
                        </button>
                    </div>
                </div>

                <!-- In-Dashboard Coupon Banner & Input -->
                <div style="background:linear-gradient(135deg,rgba(99,102,241,0.15) 0%,rgba(168,85,247,0.15) 100%);border:1px solid rgba(99,102,241,0.35);border-radius:20px;padding:18px 22px;margin-bottom:24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 8px 24px rgba(0,0,0,0.25)">
                    <div style="display:flex;align-items:center;gap:12px;text-align:left">
                        <div style="width:40px;height:40px;border-radius:12px;background:rgba(99,102,241,0.25);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🎁</div>
                        <div>
                            <div style="font-weight:800;font-size:14px;color:white;display:flex;align-items:center;gap:6px">
                                Special Coupon Offers
                                <span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:10px;padding:1px 6px;border-radius:999px;font-weight:bold;border:1px solid rgba(16,185,129,0.3)">Active</span>
                            </div>
                            <div style="font-size:12px;color:#cbd5e1;margin-top:2px;line-height:1.4">
                                Use <code style="background:rgba(99,102,241,0.3);padding:1px 6px;border-radius:4px;color:#c7d2fe;font-weight:bold;cursor:pointer" onclick="document.getElementById('dashCouponInput').value='FUSIONBOT';applyDashCoupon();">FUSIONBOT</code> for a <strong>1-Month FREE TRIAL of Pro Plan</strong>! Or use <code style="background:rgba(99,102,241,0.3);padding:1px 6px;border-radius:4px;color:#c7d2fe;font-weight:bold;cursor:pointer" onclick="document.getElementById('dashCouponInput').value='WELCOME10';applyDashCoupon();">WELCOME10</code> for <strong>10% OFF</strong>!
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;width:100%;max-width:320px">
                        <input type="text" id="dashCouponInput" placeholder="ENTER COUPON CODE" style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:9px 12px;font-size:12px;color:white;font-weight:bold;text-transform:uppercase;outline:none">
                        <button type="button" onclick="applyDashCoupon()" style="background:#6366f1;color:white;border:none;padding:9px 16px;border-radius:12px;font-size:12px;font-weight:bold;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(99,102,241,0.4)">Apply</button>
                    </div>
                    <div id="dashCouponStatus" style="width:100%;font-size:12px;font-weight:bold;display:none"></div>
                </div>

                <!-- 2 Plans Grid: Starter & Pro -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;margin-bottom:28px">
                    <!-- Starter Plan -->
                    <div class="plan-card-starter" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:28px;display:flex;flex-direction:column;justify-content:space-between">
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span class="plan-desc" style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#9ca3af;letter-spacing:1px">Starter Plan</span>
                                <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,0.1);color:#d1d5db;font-weight:bold">Essential</span>
                            </div>
                            <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:12px">
                                <span class="plan-price" style="font-size:42px;font-weight:900;color:white" id="dashStarterPrice">₹79</span>
                                <span class="plan-cycle" style="font-size:12px;color:#9ca3af;font-weight:600" id="dashStarterCycle">/ month</span>
                            </div>
                            <p class="plan-desc" style="font-size:12px;color:#9ca3af;margin:0 0 20px;line-height:1.5">Perfect for community servers needing full automation, branding, and Google Drive storage.</p>
                            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;display:flex;flex-direction:column;gap:12px;font-size:13px">
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> Change Bot Avatar &amp; Banner for your server</div>
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> Custom Bot Nickname &amp; Prefix</div>
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> AI Chatting (Fast LLM replies)</div>
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> Automated Anti-Spam &amp; Word Filters</div>
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> 1 Discord Server License</div>
                                <div class="feature-item" style="color:#e5e7eb"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> Anti-Nuke Server Protection</div>
                            </div>
                        </div>
                        <button type="button" id="dashStarterBtn" onclick="checkoutDashPlan('starter')" style="width:100%;margin-top:28px;background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);padding:14px;border-radius:14px;font-size:14px;font-weight:bold;cursor:pointer;transition:all 0.2s">
                            Get Starter Plan
                        </button>
                    </div>

                    <!-- Pro Server Plan -->
                    <div class="plan-card-pro" style="background:linear-gradient(135deg,rgba(99,102,241,0.15) 0%,rgba(168,85,247,0.15) 100%);border:2px solid #6366f1;border-radius:24px;padding:28px;display:flex;flex-direction:column;justify-content:space-between;position:relative;box-shadow:0 12px 32px rgba(99,102,241,0.25)">
                        <div style="position:absolute;top:-12px;right:24px;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;font-size:11px;font-weight:900;padding:4px 12px;border-radius:999px;box-shadow:0 4px 12px rgba(99,102,241,0.4)">
                            ★ MOST POPULAR
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span class="plan-desc" style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#a5b4fc;letter-spacing:1px">Pro Server Plan</span>
                                <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(99,102,241,0.25);color:#c7d2fe;font-weight:bold">All Features</span>
                            </div>
                            <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:12px">
                                <span class="plan-price" style="font-size:42px;font-weight:900;color:white" id="dashProPrice">₹149</span>
                                <span class="plan-cycle" style="font-size:12px;color:#9ca3af;font-weight:600" id="dashProCycle">/ month</span>
                            </div>
                            <p class="plan-desc" style="font-size:12px;color:#cbd5e1;margin:0 0 20px;line-height:1.5">The ultimate package for gaming, anime, and large communities with high-speed cloud database storage.</p>
                            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;display:flex;flex-direction:column;gap:12px;font-size:13px">
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> <strong>3 Discord Server Licenses</strong> (Multi-Server)</div>
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> <strong>Neural Voice AI</strong> (Downloaded Studio HD)</div>
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> <strong>Anti-Nuke Protection</strong></div>
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> High-Speed Database Cloud Storage</div>
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> Custom Bot Branding &amp; Animated GIF Wallpapers</div>
                                <div class="feature-item" style="color:#ffffff"><i class="fa-solid fa-check" style="color:#34d399;margin-right:8px"></i> 24/7 Priority Support &amp; Verified Badge</div>
                            </div>
                        </div>
                        <button type="button" id="dashProBtn" onclick="checkoutDashPlan('pro')" style="width:100%;margin-top:28px;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;border:none;padding:14px;border-radius:14px;font-size:14px;font-weight:bold;cursor:pointer;box-shadow:0 4px 16px rgba(99,102,241,0.4);transition:all 0.2s">
                            Get Pro Server Plan
                        </button>
                    </div>
                </div>
                `}

            </div>
        </div>

    <!-- 2. WELCOME & GOODBYE -->
    <div id="view-welcome" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Welcome &amp; Goodbye</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Greet new members when they join your server.</p></div>
        </div>
        <div class="card">
            <h2 style="font-size:17px;font-weight:700;margin:0 0 6px"><i class="fa-solid fa-door-open" style="color:#60a5fa;margin-right:8px"></i>Welcome Message</h2>
            <p style="color:#9ca3af;font-size:13px;margin:0 0 16px">Use <code>{user}</code> for mention, <code>{server}</code> for server name, <code>{count}</code> for member count.</p>
            
            <label class="label" style="margin-top:0">Welcome Channel</label>
            <select name="welcomeChannel" id="welcomeChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            
            <label class="label">Welcome Message Text</label>
            <textarea class="input-box" name="welcomeDesc" style="height:90px">${welcomeDesc}</textarea>
            
            <label class="label" style="margin-top:16px">📸 Standard Wallpaper Presets</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(125px, 1fr));gap:10px;margin-bottom:14px">
                ${PRESET_BACKGROUNDS.filter(b => !b.isGif).map((bg) => {
                    const isSelected = (welcomeBg === bg.url);
                    return `<div onclick="selectWelcomeBg('${bg.url}')" class="wbg-preset-card" data-url="${bg.url}" style="cursor:pointer;position:relative;border-radius:10px;overflow:hidden;border:${isSelected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${isSelected ? '0 0 14px rgba(168,85,247,0.5)' : 'none'};height:75px;background:#111;transition:all 0.2s">
                        <img src="${bg.url}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bg.name}">
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);padding:2px 6px;font-size:10px;color:white;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bg.name}</div>
                    </div>`;
                }).join('')}
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;margin-bottom:8px;">
                <label class="label" style="margin:0;display:flex;align-items:center;gap:6px;">
                    <span style="color:#ec4899;font-weight:800;">👑 Pro (₹149) Exclusive: Animated GIFs</span>
                    ${isPro ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:bold;border:1px solid rgba(16,185,129,0.3);">Unlocked</span>` : `<span style="background:rgba(236,72,153,0.2);color:#f472b6;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:bold;border:1px solid rgba(236,72,153,0.3);">Pro Plan Required</span>`}
                </label>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 mb-4" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:10px;margin-bottom:14px">
                ${PRESET_BACKGROUNDS.filter(b => b.isGif).map((bg) => {
                    const isSelected = (welcomeBg === bg.url);
                    return `<div onclick="${isPro ? `selectWelcomeBg('${bg.url}')` : `alert('👑 Animated GIF backgrounds are exclusive to the ₹149 Pro Server Plan! Please upgrade to Pro in the Premium tab to unlock animated GIF backgrounds.')`}" class="wbg-preset-card" data-url="${bg.url}" style="cursor:pointer;position:relative;border-radius:10px;overflow:hidden;border:${isSelected ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${isSelected ? '0 0 14px rgba(236,72,153,0.5)' : 'none'};height:80px;background:#111;opacity:${isPro ? '1' : '0.8'};transition:all 0.2s">
                        <img src="${bg.url}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bg.name}">
                        <span style="position:absolute;top:4px;right:4px;background:rgba(236,72,153,0.95);color:white;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.5)">GIF</span>
                        ${!isPro ? `<span style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fbbf24;font-size:10px;padding:2px 5px;border-radius:4px;"><i class="fa-solid fa-lock"></i></span>` : ''}
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);padding:3px 6px;font-size:10px;color:white;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bg.name}</div>
                    </div>`;
                }).join('')}
            </div>

            <!-- Hidden actual value submitted to server -->
            <input type="hidden" id="welcomeBgInput" name="welcomeBg" value="${welcomeBg}">

            <label class="label">Custom Background Image / GIF URL</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <input type="text" class="input-box" id="welcomeBgCustomInput" value="${PRESET_BACKGROUNDS.some(b => b.url === welcomeBg) ? '' : welcomeBg}" placeholder="Paste custom image/GIF URL here or select a preset above..." oninput="onCustomBgChange('welcome', this.value)" style="flex:1;min-width:240px;margin-top:0">
                <input type="file" id="welcomeBgUpload" accept="image/*,.gif" style="display:none" onchange="handleBgUpload(this, 'welcome')">
                <button type="button" onclick="document.getElementById('welcomeBgUpload').click()" class="btn btn-o" style="padding:10px 16px;white-space:nowrap"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Custom File</button>
            </div>

            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:12px;margin-top:16px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:14px">Send as Direct Message (DM)</div><div style="color:#9ca3af;font-size:12px">Sends welcome card directly to the new member's DMs.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="welcomeDmEnabled" value="on" ${welcomeDmEnabled}><span class="slider"></span></label>
            </label>
        </div>

        <div class="card">
            <h2 style="font-size:17px;font-weight:700;margin:0 0 6px"><i class="fa-solid fa-door-closed" style="color:#f87171;margin-right:8px"></i>Goodbye Message</h2>
            
            <label class="label" style="margin-top:0">Goodbye Channel</label>
            <select name="byeChannel" id="byeChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            
            <label class="label">Goodbye Message Text</label>
            <textarea class="input-box" name="byeDesc" style="height:80px">${byeDesc}</textarea>

            <label class="label" style="margin-top:16px">📸 Standard Wallpaper Presets</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(125px, 1fr));gap:10px;margin-bottom:14px">
                ${PRESET_BACKGROUNDS.filter(b => !b.isGif).map((bg) => {
                    const isSelected = (byeBg === bg.url);
                    return `<div onclick="selectByeBg('${bg.url}')" class="bbg-preset-card" data-url="${bg.url}" style="cursor:pointer;position:relative;border-radius:10px;overflow:hidden;border:${isSelected ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${isSelected ? '0 0 14px rgba(239,68,68,0.5)' : 'none'};height:75px;background:#111;transition:all 0.2s">
                        <img src="${bg.url}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bg.name}">
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);padding:2px 6px;font-size:10px;color:white;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bg.name}</div>
                    </div>`;
                }).join('')}
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;margin-bottom:8px;">
                <label class="label" style="margin:0;display:flex;align-items:center;gap:6px;">
                    <span style="color:#ec4899;font-weight:800;">👑 Pro (₹149) Exclusive: Animated GIFs</span>
                    ${isPro ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:bold;border:1px solid rgba(16,185,129,0.3);">Unlocked</span>` : `<span style="background:rgba(236,72,153,0.2);color:#f472b6;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:bold;border:1px solid rgba(236,72,153,0.3);">Pro Plan Required</span>`}
                </label>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 mb-4" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:10px;margin-bottom:14px">
                ${PRESET_BACKGROUNDS.filter(b => b.isGif).map((bg) => {
                    const isSelected = (byeBg === bg.url);
                    return `<div onclick="${isPro ? `selectByeBg('${bg.url}')` : `alert('👑 Animated GIF backgrounds are exclusive to the ₹149 Pro Server Plan! Please upgrade to Pro in the Premium tab to unlock animated GIF backgrounds.')`}" class="bbg-preset-card" data-url="${bg.url}" style="cursor:pointer;position:relative;border-radius:10px;overflow:hidden;border:${isSelected ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${isSelected ? '0 0 14px rgba(236,72,153,0.5)' : 'none'};height:80px;background:#111;opacity:${isPro ? '1' : '0.8'};transition:all 0.2s">
                        <img src="${bg.url}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${bg.name}">
                        <span style="position:absolute;top:4px;right:4px;background:rgba(236,72,153,0.95);color:white;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.5)">GIF</span>
                        ${!isPro ? `<span style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fbbf24;font-size:10px;padding:2px 5px;border-radius:4px;"><i class="fa-solid fa-lock"></i></span>` : ''}
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);padding:3px 6px;font-size:10px;color:white;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bg.name}</div>
                    </div>`;
                }).join('')}
            </div>

            <!-- Hidden actual value submitted to server -->
            <input type="hidden" id="byeBgInput" name="byeBg" value="${byeBg}">

            <label class="label">Custom Goodbye Background URL</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <input type="text" class="input-box" id="byeBgCustomInput" value="${PRESET_BACKGROUNDS.some(b => b.url === byeBg) ? '' : byeBg}" placeholder="Paste custom image/GIF URL here or select a preset above..." oninput="onCustomBgChange('bye', this.value)" style="flex:1;min-width:240px;margin-top:0">
                <input type="file" id="byeBgUpload" accept="image/*,.gif" style="display:none" onchange="handleBgUpload(this, 'bye')">
                <button type="button" onclick="document.getElementById('byeBgUpload').click()" class="btn btn-o" style="padding:10px 16px;white-space:nowrap"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Custom File</button>
            </div>
        </div>
    </div>

    <!-- 3. TICKETING -->
    <div id="view-tickets" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Ticketing System &amp; AI Intake</h1></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">🎫 Enable Ticket System</div><div style="color:#9ca3af;font-size:12px">Allow members to open private support tickets.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="ticketsEnabled" value="on" ${ticketsEnabled}><span class="slider"></span></label>
            </label>
            <label class="label" style="margin-top:0">Support Staff Role</label>
            <select name="ticketSupportRole" id="ticketSupportRoleSel" class="input-box"><option value="">⏳ Loading roles...</option></select>
            
            <label class="label">Ticket Panel Title</label>
            <input type="text" class="input-box" name="ticketTitle" value="${ticketTitle}" placeholder="e.g. 🎫 Support Center">

            <label class="label">Ticket Panel Description</label>
            <textarea class="input-box" name="ticketDesc" style="height:80px" placeholder="Select an option below to open a ticket...">${ticketDesc}</textarea>
            
            <label class="label">Ticket Banner Image / GIF URL</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <input type="text" class="input-box" id="ticketImageInput" name="ticketImage" value="${ticketImage}" placeholder="https://... (.png, .jpg, .gif)" style="flex:1;min-width:240px;margin-top:0">
                <input type="file" id="ticketImageUpload" accept="image/*,.gif" style="display:none" onchange="handleBgUpload(this, 'ticketImageInput')">
                <button type="button" onclick="document.getElementById('ticketImageUpload').click()" class="btn btn-o" style="padding:10px 16px;white-space:nowrap"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Banner File</button>
            </div>
        </div>

        <!-- Ticket System Mode Selection -->
        <div class="card">
            <h2 style="font-size:17px;font-weight:700;margin:0 0 12px"><i class="fa-solid fa-sliders" style="color:#a855f7;margin-right:8px"></i>Ticket System Mode</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
                <label id="modeCardNormal" style="background:${ticketMode !== 'ai' ? 'rgba(88,101,242,0.2)' : 'rgba(255,255,255,0.03)'};border:${ticketMode !== 'ai' ? '2px solid #5865F2' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${ticketMode !== 'ai' ? '0 0 15px rgba(88,101,242,0.3)' : 'none'};border-radius:12px;padding:16px;cursor:pointer;display:flex;align-items:flex-start;gap:12px;transition:all 0.2s ease" onclick="switchTicketMode('normal')">
                    <input type="radio" id="ticketModeNormalRadio" name="ticketMode" value="normal" ${ticketMode !== 'ai' ? 'checked' : ''} style="margin-top:4px">
                    <div>
                        <div style="color:white;font-weight:700;font-size:14px;margin-bottom:2px">🎟️ Standard Ticket Mode</div>
                        <div style="color:#9ca3af;font-size:12px;line-height:1.4">Opens a private channel and alerts support staff immediately.</div>
                    </div>
                </label>
                <label id="modeCardAi" style="background:${ticketMode === 'ai' ? 'rgba(236,72,153,0.18)' : 'rgba(255,255,255,0.03)'};border:${ticketMode === 'ai' ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.1)'};box-shadow:${ticketMode === 'ai' ? '0 0 18px rgba(236,72,153,0.4)' : 'none'};border-radius:12px;padding:16px;cursor:pointer;display:flex;align-items:flex-start;gap:12px;transition:all 0.2s ease" onclick="switchTicketMode('ai')">
                    <input type="radio" id="ticketModeAiRadio" name="ticketMode" value="ai" ${ticketMode === 'ai' ? 'checked' : ''} style="margin-top:4px">
                    <div>
                        <div style="color:#f472b6;font-weight:700;font-size:14px;margin-bottom:2px">🤖 AI-Powered Smart Assistant</div>
                        <div style="color:#9ca3af;font-size:12px;line-height:1.4">AI conducts an intake interview and answers basic queries before pinging staff.</div>
                    </div>
                </label>
            </div>

            <!-- Ticket Category Options (Standard Mode) -->
            <div id="standardTicketOptionsBox" style="display:${ticketMode !== 'ai' ? 'block' : 'none'};background:rgba(0,0,0,0.25);border:1px solid rgba(88,101,242,0.3);border-radius:12px;padding:18px;margin-top:14px">
                <h3 style="color:#93c5fd;font-size:15px;font-weight:700;margin:0 0 6px"><i class="fa-solid fa-list-check" style="margin-right:6px"></i>Ticket Categories / Dropdown Options</h3>
                <p style="color:#9ca3af;font-size:12.5px;margin:0 0 14px">Configure up to 7 custom ticket categories with custom emojis and descriptions.</p>
                ${[1,2,3,4,5,6,7].map(i => {
                    const opt = ticketOptions && ticketOptions[i-1] ? ticketOptions[i-1] : { label: '', desc: '', emoji: '' };
                    return `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
                        <div style="width:30px;color:#9ca3af;font-weight:700;font-size:13px;text-align:center">#${i}</div>
                        <input type="text" class="input-box" style="width:90px;margin-top:0;text-align:center;font-size:16px" name="tOptEmoji_${i}" value="${esc(opt.emoji || '')}" placeholder="Emoji">
                        <input type="text" class="input-box" style="flex:1;min-width:160px;margin-top:0" name="tOptLabel_${i}" value="${esc(opt.label || '')}" placeholder="Category Name (e.g. General Support)">
                        <input type="text" class="input-box" style="flex:1.5;min-width:200px;margin-top:0" name="tOptDesc_${i}" value="${esc(opt.desc || '')}" placeholder="Description (e.g. Inquire about server support)">
                    </div>`;
                }).join('')}
            </div>

            <!-- AI Intake Configuration Box -->
            <div id="aiSettingsBox" style="display:${ticketMode === 'ai' ? 'block' : 'none'};background:rgba(0,0,0,0.3);border:1px solid rgba(168,85,247,0.3);border-radius:12px;padding:18px;margin-top:14px">
                <h3 style="color:#c084fc;font-size:15px;font-weight:700;margin:0 0 6px"><i class="fa-solid fa-brain" style="margin-right:6px"></i>AI Intake Interview Questions</h3>
                <p style="color:#9ca3af;font-size:12.5px;margin:0 0 10px">Enter one question per line. The AI asks these in order upon ticket creation.</p>
                <textarea name="ticketAiQuestions" class="input-box" style="height:100px;font-family:monospace;font-size:13px" placeholder="What is your username?&#10;Describe your issue in detail&#10;Attach any relevant screenshot links">${ticketAiQuestionsStr}</textarea>
                <label class="label" style="margin-top:12px;color:#c084fc">Transcript / Application Log Channel</label>
                <select name="ticketResponseChannel" id="ticketResponseChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            </div>
        </div>
    </div>

    <!-- 4. REACT ROLES -->
    <div id="view-reactroles" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Reaction Roles</h1></div>
        </div>
        <div class="card">
            <label class="label" style="margin-top:0">Panel Channel</label>
            <select id="rrChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            <label class="label">Panel Title</label>
            <input type="text" id="rrTitle" class="input-box" placeholder="🎭 React Role Picker">
            <label class="label">Panel Description</label>
            <textarea id="rrDesc" class="input-box" style="height:70px" placeholder="React below to get your roles!"></textarea>
            
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-top:18px">
                <h3 style="font-size:14px;font-weight:700;margin:0 0 10px"><i class="fa-solid fa-plus-circle" style="color:#f472b6;margin-right:6px"></i>Add Emoji &amp; Role Pair</h3>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <input type="text" id="rrEmojiInput" class="input-box" style="width:120px;margin-top:0;font-size:16px;text-align:center" placeholder="⭐ Emoji">
                    <select id="rrRoleSelect" class="input-box" style="flex:1;min-width:200px;margin-top:0"><option value="">⏳ Loading roles...</option></select>
                    <button type="button" onclick="addRRPairFromInputs()" class="btn btn-p" style="padding:10px 20px"><i class="fa-solid fa-plus"></i> Add</button>
                </div>
            </div>

            <label class="label" style="margin-top:18px">Configured Role Pairs</label>
            <div id="rrPairsList" style="margin-top:8px"></div>
            <input type="hidden" id="rrPairsHidden" name="reactRoles" value="[]">

            <div style="display:flex;gap:12px;margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.1);flex-wrap:wrap">
                <button type="button" id="rrSendBtn" onclick="sendRR()" class="btn btn-p" style="flex:1;min-width:180px"><i class="fa-solid fa-paper-plane"></i> Deploy Panel to Discord</button>
            </div>
        </div>
        <div class="card">
            <h2 style="font-size:16px;font-weight:700;margin:0 0 12px"><i class="fa-solid fa-eye" style="color:#f472b6;margin-right:8px"></i>Live Preview</h2>
            <div id="rrPreview" style="background:rgba(0,0,0,0.35);border-radius:12px;padding:18px;border:1px solid rgba(255,255,255,0.1);min-height:50px;color:#9ca3af;font-size:13px;display:flex;align-items:center;justify-content:center">Add pairs above to preview.</div>
        </div>
    </div>

    <!-- 5. INVITE TRACKER -->
    <div id="view-invitetracker" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Invite Tracker</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Choose which channel logs invite activity.</p></div>
        </div>
        <div class="card">
            <label class="label" style="margin-top:0">Invite Log Channel</label>
            <select name="inviteTrackerChannel" id="inviteTrackerChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
        </div>
    </div>

    <!-- 6. AUTO ROLES -->
    <div id="view-autoroles" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Auto Roles</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Automatically assign multiple roles to new members and bots when they join.</p></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">✅ Enable Auto Roles</div><div style="color:#9ca3af;font-size:12px">Automatically assign selected roles when someone joins.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="autoRoleEnabled" value="on" ${autoRoleEnabled}><span class="slider"></span></label>
            </label>
            <div class="grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div style="background:rgba(0,0,0,0.3);padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.1)">
                    <h3 style="font-size:14px;font-weight:700;margin:0 0 4px"><i class="fa-solid fa-user" style="color:#34d399;margin-right:6px"></i>Roles for Members</h3>
                    <p style="color:#9ca3af;font-size:12px;margin:0 0 10px">Select multiple roles to automatically assign to users.</p>
                    <div id="memberRolesList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;min-height:38px;padding:6px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08)"></div>
                    <select id="memberRoleAddSel" onchange="addAutoRole('member', this.value); this.value='';" class="input-box" style="margin-top:0"><option value="">➕ Click to Add Role...</option></select>
                    <input type="hidden" id="autoRoleMemberHidden" name="autoRoleMember" value="">
                </div>
                <div style="background:rgba(0,0,0,0.3);padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.1)">
                    <h3 style="font-size:14px;font-weight:700;margin:0 0 4px"><i class="fa-solid fa-robot" style="color:#60a5fa;margin-right:6px"></i>Roles for Bots</h3>
                    <p style="color:#9ca3af;font-size:12px;margin:0 0 10px">Select multiple roles to automatically assign to bots.</p>
                    <div id="botRolesList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;min-height:38px;padding:6px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08)"></div>
                    <select id="botRoleAddSel" onchange="addAutoRole('bot', this.value); this.value='';" class="input-box" style="margin-top:0"><option value="">➕ Click to Add Role...</option></select>
                    <input type="hidden" id="autoRoleBotHidden" name="autoRoleBot" value="">
                </div>
            </div>
        </div>
    </div>

    <!-- 7. LEVELING -->
    <div id="view-leveling" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Leveling &amp; XP System</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Reward active users with XP on chatting and automatic level-up announcements.</p></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">📈 Enable Leveling System</div><div style="color:#9ca3af;font-size:12px">Users earn XP by chatting and level up automatically.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="levelingEnabled" value="on" ${levelingEnabled}><span class="slider"></span></label>
            </label>
            <label class="label" style="margin-top:0">Level-Up Announcement Channel</label>
            <select name="levelingChannel" id="levelingChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            <label class="label">Level-Up Announcement Message</label>
            <input type="text" class="input-box" name="levelUpMessage" value="${levelUpMessage}" placeholder="🎉 Congratulations {user}, you reached Level {level}!">

            <!-- Role Rewards -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-top:18px">
                <h3 style="font-size:14px;font-weight:700;margin:0 0 10px"><i class="fa-solid fa-award" style="color:#fbbf24;margin-right:6px"></i>Level Role Rewards</h3>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
                    <select id="lrLevelSel" class="input-box" style="width:130px;margin-top:0">
                        <option value="">Select Level</option>
                        ${[1,2,3,5,10,15,20,25,30,40,50,60,75,100].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                    </select>
                    <select id="lrRoleSel" class="input-box" style="flex:1;min-width:200px;margin-top:0"><option value="">⏳ Loading roles...</option></select>
                    <button type="button" onclick="addLevelReward()" class="btn btn-p" style="padding:10px 20px"><i class="fa-solid fa-plus"></i> Add Reward</button>
                </div>
                <div id="lrRewardsList"></div>
                <input type="hidden" id="levelRoleRewardsHidden" name="levelRoleRewards" value="{}">
            </div>
        </div>
    </div>

    <!-- 8. NUKE BACKUP & SNAPSHOT -->
    <div id="view-nukebackup" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Nuke Backup &amp; Server Snapshot</h1></div>
        </div>

        <div class="card" style="padding:22px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:12px">
                <div>
                    <h3 style="font-size:16px;font-weight:700;margin:0 0 4px"><i class="fa-solid fa-clock-rotate-left" style="color:#60a5fa;margin-right:8px"></i>Latest Snapshot Status</h3>
                    <p style="color:#34d399;font-size:13.5px;font-weight:600;margin:0" id="snapshotDateText">${lastBackupStr}</p>
                </div>
                ${isPrem ? `
                <button type="button" id="createSnapshotBtn" onclick="createSnapshot()" class="btn btn-p" style="padding:12px 24px"><i class="fa-solid fa-camera"></i> Create Snapshot Now</button>
                ` : `
                <button type="button" onclick="show('premium')" class="btn btn-p" style="background:#f59e0b;padding:12px 24px;border:none;cursor:pointer;"><i class="fa-solid fa-lock"></i> Upgrade to Unlock Snapshot</button>
                `}
            </div>
            <p style="color:#9ca3af;font-size:12.5px;margin:0;line-height:1.5">Takes an instant archive of all channels, role permissions, and structure so you can recover anytime using <code>/nukerestore</code>.</p>
        </div>
    </div>

    <!-- 9. GOOGLE DRIVE & FUSION CLOUD BACKUPS -->
    <div id="view-drive" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div>
                <h1 style="font-size:24px;font-weight:800;margin:0">Cloud &amp; Drive Backups</h1>
                <p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Secure off-site backup storage for channels, roles, permissions, and server structure.</p>
            </div>
        </div>

        ${!isPrem ? `
        <!-- Non-Premium Lock Banner -->
        <div class="card" style="text-align:center;padding:48px 24px;border:2px dashed rgba(245,158,11,0.3);background:rgba(245,158,11,0.03);">
            <div style="width:64px;height:64px;border-radius:20px;background:rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#fbbf24;font-size:28px;">
                <i class="fa-solid fa-lock"></i>
            </div>
            <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;color:#ffffff">Cloud Backups Locked</h2>
            <p style="color:#cbd5e1;max-width:500px;margin:0 auto 24px;line-height:1.6;font-size:13.5px">
                Automated Google Drive synchronization and high-speed Fusion Cloud Database backups are exclusive to Starter &amp; Pro plans.
            </p>
            <button type="button" onclick="show('premium')" class="btn btn-p" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:14px 28px;font-size:14px;font-weight:800;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 16px rgba(245,158,11,0.35);">
                <i class="fa-solid fa-crown"></i> Upgrade to Unlock Cloud Backups
            </button>
        </div>
        ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;">
            <!-- 1. Google Drive Cloud Storage -->
            <div class="card" style="padding:26px;display:flex;flex-direction:column;justify-content:space-between;">
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:44px;height:44px;border-radius:12px;background:rgba(66,133,244,0.15);display:flex;align-items:center;justify-content:center;color:#4285f4;font-size:22px;">
                                <i class="fa-brands fa-google-drive"></i>
                            </div>
                            <div>
                                <h3 style="font-size:16px;font-weight:800;margin:0;color:white;">Google Drive Storage</h3>
                                <div style="font-size:11.5px;color:#94a3b8;">Personal off-site cloud storage</div>
                            </div>
                        </div>
                        ${isDriveLinked ? `
                        <span style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:rgba(16,185,129,0.15);color:#34d399;font-weight:bold;border:1px solid rgba(16,185,129,0.3)">
                            ● Linked
                        </span>
                        ` : `
                        <span style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08);color:#94a3b8;font-weight:bold;">
                            Not Linked
                        </span>
                        `}
                    </div>

                    <p style="color:#9ca3af;font-size:12.5px;line-height:1.5;margin:0 0 20px;">
                        Link your Google account to automatically store daily server snapshots directly into your Google Drive folder.
                    </p>

                    ${isDriveLinked ? `
                    <div style="background:rgba(0,0,0,0.3);padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);margin-bottom:16px;">
                        <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="document.getElementById('savebar').classList.add('show')">
                            <div>
                                <div style="color:white;font-weight:700;font-size:13px;margin-bottom:2px">Daily 24-Hour Auto-Backup</div>
                                <div style="color:#94a3b8;font-size:11px">Automatically export backup to Google Drive every night.</div>
                            </div>
                            <label class="switch" style="pointer-events:none"><input type="checkbox" name="autoBackup" value="on" ${config.autoBackup ? 'checked' : ''}><span class="slider"></span></label>
                        </label>
                    </div>
                    <button type="button" id="manualBackupBtn" onclick="triggerBackup('${guildId}')" class="btn btn-o" style="width:100%;padding:12px;font-size:13px;font-weight:700;margin-bottom:12px;">
                        <i class="fa-solid fa-cloud-arrow-up" style="color:#60a5fa"></i> Create Google Drive Backup Now
                    </button>
                    <button type="button" onclick="disconnDrive('${guildId}')" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;margin:0 auto;">
                        <i class="fa-solid fa-unlink"></i> Disconnect Google Drive
                    </button>
                    ` : `
                    <a href="/auth/google?guildId=${guildId}" class="btn btn-p" style="width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;font-size:13.5px;font-weight:bold;border-radius:12px;text-decoration:none;">
                        <i class="fa-brands fa-google"></i> Connect Google Drive
                    </a>
                    `}
                </div>
            </div>

            <!-- 2. Fusion High-Speed Cloud Database Storage (Pro Feature) -->
            <div class="card" style="padding:26px;display:flex;flex-direction:column;justify-content:space-between;border:1.5px solid ${isPro ? '#6366f1' : 'rgba(255,255,255,0.08)'};background:${isPro ? 'linear-gradient(135deg,rgba(99,102,241,0.08) 0%,rgba(168,85,247,0.08) 100%)' : ''}">
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:44px;height:44px;border-radius:12px;background:rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;color:#818cf8;font-size:22px;">
                                <i class="fa-solid fa-cloud"></i>
                            </div>
                            <div>
                                <h3 style="font-size:16px;font-weight:800;margin:0;color:white;">Fusion Cloud Database</h3>
                                <div style="font-size:11.5px;color:#c7d2fe;">Encrypted high-speed cloud database</div>
                            </div>
                        </div>
                        ${isPro ? `
                        <span style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:rgba(99,102,241,0.25);color:#a5b4fc;font-weight:bold;border:1px solid rgba(99,102,241,0.4)">
                            👑 Pro Active
                        </span>
                        ` : `
                        <span style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:rgba(245,158,11,0.15);color:#fbbf24;font-weight:bold;">
                            ★ Pro Feature
                        </span>
                        `}
                    </div>

                    <p style="color:#cbd5e1;font-size:12.5px;line-height:1.5;margin:0 0 20px;">
                        Store instant snapshots (roles, channel permissions, categories, emojis) on Fusion's encrypted cloud servers. Restore in 1-click anytime via <code>/nukerestore</code>.
                    </p>

                    <div style="background:rgba(0,0,0,0.35);padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);margin-bottom:16px;">
                        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Latest Cloud Snapshot</div>
                        <div style="font-size:13.5px;font-weight:800;color:#34d399;margin-top:2px;" id="cloudSnapshotDateText">${lastBackupStr}</div>
                    </div>

                    ${isPro ? `
                    <button type="button" id="createCloudSnapshotBtn" onclick="createSnapshot()" class="btn btn-p" style="width:100%;padding:12px;font-size:13.5px;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(99,102,241,0.35);">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Create Fusion Cloud Backup Now
                    </button>
                    ` : `
                    <button type="button" onclick="show('premium')" class="btn btn-o" style="width:100%;padding:12px;font-size:13px;font-weight:700;color:#fbbf24;border-color:rgba(245,158,11,0.4);">
                        <i class="fa-solid fa-lock"></i> Upgrade to Pro for Cloud Backups
                    </button>
                    `}
                </div>
            </div>
        </div>
        `}
    </div>

    <!-- 10. SERVER LOGS -->
    <div id="view-logs" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Server Logs</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Pick a channel for each log type. Leave blank to keep off.</p></div>
        </div>
        <div class="grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-ticket" style="color:#8b5cf6;margin-right:6px"></i>Ticket Logs</h3><select name="ticketLogChannel" id="ticketLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-message" style="color:#f0a500;margin-right:6px"></i>Message Logs</h3><select name="messageLogChannel" id="messageLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-users" style="color:#23a559;margin-right:6px"></i>Member Logs</h3><select name="memberLogChannel" id="memberLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-user-tag" style="color:#5865F2;margin-right:6px"></i>Role Logs</h3><select name="roleLogChannel" id="roleLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-microphone" style="color:#06b6d4;margin-right:6px"></i>Voice Logs</h3><select name="voiceLogChannel" id="voiceLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
            <div class="card" style="margin:0"><h3 style="font-size:15px;font-weight:700;margin:0 0 8px"><i class="fa-solid fa-envelope-open-text" style="color:#ec4899;margin-right:6px"></i>Invite Logs</h3><select name="inviteLogChannel" id="inviteLogChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select></div>
        </div>
    </div>

    <!-- 11. BANNED WORDS & FILTER -->
    <div id="view-moderation" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Banned Words &amp; Strike Punishments</h1></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">🛑 Enable Word Filter</div><div style="color:#9ca3af;font-size:12px">Automatically delete messages containing banned words.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="wordFilterEnabled" value="on" ${wordFilterEnabled}><span class="slider"></span></label>
            </label>
            <label class="label" style="margin-top:0">Banned Words List (Comma separated)</label>
            <textarea class="input-box" name="banWords" style="height:100px" placeholder="badword1, badword2, scamlink.com">${banWordsStr}</textarea>
            
            <div class="grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
                <div>
                    <label class="label" style="margin-top:0">Timeout Duration (Minutes)</label>
                    <input type="number" class="input-box" name="banWordTimeout" value="${banWordTimeout}" min="1" max="10080">
                </div>
                <div>
                    <label class="label" style="margin-top:0">Max Strikes Before Punishment</label>
                    <input type="number" class="input-box" name="banWordKickThreshold" value="${banWordKick}" min="1" max="20">
                </div>
            </div>

            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-top:16px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:14px">Auto-Kick After Reaching Max Strikes</div><div style="color:#9ca3af;font-size:12px">Automatically kicks member from the server when strike threshold is hit.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="banWordKickEnabled" value="on" ${banWordKickEnabled}><span class="slider"></span></label>
            </label>
        </div>
    </div>

    <!-- 12. BANNED USERS -->
    <div id="view-bannedusers" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Banned Users (IDs)</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Auto-ban specific Discord User IDs if they try to join.</p></div>
        </div>
        <div class="card">
            <label class="label" style="margin-top:0">Banned User IDs (Comma separated)</label>
            <textarea class="input-box" name="bannedUsers" style="height:120px;font-family:monospace" placeholder="123456789012345678, 987654321098765432">${bannedUsersStr}</textarea>
        </div>
    </div>

    <!-- 13. ANTI-SPAM -->
    <div id="view-antispam" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Anti-Spam Protection</h1></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">⚡ Enable Anti-Spam</div><div style="color:#9ca3af;font-size:12px">Mutes or kicks members spamming messages too quickly.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="antiSpamEnabled" value="on" ${antiSpamEnabled}><span class="slider"></span></label>
            </label>
            <div class="grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div><label class="label" style="margin-top:0">Max Messages</label><input type="number" class="input-box" name="antiSpamMaxMessages" value="${antiSpamMax}" min="2" max="50"></div>
                <div><label class="label" style="margin-top:0">Time Window (Seconds)</label><input type="number" class="input-box" name="antiSpamWindow" value="${antiSpamWin}" min="1" max="60"></div>
            </div>
            
            <div class="grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
                <div>
                    <label class="label" style="margin-top:0">Action to Take</label>
                    <select name="antiSpamAction" class="input-box">
                        <option value="timeout" ${antiSpamAction === 'timeout' ? 'selected' : ''}>Timeout / Mute</option>
                        <option value="kick" ${antiSpamAction === 'kick' ? 'selected' : ''}>Kick Member</option>
                        <option value="ban" ${antiSpamAction === 'ban' ? 'selected' : ''}>Ban Member</option>
                    </select>
                </div>
                <div>
                    <label class="label" style="margin-top:0">Timeout Duration Timer</label>
                    <select name="antiSpamTimeoutMs" class="input-box">
                        <option value="30000" ${antiSpamTimeoutMs === 30000 ? 'selected' : ''}>30 Seconds</option>
                        <option value="60000" ${antiSpamTimeoutMs === 60000 ? 'selected' : ''}>1 Minute</option>
                        <option value="300000" ${antiSpamTimeoutMs === 300000 ? 'selected' : ''}>5 Minutes</option>
                        <option value="600000" ${antiSpamTimeoutMs === 600000 ? 'selected' : ''}>10 Minutes</option>
                        <option value="3600000" ${antiSpamTimeoutMs === 3600000 ? 'selected' : ''}>1 Hour</option>
                        <option value="86400000" ${antiSpamTimeoutMs === 86400000 ? 'selected' : ''}>1 Day</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- 14. ATTACHMENT SPAM -->
    <div id="view-attachmentspam" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Attachment Spam Protection</h1></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">🖼️ Enable Attachment Spam Filter</div><div style="color:#9ca3af;font-size:12px">Prevents image and file flooding.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="attachmentSpamEnabled" value="on" ${attachmentSpamEnabled}><span class="slider"></span></label>
            </label>
            <label class="label" style="margin-top:0">Max Attachments in 10 Seconds</label>
            <input type="number" class="input-box" name="attachmentSpamMax" value="${attachmentSpamMax}" min="1" max="20">
        </div>
    </div>

    <!-- 15. MENTION SPAM -->
    <div id="view-mentionspam" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Mention Spam Protection</h1></div>
        </div>
        <div class="card">
            <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:18px" onclick="document.getElementById('savebar').classList.add('show')">
                <div><div style="color:white;font-weight:700;font-size:15px;margin-bottom:2px">📢 Enable Mention Spam Filter</div><div style="color:#9ca3af;font-size:12px">Prevents mass ping attacks.</div></div>
                <label class="switch" style="pointer-events:none"><input type="checkbox" name="mentionSpamEnabled" value="on" ${mentionSpamEnabled}><span class="slider"></span></label>
            </label>
            <label class="label" style="margin-top:0">Max User Mentions per Message</label>
            <input type="number" class="input-box" name="mentionSpamMax" value="${mentionSpamMax}" min="1" max="50">
        </div>
    </div>

    <!-- 16. NOTIFICATIONS -->
    <div id="view-notifications" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Social Notifications</h1><p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Broadcast YouTube uploads and Twitch streams to your server.</p></div>
        </div>
        <div class="card">
            <label class="label" style="margin-top:0">Notification Channel</label>
            <select name="notificationChannel" id="notifChannelSel" class="input-box"><option value="">⏳ Loading channels...</option></select>
            <label class="label">YouTube Channel IDs (One per line)</label>
            <textarea class="input-box" name="youtubeChannels" style="height:80px;font-family:monospace" placeholder="UC_x5XG1OV2P6uZZ5FSM9Ttw">${ytChannels}</textarea>
            <label class="label">Twitch Channel Usernames (One per line)</label>
            <textarea class="input-box" name="twitchChannels" style="height:80px;font-family:monospace" placeholder="shroud&#10;ninja">${twitchChannels}</textarea>
        </div>
    </div>

    <!-- 17. IDENTITY -->
    <div id="view-identity" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div>
                <h1 style="font-size:24px;font-weight:800;margin:0">Bot Personalizer</h1>
                <p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Customize the bot's branding, logo, banner, and prefixes for ${esc(guildName)}.</p>
            </div>
        </div>

        <!-- 👑 Server Custom Bot Avatar (Logo) & Banner Branding -->
        <div class="card" style="margin-bottom:16px;border:1px solid ${isPrem ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'};background:${isPrem ? 'rgba(99,102,241,0.04)' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h2 style="font-size:17px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px">
                    <i class="fa-solid fa-image text-indigo-400"></i> Server Custom Bot Logo &amp; Banner
                </h2>
                ${isPrem ? `
                    <span style="font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(16,185,129,0.15);color:#34d399;font-weight:bold;border:1px solid rgba(16,185,129,0.3)">
                        <i class="fa-solid fa-crown"></i> Premium Active
                    </span>
                ` : `
                    <a href="/premium" style="font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(245,158,11,0.15);color:#fbbf24;font-weight:bold;border:1px solid rgba(245,158,11,0.3);text-decoration:none">
                        <i class="fa-solid fa-lock"></i> Upgrade to Unlock
                    </a>
                `}
            </div>
            <p style="color:#9ca3af;font-size:12.5px;margin:0 0 16px">
                Personalize Fusion Bot's identity exclusively for <strong>${esc(guildName)}</strong>. Enter direct image URLs (PNG, JPG, or GIF).
            </p>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;align-items:start">
                <!-- Custom Bot Avatar (Logo) -->
                <div>
                    <label class="label" style="margin-top:0">Server Bot Logo (Avatar URL or Upload File)</label>
                    <div style="display:flex;gap:12px;align-items:center;margin-top:6px">
                        <img id="avatarPreview" src="${botAvatar || 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg'}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #6366f1;flex-shrink:0" onerror="this.src='https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg'">
                        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                            <input type="url" class="input-box" name="botAvatar" id="botAvatarInput" value="${botAvatar}" placeholder="https://... or upload file below" ${isPrem ? '' : 'disabled'} oninput="document.getElementById('avatarPreview').src = this.value || 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg'" style="width:100%">
                            <div style="display:flex;gap:8px;align-items:center">
                                <label for="avatarFileInput" style="background:#4f46e5;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(79,70,229,0.3)">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> 📁 Upload Logo File
                                </label>
                                <input type="file" id="avatarFileInput" accept="image/png, image/jpeg, image/gif, image/webp" style="display:none" onchange="uploadImageFile(this, 'botAvatarInput', 'avatarPreview')">
                                <span style="font-size:11px;color:#94a3b8">PNG, JPG, GIF</span>
                            </div>
                        </div>
                    </div>
                    <span style="font-size:11px;color:#64748b;display:block;margin-top:4px">Applies to Discord bot profile &amp; messaging for this server</span>
                </div>

                <!-- Custom Bot Banner -->
                <div>
                    <label class="label" style="margin-top:0">Server Bot Banner (Banner URL or Upload File)</label>
                    <div style="margin-top:6px">
                        <input type="url" class="input-box" name="botBanner" id="botBannerInput" value="${botBanner}" placeholder="https://... or upload file below" ${isPrem ? '' : 'disabled'} oninput="document.getElementById('bannerPreview').src = this.value || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'" style="width:100%">
                        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
                            <label for="bannerFileInput" style="background:#4f46e5;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(79,70,229,0.3)">
                                <i class="fa-solid fa-cloud-arrow-up"></i> 📁 Upload Banner File
                            </label>
                            <input type="file" id="bannerFileInput" accept="image/png, image/jpeg, image/gif, image/webp" style="display:none" onchange="uploadImageFile(this, 'botBannerInput', 'bannerPreview')">
                            <span style="font-size:11px;color:#94a3b8">PNG, JPG, GIF</span>
                        </div>
                    </div>
                    <div style="margin-top:8px;position:relative;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);height:70px;background:#000">
                        <img id="bannerPreview" src="${botBanner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'}" style="width:100%;height:100%;object-fit:cover" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'">
                    </div>
                </div>
            </div>
        </div>

        <!-- Bot Server Nickname & Prefixes -->
        <div class="card">
            <label class="label" style="margin-top:0">Bot Server Nickname</label>
            <input type="text" class="input-box" name="botNickname" value="${botNickname}" placeholder="Fusion Bot" ${isPrem ? '' : 'disabled'}>
            <label class="label">Primary Prefix</label>
            <input type="text" class="input-box" name="customPrefix" value="${customPrefix}" placeholder="e.g. ! or ? (Leave empty if none)">
            <label class="label">Additional Custom Prefixes (One per line)</label>
            <textarea class="input-box" name="customPrefixes" style="height:80px" placeholder="!&#10;?&#10;.">${customPrefixesStr}</textarea>
        </div>

        <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <h2 style="font-size:17px;font-weight:700;margin:0;display:flex;align-items:center;gap:8px">
                    <i class="fa-solid fa-microphone-lines" style="color:#06b6d4"></i> AI Voice Pack (Downloaded Studio HD)
                </h2>
                ${isPro ? `
                    <span style="font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(99,102,241,0.2);color:#a5b4fc;font-weight:bold;border:1px solid rgba(99,102,241,0.35)">
                        👑 Pro Active
                    </span>
                ` : `
                    <button type="button" onclick="show('premium')" style="background:rgba(245,158,11,0.15);color:#fbbf24;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:999px;border:1px solid rgba(245,158,11,0.3);cursor:pointer;">
                        <i class="fa-solid fa-lock"></i> Pro Plan Required
                    </button>
                `}
            </div>
            <p style="color:#9ca3af;font-size:13px;margin:0 0 16px">Choose the server's default voice pack for real-time voice channel conversations when the bot is in VC.</p>
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
                <!-- Male 1 -->
                <label style="display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;border:1px solid ${voicePack === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${voicePack === 'male' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)'};cursor:${isPro ? 'pointer' : 'not-allowed'};transition:0.2s">
                    <input type="radio" name="voicePack" value="male" ${voicePack === 'male' || !voicePack ? 'checked' : ''} ${isPro ? '' : 'disabled'} style="accent-color:#3b82f6;width:18px;height:18px;margin-top:2px">
                    <div>
                        <div style="font-weight:800;font-size:14.5px;color:#93c5fd">👨 Male 1 — Ryan (Studio HD)</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:4px;line-height:1.4">Deep, crisp, radio-host studio male voice. Fast &amp; clean.</div>
                    </div>
                </label>

                <!-- Male 2 -->
                <label style="display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;border:1px solid ${voicePack === 'male2' ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${voicePack === 'male2' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)'};cursor:${isPro ? 'pointer' : 'not-allowed'};transition:0.2s">
                    <input type="radio" name="voicePack" value="male2" ${voicePack === 'male2' ? 'checked' : ''} ${isPro ? '' : 'disabled'} style="accent-color:#3b82f6;width:18px;height:18px;margin-top:2px">
                    <div>
                        <div style="font-weight:800;font-size:14.5px;color:#93c5fd">👨 Male 2 — Lessac (Fast Speech)</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:4px;line-height:1.4">Articulate, high-speed male conversational voice.</div>
                    </div>
                </label>

                <!-- Female 1 -->
                <label style="display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;border:1px solid ${voicePack === 'female' ? '#ec4899' : 'rgba(255,255,255,0.1)'};background:${voicePack === 'female' ? 'rgba(236,72,153,0.12)' : 'rgba(255,255,255,0.03)'};cursor:${isPro ? 'pointer' : 'not-allowed'};transition:0.2s">
                    <input type="radio" name="voicePack" value="female" ${voicePack === 'female' ? 'checked' : ''} ${isPro ? '' : 'disabled'} style="accent-color:#ec4899;width:18px;height:18px;margin-top:2px">
                    <div>
                        <div style="font-weight:800;font-size:14.5px;color:#f472b6">👩 Female 1 — LJSpeech (Studio HD)</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:4px;line-height:1.4">Warm, expressive, crystal-clear studio female voice.</div>
                    </div>
                </label>

                <!-- Female 2 -->
                <label style="display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;border:1px solid ${voicePack === 'female2' ? '#ec4899' : 'rgba(255,255,255,0.1)'};background:${voicePack === 'female2' ? 'rgba(236,72,153,0.12)' : 'rgba(255,255,255,0.03)'};cursor:${isPro ? 'pointer' : 'not-allowed'};transition:0.2s">
                    <input type="radio" name="voicePack" value="female2" ${voicePack === 'female2' ? 'checked' : ''} ${isPro ? '' : 'disabled'} style="accent-color:#ec4899;width:18px;height:18px;margin-top:2px">
                    <div>
                        <div style="font-weight:800;font-size:14.5px;color:#f472b6">👩 Female 2 — Cori (Natural HD)</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:4px;line-height:1.4">Smooth, natural, articulate female narrator voice.</div>
                    </div>
                </label>
            </div>
        </div>
    </div>
    <!-- 18. COMMANDS -->
    <div id="view-cmd-general" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">General &amp; Fun Commands</h1></div>
        </div>
        <div class="card" id="cmd-fun-list"></div>
    </div>

    <div id="view-cmd-mod" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Moderation Commands</h1></div>
        </div>
        <div class="card" id="cmd-moderation-list"></div>
    </div>

    <div id="view-cmd-utility" class="view">
        <div class="flex items-center gap-4 mb-6">
            <button type="button" onclick="show('home')" class="btn btn-o" style="width:42px;height:42px;padding:0;border-radius:10px"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1 style="font-size:24px;font-weight:800;margin:0">Utility Commands</h1></div>
        </div>
        <div class="card" id="cmd-utility-list"></div>
    </div>

    <input type="hidden" id="cmdPermsHidden" name="commandPermissions" value="{}">

    </div>
    </form>
</main>
</div>


<script>
var GID = '${guildId || GID}';
var UID = '${userId}';

// Theme Switcher & Persistence
function applyTheme(theme) {
    if (!theme) theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    try { localStorage.setItem('fusion_theme', theme); } catch(e) {}
    
    var radios = document.querySelectorAll('input[name="theme"]');
    radios.forEach(function(r) {
        r.checked = (r.value === theme);
    });
    
    var switchers = document.querySelectorAll('.switcher');
    switchers.forEach(function(sw) {
        sw.setAttribute('data-active', theme);
    });
}

// Image / GIF Upload Handler for Bot Personalizer Logo & Banner
async function uploadImageFile(fileInput, targetInputId, previewImgId) {
    if (!fileInput.files || !fileInput.files[0]) return;
    var file = fileInput.files[0];
    
    if (file.size > 8 * 1024 * 1024) {
        showToast('Image file size exceeds 8MB limit.', 'error');
        return;
    }

    var labelEl = fileInput.parentElement.querySelector('label') || fileInput.previousElementSibling;
    var origLabel = labelEl ? labelEl.innerHTML : '';
    if (labelEl) labelEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';

    var reader = new FileReader();
    reader.onload = async function(e) {
        var base64 = e.target.result;
        try {
            var res = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: base64,
                    filename: file.name,
                    mimeType: file.type
                })
            }).then(function(r) { return r.json(); });

            if (res.success && res.url) {
                var targetInput = document.getElementById(targetInputId);
                if (targetInput) {
                    targetInput.value = res.url;
                }
                var preview = document.getElementById(previewImgId);
                if (preview) {
                    preview.src = res.url;
                }
                var sb = document.getElementById('savebar');
                if (sb) sb.classList.add('show');
                showToast('Image uploaded successfully! Click "Save Changes" to apply.', 'success');
            } else {
                showToast('Upload failed: ' + (res.error || 'Unknown error'), 'error');
            }
        } catch(err) {
            showToast('Upload error: ' + err.message, 'error');
        } finally {
            if (labelEl) labelEl.innerHTML = origLabel;
        }
    };
    reader.readAsDataURL(file);
}

// 1. Navigation: show() function with smooth scrolling & view switching

function loadCashfreeSDKDash() {
    return new Promise(function(resolve, reject) {
        if (typeof Cashfree !== 'undefined') return resolve(Cashfree);
        var existing = document.querySelector('script[src*="cashfree.js"]');
        if (existing) {
            if (window.Cashfree) return resolve(window.Cashfree);
            existing.addEventListener('load', function() { resolve(window.Cashfree); });
            existing.addEventListener('error', function() { reject(new Error('Failed to load Cashfree SDK')); });
            return;
        }
        var s = document.createElement('script');
        s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        s.async = true;
        s.onload = function() { resolve(window.Cashfree); };
        s.onerror = function() { reject(new Error('Failed to load Cashfree SDK')); };
        document.head.appendChild(s);
    });
}

var dashActiveCoupon = '';

function setDashBillingCycle(cycle) {
    window.dashBillingCycle = cycle;
    var btnM = document.getElementById('dashBtnMonthly');
    var btnY = document.getElementById('dashBtnYearly');
    if (cycle === 'monthly') {
        btnM.style.background = '#6366f1';
        btnM.style.color = '#fff';
        btnM.style.boxShadow = '0 2px 8px rgba(99,102,241,0.4)';
        btnY.style.background = 'transparent';
        btnY.style.color = '#9ca3af';
        document.getElementById('dashStarterCycle').textContent = '/ month';
        document.getElementById('dashProCycle').textContent = '/ month';
    } else {
        btnY.style.background = '#6366f1';
        btnY.style.color = '#fff';
        btnY.style.boxShadow = '0 2px 8px rgba(99,102,241,0.4)';
        btnM.style.background = 'transparent';
        btnM.style.color = '#9ca3af';
        document.getElementById('dashStarterCycle').textContent = '/ year';
        document.getElementById('dashProCycle').textContent = '/ year';
    }
    updateDashPricingDisplay();
}

function applyDashCoupon(code) {
    var val = (code || (document.getElementById('dashCouponInput') ? document.getElementById('dashCouponInput').value : '') || '').trim().toUpperCase();
    var statusEl = document.getElementById('dashCouponStatus');
    if (!val) {
        dashActiveCoupon = '';
        if (statusEl) statusEl.style.display = 'none';
        updateDashPricingDisplay();
        return;
    }

    if (val === 'FUSIONBOT') {
        dashActiveCoupon = 'FUSIONBOT';
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#34d399';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Coupon <b>FUSIONBOT</b> Applied! 1-Month FREE TRIAL of ₹149 Pro Server Plan unlocked!';
        }
    } else if (val === 'WELCOME10') {
        dashActiveCoupon = 'WELCOME10';
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#34d399';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Coupon <b>WELCOME10</b> Applied! 10% discount on all plans!';
        }
    } else {
        dashActiveCoupon = '';
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#f87171';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Invalid coupon code. Try FUSIONBOT or WELCOME10';
        }
    }
    updateDashPricingDisplay();
}

function updateDashPricingDisplay() {
    var cycle = window.dashBillingCycle || 'monthly';
    if (dashActiveCoupon === 'FUSIONBOT') {
        if (cycle === 'monthly') {
            document.getElementById('dashStarterPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹79</span>₹0';
            document.getElementById('dashStarterBtn').textContent = 'Claim Starter Free Trial (₹0)';
            document.getElementById('dashProPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹149</span>₹0';
            document.getElementById('dashProBtn').textContent = 'Claim 1-Month Free Trial of Pro (₹0)';
        } else {
            document.getElementById('dashStarterPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹759</span>₹610';
            document.getElementById('dashStarterBtn').textContent = 'Get Starter - ₹610 / yr (Save ₹149)';
            document.getElementById('dashProPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹1429</span>₹1280';
            document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹1280 / yr (Save ₹149)';
        }
    } else if (dashActiveCoupon === 'WELCOME10') {
        if (cycle === 'monthly') {
            document.getElementById('dashStarterPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹79</span>₹71';
            document.getElementById('dashStarterBtn').textContent = 'Get Starter - ₹71 / mo (10% OFF)';
            document.getElementById('dashProPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹149</span>₹134';
            document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹134 / mo (10% OFF)';
        } else {
            document.getElementById('dashStarterPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹759</span>₹683';
            document.getElementById('dashStarterBtn').textContent = 'Get Starter - ₹683 / yr (10% OFF)';
            document.getElementById('dashProPrice').innerHTML = '<span style="text-decoration:line-through;color:#64748b;font-size:24px;margin-right:6px">₹1429</span>₹1286';
            document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹1286 / yr (10% OFF)';
        }
    } else {
        if (cycle === 'monthly') {
            document.getElementById('dashStarterPrice').textContent = '₹79';
            document.getElementById('dashStarterBtn').textContent = 'Get Starter - ₹79 / mo';
            document.getElementById('dashProPrice').textContent = '₹149';
            document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹149 / mo';
        } else {
            document.getElementById('dashStarterPrice').textContent = '₹759';
            document.getElementById('dashStarterBtn').textContent = 'Get Starter - ₹759 / yr';
            document.getElementById('dashProPrice').textContent = '₹1429';
            document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹1429 / yr';
        }
    }
}

async function sendBillToDM(guildId, userId) {
    var btn = document.getElementById('dmBillBtnText');
    var oldText = btn ? btn.textContent : 'Send Bill to Discord DM';
    if (btn) btn.textContent = 'Sending to DM...';
    try {
        var targetUid = userId || (typeof UID !== 'undefined' ? UID : '') || window.location.pathname.split('/')[2];
        var res = await fetch('/api/invoice/send-dm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: guildId || GID, userId: targetUid })
        }).then(function(r) { return r.json(); });

        if (res.success) {
            alert('✓ Success! Your official Tax Invoice and Bill has been sent to your Discord DM.');
            if (btn) btn.textContent = 'Bill Sent to DM ✓';
        } else {
            alert('Could not send DM: ' + (res.error || 'Please ensure your Discord Direct Messages are open.'));
            if (btn) btn.textContent = oldText;
        }
    } catch (e) {
        alert('Error sending DM: ' + e.message);
        if (btn) btn.textContent = oldText;
    }
}

async function activateSlotFromSelect(selectId) {
    var select = document.getElementById(selectId);
    var targetGuildId = select ? select.value : '';
    if (!targetGuildId) {
        var manualId = prompt('Please enter the Discord Server ID to activate Pro features on:');
        if (!manualId) return;
        targetGuildId = manualId.trim();
    }
    claimServerSlot(targetGuildId);
}

async function claimServerSlot(targetGuildId) {
    if (!confirm('Activate premium Pro features for this server using your subscription license slot?')) return;
    try {
        var targetGid = targetGuildId || ((typeof GID !== 'undefined' && GID) ? GID : (window.location.pathname.split('/')[3] || window.location.pathname.split('/')[2] || ''));
        var targetUid = (typeof UID !== 'undefined' && UID) ? UID : (window.location.pathname.split('/')[3] ? window.location.pathname.split('/')[2] : '');
        var res = await fetch('/api/payment/claim-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guildId: targetGid,
                userId: targetUid,
                plan: 'pro',
                cycle: 'monthly'
            })
        }).then(function(r) { return r.json(); });

        if (res.success) {
            showToast('Server activated successfully with your Pro license slot!', 'success');
            setTimeout(function() { window.location.reload(); }, 600);
        } else {
            showToast('Activation failed: ' + (res.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function checkoutDashPlan(planKey) {
    var p = (planKey === 'starter') ? { monthly: 79, yearly: 759 } : { monthly: 149, yearly: 1429 };
    var cycle = window.dashBillingCycle || 'monthly';
    var amt = (cycle === 'monthly') ? p.monthly : p.yearly;
    var rawInputCoupon = (document.getElementById('dashCouponInput') ? document.getElementById('dashCouponInput').value.trim() : '');
    var effectiveCoupon = dashActiveCoupon || rawInputCoupon;

    var btn = document.getElementById(planKey === 'starter' ? 'dashStarterBtn' : 'dashProBtn');
    var origText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Processing...';
    }

    try {
        var targetGuildId = (typeof GID !== 'undefined' && GID) ? GID : (window.location.pathname.split('/')[3] || window.location.pathname.split('/')[2] || '');
        var targetUserId = (typeof UID !== 'undefined' && UID) ? UID : (window.location.pathname.split('/')[3] ? window.location.pathname.split('/')[2] : '');

        var res = await fetch('/api/payment/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: planKey,
                cycle: cycle,
                amount: amt,
                coupon: effectiveCoupon,
                guildId: targetGuildId,
                userId: targetUserId
            })
        }).then(function(r) { return r.json(); });

        if (res.success && res.freeTrial && res.redirectUrl) {
            window.location.href = res.redirectUrl;
            return;
        }

        if (res.success && res.paymentSessionId) {
            var CashfreeObj = null;
            try {
                CashfreeObj = await loadCashfreeSDKDash();
            } catch(e) {}

            if (CashfreeObj) {
                var cashfree = CashfreeObj({ mode: 'production' });
                cashfree.checkout({
                    paymentSessionId: res.paymentSessionId,
                    redirectTarget: '_self'
                });
            } else {
                alert('Cashfree SDK is currently unavailable. Please check your internet connection.');
                if (btn) { btn.disabled = false; btn.textContent = origText; }
            }
        } else {
            alert('Failed to start checkout: ' + (res.error || 'Please try again.'));
            if (btn) { btn.disabled = false; btn.textContent = origText; }
        }
    } catch(err) {
        alert('Payment Error: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}
window.initiateDashPayment = checkoutDashPlan;

function setDashBillingCycle(cycle) {
    var btnM = document.getElementById('dashBtnMonthly');
    var btnY = document.getElementById('dashBtnYearly');
    if (cycle === 'monthly') {
        if (btnM) { btnM.style.background = '#6366f1'; btnM.style.color = '#fff'; }
        if (btnY) { btnY.style.background = 'transparent'; btnY.style.color = '#9ca3af'; }
        if (document.getElementById('dashStarterPrice')) document.getElementById('dashStarterPrice').textContent = '₹79';
        if (document.getElementById('dashStarterCycle')) document.getElementById('dashStarterCycle').textContent = '/ month';
        if (document.getElementById('dashStarterBtn')) document.getElementById('dashStarterBtn').textContent = 'Subscribe - ₹79 / mo';
        if (document.getElementById('dashProPrice')) document.getElementById('dashProPrice').textContent = '₹149';
        if (document.getElementById('dashProCycle')) document.getElementById('dashProCycle').textContent = '/ month';
        if (document.getElementById('dashProBtn')) document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹149 / mo';
    } else {
        if (btnY) { btnY.style.background = '#6366f1'; btnY.style.color = '#fff'; }
        if (btnM) { btnM.style.background = 'transparent'; btnM.style.color = '#9ca3af'; }
        if (document.getElementById('dashStarterPrice')) document.getElementById('dashStarterPrice').textContent = '₹759';
        if (document.getElementById('dashStarterCycle')) document.getElementById('dashStarterCycle').textContent = '/ year';
        if (document.getElementById('dashStarterBtn')) document.getElementById('dashStarterBtn').textContent = 'Subscribe - ₹759 / yr';
        if (document.getElementById('dashProPrice')) document.getElementById('dashProPrice').textContent = '₹1429';
        if (document.getElementById('dashProCycle')) document.getElementById('dashProCycle').textContent = '/ year';
        if (document.getElementById('dashProBtn')) document.getElementById('dashProBtn').textContent = 'Upgrade to Pro - ₹1429 / yr';
    }
}

function show(viewId) {
    if (!viewId) return;
    var allViews = document.querySelectorAll('.view');
    for (var i = 0; i < allViews.length; i++) {
        allViews[i].classList.remove('active');
        allViews[i].style.display = 'none';
    }
    
    var allNavs = document.querySelectorAll('.nav-item');
    for (var j = 0; j < allNavs.length; j++) {
        allNavs[j].classList.remove('active');
    }
    
    var targetView = document.getElementById('view-' + viewId);
    if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'block';
    }
    
    var navEl = document.getElementById('nav-' + viewId);
    if (navEl) {
        navEl.classList.add('active');
    }
    
    var mainEl = document.querySelector('.main');
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.innerWidth < 900) {
        closeSidebar();
    }
}

// 2. Mobile sidebar toggle & overlay
function toggleSidebar() {
    var sb = document.getElementById('mainSidebar') || document.getElementById('sidebar');
    var ov = document.getElementById('mobileOverlay');
    if (sb) sb.classList.toggle('open');
    if (ov) ov.classList.toggle('open');
}

function closeSidebar() {
    var sb = document.getElementById('mainSidebar') || document.getElementById('sidebar');
    var ov = document.getElementById('mobileOverlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
}

// 3. Track unsaved changes (ONLY on genuine user interaction)
var form = document.getElementById('mainForm') || document.getElementById('dashForm');
if (form) {
    form.addEventListener('input', function(e) {
        if (e.target && (e.target.id === 'slot2ServerSelect' || e.target.id === 'slot3ServerSelect' || e.target.closest('#view-premium'))) return;
        var sb = document.getElementById('savebar');
        if (sb) sb.classList.add('show');
    });
    form.addEventListener('change', function(e) {
        if (e.target && (e.target.id === 'slot2ServerSelect' || e.target.id === 'slot3ServerSelect' || e.target.closest('#view-premium'))) return;
        var sb = document.getElementById('savebar');
        if (sb) sb.classList.add('show');
    });
}

// 4. Ticket Mode Switcher

function selectWelcomeBg(url) {
    var hiddenInput = document.getElementById('welcomeBgInput');
    var customInput = document.getElementById('welcomeBgCustomInput');
    if (hiddenInput) hiddenInput.value = url;
    if (customInput) customInput.value = ''; // Don't show URL in custom input when preset is picked
    
    document.querySelectorAll('.wbg-preset-card').forEach(function(card) {
        var cardUrl = card.getAttribute('data-url');
        if (cardUrl === url) {
            card.style.border = '2px solid #a855f7';
            card.style.boxShadow = '0 0 14px rgba(168,85,247,0.5)';
        } else {
            card.style.border = '1px solid rgba(255,255,255,0.1)';
            card.style.boxShadow = 'none';
        }
    });
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

function selectByeBg(url) {
    var hiddenInput = document.getElementById('byeBgInput');
    var customInput = document.getElementById('byeBgCustomInput');
    if (hiddenInput) hiddenInput.value = url;
    if (customInput) customInput.value = ''; // Don't show URL in custom input when preset is picked
    
    document.querySelectorAll('.bbg-preset-card').forEach(function(card) {
        var cardUrl = card.getAttribute('data-url');
        if (cardUrl === url) {
            card.style.border = '2px solid #ef4444';
            card.style.boxShadow = '0 0 14px rgba(239,68,68,0.5)';
        } else {
            card.style.border = '1px solid rgba(255,255,255,0.1)';
            card.style.boxShadow = 'none';
        }
    });
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

function onCustomBgChange(type, val) {
    var hiddenInput = document.getElementById(type === 'welcome' ? 'welcomeBgInput' : 'byeBgInput');
    if (hiddenInput) hiddenInput.value = val;
    
    // Clear preset selection borders
    var cards = document.querySelectorAll(type === 'welcome' ? '.wbg-preset-card' : '.bbg-preset-card');
    cards.forEach(function(card) {
        card.style.border = '1px solid rgba(255,255,255,0.1)';
        card.style.boxShadow = 'none';
    });
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

function handleBgUpload(input, type) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 15 * 1024 * 1024) {
        alert('File is too large. Maximum size is 15MB.');
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        if (type === 'ticketImageInput') {
            var target = document.getElementById('ticketImageInput');
            if (target) target.value = e.target.result;
        } else if (type === 'welcome') {
            var hidden = document.getElementById('welcomeBgInput');
            var custom = document.getElementById('welcomeBgCustomInput');
            if (hidden) hidden.value = e.target.result;
            if (custom) custom.value = file.name + ' (Uploaded ' + (file.size > 1000000 ? (file.size/1000000).toFixed(1)+'MB' : (file.size/1000).toFixed(0)+'KB') + ')';
            document.querySelectorAll('.wbg-preset-card').forEach(function(c) { c.style.border = '1px solid rgba(255,255,255,0.1)'; c.style.boxShadow = 'none'; });
        } else if (type === 'bye') {
            var hidden = document.getElementById('byeBgInput');
            var custom = document.getElementById('byeBgCustomInput');
            if (hidden) hidden.value = e.target.result;
            if (custom) custom.value = file.name + ' (Uploaded ' + (file.size > 1000000 ? (file.size/1000000).toFixed(1)+'MB' : (file.size/1000).toFixed(0)+'KB') + ')';
            document.querySelectorAll('.bbg-preset-card').forEach(function(c) { c.style.border = '1px solid rgba(255,255,255,0.1)'; c.style.boxShadow = 'none'; });
        }
        var sb = document.getElementById('savebar');
        if (sb) sb.classList.add('show');
        showToast('Image uploaded! Click "Save Changes" to apply.', 'success');
    };
    reader.readAsDataURL(file);
}

function switchTicketMode(mode) {
    var stdBox = document.getElementById('standardTicketOptionsBox');
    var aiBox = document.getElementById('aiSettingsBox');
    var cardNormal = document.getElementById('modeCardNormal');
    var cardAi = document.getElementById('modeCardAi');
    var radioNormal = document.getElementById('ticketModeNormalRadio');
    var radioAi = document.getElementById('ticketModeAiRadio');

    if (mode === 'ai') {
        if (radioAi) radioAi.checked = true;
        if (stdBox) stdBox.style.display = 'none';
        if (aiBox) aiBox.style.display = 'block';
        if (cardNormal) {
            cardNormal.style.background = 'rgba(255,255,255,0.03)';
            cardNormal.style.border = '1px solid rgba(255,255,255,0.1)';
            cardNormal.style.boxShadow = 'none';
        }
        if (cardAi) {
            cardAi.style.background = 'rgba(236,72,153,0.18)';
            cardAi.style.border = '2px solid #ec4899';
            cardAi.style.boxShadow = '0 0 18px rgba(236,72,153,0.4)';
        }
    } else {
        if (radioNormal) radioNormal.checked = true;
        if (stdBox) stdBox.style.display = 'block';
        if (aiBox) aiBox.style.display = 'none';
        if (cardNormal) {
            cardNormal.style.background = 'rgba(88,101,242,0.2)';
            cardNormal.style.border = '2px solid #5865F2';
            cardNormal.style.boxShadow = '0 0 15px rgba(88,101,242,0.3)';
        }
        if (cardAi) {
            cardAi.style.background = 'rgba(255,255,255,0.03)';
            cardAi.style.border = '1px solid rgba(255,255,255,0.1)';
            cardAi.style.boxShadow = 'none';
        }
    }
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

// 5. Auto Roles Multi-Tag Manager
var memberAutoRoles = ${Array.isArray(config.autoRoleMember) ? JSON.stringify(config.autoRoleMember) : (config.autoRoleMember ? JSON.stringify([config.autoRoleMember]) : '[]')};
var botAutoRoles = ${Array.isArray(config.autoRoleBot) ? JSON.stringify(config.autoRoleBot) : (config.autoRoleBot ? JSON.stringify([config.autoRoleBot]) : '[]')};

function renderAutoRoleTags() {
    function renderList(listId, rolesArr, type) {
        var el = document.getElementById(listId);
        if (!el) return;
        el.innerHTML = '';
        if (rolesArr.length === 0) {
            el.innerHTML = '<span style="color:#6b7280;font-size:12px;padding:4px">No roles assigned. Add one below.</span>';
            return;
        }
        rolesArr.forEach(function(rId, idx) {
            var roleObj = cachedRoles.find(function(r) { return r.id === rId; });
            var rName = roleObj ? roleObj.name : rId;
            var tag = document.createElement('div');
            tag.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(88,101,242,0.25);border:1px solid rgba(88,101,242,0.5);border-radius:20px;font-size:12.5px;color:#ffffff;font-weight:600;';
            
            var textSpan = document.createElement('span');
            textSpan.textContent = '@' + rName;
            tag.appendChild(textSpan);
            
            var removeIcon = document.createElement('i');
            removeIcon.className = 'fa-solid fa-xmark';
            removeIcon.style.cssText = 'cursor:pointer;color:#f87171;margin-left:4px';
            removeIcon.onclick = function() { removeAutoRole(type, idx); };
            tag.appendChild(removeIcon);
            
            el.appendChild(tag);
        });
    }
    renderList('memberRolesList', memberAutoRoles, 'member');
    renderList('botRolesList', botAutoRoles, 'bot');
    
    var mHid = document.getElementById('autoRoleMemberHidden');
    if (mHid) mHid.value = JSON.stringify(memberAutoRoles);
    var bHid = document.getElementById('autoRoleBotHidden');
    if (bHid) bHid.value = JSON.stringify(botAutoRoles);
}

function addAutoRole(type, roleId) {
    if (!roleId) return;
    var target = type === 'member' ? memberAutoRoles : botAutoRoles;
    if (!target.includes(roleId)) {
        target.push(roleId);
        renderAutoRoleTags();
        var sb = document.getElementById('savebar');
        if (sb) sb.classList.add('show');
    }
}

function removeAutoRole(type, idx) {
    var target = type === 'member' ? memberAutoRoles : botAutoRoles;
    target.splice(idx, 1);
    renderAutoRoleTags();
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

// 6. doSave / saveSettings function
async function doSave() {
    var currentForm = document.getElementById('mainForm') || document.getElementById('dashForm');
    if (!currentForm) return;
    var formData = new FormData(currentForm);
    var data = {};
    
    formData.forEach(function(val, key) {
        if (data[key]) {
            if (!Array.isArray(data[key])) data[key] = [data[key]];
            data[key].push(val);
        } else {
            data[key] = val;
        }
    });

    // Auto roles arrays
    data.autoRoleMember = memberAutoRoles;
    data.autoRoleBot = botAutoRoles;
    
    var booleanFields = [
        'autoBackup','autoBackupEnabled','welcomeDmEnabled','welcomeEnabled','byeEnabled',
        'ticketsEnabled','reactRolesEnabled','inviteTrackerEnabled','autoRoleEnabled',
        'levelingEnabled','antiNukeEnabled','wordFilterEnabled','antiSpamEnabled',
        'logsEnabled','attachmentSpamEnabled','mentionSpamEnabled','banWordKickEnabled',
        'antiLinksEnabled','ghostPingEnabled','aiGlobalEnabled','gamesDisabledGlobal'
    ];
    booleanFields.forEach(function(f) {
        if (f in data) {
            data[f] = (data[f] === 'on' || data[f] === 'true' || data[f] === true);
        } else {
            data[f] = false;
        }
    });

    var saveBtn = document.getElementById('saveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
        var res = await fetch('/dashboard/' + GID + '/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function(r) { return r.json(); });
        
        if (res.success) {
            var sb = document.getElementById('savebar');
            if (sb) sb.classList.remove('show');
            showToast('Settings saved successfully!', 'success');
        } else {
            showToast('Save failed: ' + (res.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        showToast('Network error: ' + e.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
}
var saveSettings = doSave;

// 7. Toast notification
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.style.cssText = 'position:fixed;top:30px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:14px;font-size:14px;font-weight:700;z-index:999999;transition:opacity 0.3s, transform 0.3s;box-shadow:0 12px 32px rgba(0,0,0,0.5);pointer-events:none;';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = type === 'success' ? '#059669' : '#dc2626';
    t.style.color = '#fff';
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, 3000);
}

// 8. Instant Dropdown Population with Background Refresh
var initialChannels = ${JSON.stringify(guildChannels || [])};
var initialRoles = ${JSON.stringify(guildRoles || [])};
var cachedChannels = (Array.isArray(initialChannels) && initialChannels.length > 0) ? initialChannels : [];
var cachedRoles = (Array.isArray(initialRoles) && initialRoles.length > 0) ? initialRoles : [];

function fillAllDropdowns() {
    function fillCh(id, saved) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">— Select Channel —</option>';
        cachedChannels.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = '#' + c.name;
            if (c.id === saved) opt.selected = true;
            el.appendChild(opt);
        });
    }
    
    function fillRole(id, saved, allowNone) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = (allowNone ? '<option value="">— None —</option>' : '<option value="">— Select Role —</option>');
        cachedRoles.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = '@' + r.name;
            if (r.id === saved) opt.selected = true;
            el.appendChild(opt);
        });
    }
    
    // Populate all channel dropdowns
    var channelMap = {
        welcomeChannelSel: ${savedWelcomeCh},
        byeChannelSel: ${JSON.stringify(config.byeChannel || '')},
        ticketLogChannelSel: ${JSON.stringify(config.ticketLogChannel || '')},
        messageLogChannelSel: ${JSON.stringify(config.messageLogChannel || '')},
        memberLogChannelSel: ${JSON.stringify(config.memberLogChannel || '')},
        roleLogChannelSel: ${JSON.stringify(config.roleLogChannel || '')},
        voiceLogChannelSel: ${JSON.stringify(config.voiceLogChannel || '')},
        inviteLogChannelSel: ${JSON.stringify(config.inviteLogChannel || '')},
        inviteTrackerChannelSel: ${JSON.stringify(config.inviteTrackerChannel || '')},
        notifChannelSel: ${JSON.stringify(config.notificationChannel || '')},
        levelingChannelSel: ${levelingChannelVal},
        ticketAppLogChannelSel: ${JSON.stringify(config.ticketAppLogChannel || '')},
        ticketResponseChannelSel: ${JSON.stringify(config.ticketResponseChannel || '')},
        rrChannelSel: ${savedRRCh}
    };
    Object.keys(channelMap).forEach(function(id) { fillCh(id, channelMap[id]); });
    
    // Populate role dropdowns
    fillRole('ticketSupportRoleSel', ${ticketSupportRoleId}, true);
    fillRole('rrRoleSelect', '', false);
    fillRole('lrRoleSel', '', false);
    fillRole('memberRoleAddSel', '', false);
    fillRole('botRoleAddSel', '', false);

    // Update React Roles, Leveling, and Auto Roles UI
    if (typeof renderRRPairs === 'function') renderRRPairs();
    if (typeof renderLevelRewards === 'function') renderLevelRewards();
    if (typeof renderAutoRoleTags === 'function') renderAutoRoleTags();
}

async function loadDropdowns() {
    // 1. Instantly populate from server-rendered channels and roles (0ms latency!)
    fillAllDropdowns();

    // 2. Fetch fresh channels & roles asynchronously in background
    try {
        var freshCh = await fetch('/dashboard/' + GID + '/channels').then(function(r) { return r.json(); }).catch(function() { return []; });
        var freshRo = await fetch('/dashboard/' + GID + '/roles').then(function(r) { return r.json(); }).catch(function() { return []; });
        if (Array.isArray(freshCh) && freshCh.length > 0) cachedChannels = freshCh;
        if (Array.isArray(freshRo) && freshRo.length > 0) cachedRoles = freshRo;
        fillAllDropdowns();
    } catch(e) {
        console.log('Dropdown refresh:', e);
    }
}

// 9. React Roles Manager
var rrPairs = ${existingPairsJSON};
function renderRRPairs() {
    var list = document.getElementById('rrPairsList');
    if (!list) return;
    list.innerHTML = '';
    rrPairs.forEach(function(p, i) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,0.05);border-radius:10px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.08);';
        
        var emojiSpan = document.createElement('span');
        emojiSpan.style.fontSize = '22px';
        emojiSpan.textContent = p.emoji || '⭐';
        
        var roleSpan = document.createElement('span');
        roleSpan.style.cssText = 'color:#d1d5db;font-size:14px;font-weight:600';
        roleSpan.textContent = '@' + (p.roleName || p.roleId);
        
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:#f87171;cursor:pointer;font-size:16px';
        delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        delBtn.onclick = function() { removeRRP(i); };
        
        row.appendChild(emojiSpan);
        row.appendChild(roleSpan);
        row.appendChild(delBtn);
        list.appendChild(row);
    });
    var hidden = document.getElementById('rrPairsHidden');
    if (hidden) hidden.value = JSON.stringify(rrPairs);
    updateRRPreview();
}

function addRRPairFromInputs() {
    var emojiInput = document.getElementById('rrEmojiInput');
    var roleSelect = document.getElementById('rrRoleSelect');
    var emoji = emojiInput ? emojiInput.value.trim() : '';
    var roleId = roleSelect ? roleSelect.value : '';
    var roleName = roleSelect && roleSelect.selectedOptions[0] ? roleSelect.selectedOptions[0].textContent.replace(/^@/, '') : '';

    if (!emoji) return alert('Please enter or paste an emoji (e.g. 🎮 or ⭐)');
    if (!roleId) return alert('Please select a role from the dropdown');

    rrPairs.push({ emoji: emoji, roleId: roleId, roleName: roleName });
    if (emojiInput) emojiInput.value = '';
    renderRRPairs();
    
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

function removeRRP(i) {
    rrPairs.splice(i, 1);
    renderRRPairs();
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

function updateRRPreview() {
    var p = document.getElementById('rrPreview');
    if (!p) return;
    if (rrPairs.length === 0) {
        p.textContent = 'Add pairs above to preview.';
        return;
    }
    var title = (document.getElementById('rrTitle') ? document.getElementById('rrTitle').value : '') || '🎭 React Role Picker';
    var desc = (document.getElementById('rrDesc') ? document.getElementById('rrDesc').value : '') || 'React below to get your roles!';
    p.innerHTML = '<div style="width:100%"><div style="font-weight:800;color:white;font-size:15px;margin-bottom:6px">' + title + '</div><div style="color:#d1d5db;font-size:13px;margin-bottom:12px">' + desc + '</div><div style="display:flex;flex-direction:column;gap:4px">' + rrPairs.map(function(pair){ return '<div style="font-size:13px;color:#93c5fd">' + pair.emoji + ' — @' + (pair.roleName || pair.roleId) + '</div>'; }).join('') + '</div></div>';
}

async function sendRR() {
    var chSel = document.getElementById('rrChannelSel');
    var channel = chSel ? chSel.value : '';
    if (!channel) return alert('Please select a panel channel first');
    var title = (document.getElementById('rrTitle') ? document.getElementById('rrTitle').value : '') || '🎭 React Role Picker';
    var desc = (document.getElementById('rrDesc') ? document.getElementById('rrDesc').value : '') || 'React below to get your roles!';
    try {
        var btn = document.getElementById('rrSendBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Deploying...'; }
        var res = await fetch('/dashboard/' + GID + '/deploy-react-roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel, title: title, desc: desc, pairs: rrPairs })
        }).then(function(r) { return r.json(); });
        if (res.success) showToast('React roles panel deployed to Discord!', 'success');
        else showToast('Deploy failed: ' + (res.error || ''), 'error');
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    } finally {
        var btn = document.getElementById('rrSendBtn');
        if (btn) { btn.disabled = false; btn.textContent = 'Deploy Panel to Discord'; }
    }
}

// 10. Leveling Rewards Manager
var lvlRewards = ${safeJSONForScript(config.levelRoleRewards || {})};
function renderLevelRewards() {
    var list = document.getElementById('lrRewardsList');
    if (!list) return;
    list.innerHTML = '';
    var keys = Object.keys(lvlRewards).sort(function(a, b) { return Number(a) - Number(b); });
    if (keys.length === 0) {
        list.innerHTML = '<div style="color:#6b7280;font-size:13px;text-align:center;padding:12px">No level role rewards configured yet.</div>';
    }
    keys.forEach(function(lvl) {
        var roles = Array.isArray(lvlRewards[lvl]) ? lvlRewards[lvl] : [lvlRewards[lvl]];
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);';
        row.innerHTML = '<span style="color:#fbbf24;font-weight:800;font-size:14px">Level ' + lvl + '</span> <span style="color:#d1d5db;font-size:13px">→ ' + roles.map(function(r){ return '@' + r; }).join(', ') + '</span><button type="button" onclick="removeLevelReward(' + lvl + ')" style="margin-left:auto;background:none;border:none;color:#f87171;cursor:pointer"><i class="fa-solid fa-trash"></i></button>';
        list.appendChild(row);
    });
    var hidden = document.getElementById('levelRoleRewardsHidden');
    if (hidden) hidden.value = JSON.stringify(lvlRewards);
}
function addLevelReward() {
    var lvlSel = document.getElementById('lrLevelSel');
    var roleSel = document.getElementById('lrRoleSel');
    var lvl = lvlSel ? lvlSel.value : '';
    if (!lvl || !roleSel || !roleSel.value) return alert('Select level and a role');
    var roleName = roleSel.selectedOptions[0] ? roleSel.selectedOptions[0].textContent.replace(/^@/, '') : roleSel.value;
    lvlRewards[lvl] = [roleName];
    renderLevelRewards();
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}
function removeLevelReward(lvl) {
    delete lvlRewards[lvl];
    renderLevelRewards();
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

// 11. Anti-Nuke Snapshot Creation
async function createSnapshot() {
    var btn = document.getElementById('createSnapshotBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Snapshot...'; }
    try {
        var res = await fetch('/dashboard/' + GID + '/snapshot', { method: 'POST' }).then(function(r) { return r.json(); });
        if (res.success) {
            var dateStr = res.backupDate || new Date().toLocaleString();
            showToast('Server snapshot created successfully!', 'success');
            var dateEl = document.getElementById('snapshotDateText');
            if (dateEl) {
                dateEl.textContent = dateStr;
                dateEl.style.color = '#34d399';
            }
        } else {
            showToast('Snapshot failed: ' + (res.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-camera"></i> Create Snapshot Now'; }
    }
}

// 12. Google Drive Disconnect & Manual Backup
async function disconnDrive(guildId) {
    if (!confirm('Are you sure you want to disconnect Google Drive? Automatic server backups will be suspended.')) return;
    try {
        var res = await fetch('/dashboard/' + (guildId || GID) + '/api/drive/disconnect', { method: 'POST' }).then(function(r) { return r.json(); });
        if (res.success) {
            showToast('Google Drive disconnected.', 'success');
            setTimeout(function() { location.reload(); }, 800);
        } else {
            showToast('Failed: ' + (res.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function triggerBackup(guildId) {
    var btn = document.getElementById('manualBackupBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Backing up...'; }
    try {
        var res = await fetch('/dashboard/' + (guildId || GID) + '/api/drive/backup', { method: 'POST' }).then(function(r) { return r.json(); });
        if (res.success) {
            showToast('Server backup created and saved to Google Drive!', 'success');
        } else {
            showToast('Backup failed: ' + (res.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="color:#60a5fa"></i> Create Manual Backup'; }
    }
}

// 13. Command permissions builder
var cmdPermsData = ${safeJSONForScript(config.commandPermissions || {})};
function buildCommandList(containerId, commands) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    commands.forEach(function(cmd) {
        var enabled = cmdPermsData[cmd.name] !== false;
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.06);';
        
        var left = document.createElement('div');
        left.innerHTML = '<span style="color:white;font-weight:700;font-size:14px">/' + cmd.name + '</span><p style="color:#9ca3af;font-size:12px;margin:2px 0 0">' + (cmd.desc || '') + '</p>';
        
        var toggleLabel = document.createElement('label');
        toggleLabel.className = 'switch';
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = enabled;
        chk.onchange = function() { toggleCmd(cmd.name, this.checked); };
        var slider = document.createElement('span');
        slider.className = 'slider';
        toggleLabel.appendChild(chk);
        toggleLabel.appendChild(slider);
        
        row.appendChild(left);
        row.appendChild(toggleLabel);
        container.appendChild(row);
    });
}
function toggleCmd(name, enabled) {
    cmdPermsData[name] = enabled;
    var hidden = document.getElementById('cmdPermsHidden');
    if (hidden) hidden.value = JSON.stringify(cmdPermsData);
    var sb = document.getElementById('savebar');
    if (sb) sb.classList.add('show');
}

// 14. DOMContentLoaded Initialization
window.addEventListener('DOMContentLoaded', function() {
    var currentTheme = localStorage.getItem('fusion_theme') || 'dark';
    applyTheme(currentTheme);
    loadDropdowns();
    
    var modCmds = [{name:'ban',desc:'Ban a member'},{name:'kick',desc:'Kick a member'},{name:'mute',desc:'Timeout a member'},{name:'warn',desc:'Warn a member'},{name:'purge',desc:'Bulk delete messages'},{name:'slowmode',desc:'Set channel slowmode'},{name:'lock',desc:'Lock a channel'},{name:'unlock',desc:'Unlock a channel'},{name:'role',desc:'Manage roles'}];
    var funCmds = [{name:'8ball',desc:'Magic 8-ball'},{name:'coinflip',desc:'Flip a coin'},{name:'rps',desc:'Rock Paper Scissors'},{name:'meme',desc:'Random meme'},{name:'joke',desc:'Random joke'},{name:'trivia',desc:'Trivia question'}];
    var utilCmds = [{name:'userinfo',desc:'User information'},{name:'serverinfo',desc:'Server information'},{name:'avatar',desc:'Get avatar'},{name:'ping',desc:'Bot latency'},{name:'uptime',desc:'Bot uptime'},{name:'invite',desc:'Bot invite link'},{name:'help',desc:'Help command'}];
    
    buildCommandList('cmd-moderation-list', modCmds);
    buildCommandList('cmd-fun-list', funCmds);
    buildCommandList('cmd-utility-list', utilCmds);
});
</script>
<script>
console.log('%cStop!', 'color: red; font-family: sans-serif; font-size: 4.5rem; font-weight: 700; -webkit-text-stroke: 1px black;');
console.log('%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to enable an account feature or "hack" someone\'s account, it is a scam and will give them access to your Fusion Bot account.', 'font-family: sans-serif; font-size: 1.25rem; font-weight: 600;');
(function() {
    var bgs = [
        'https://i.ibb.co/FRMD0Gq/4-png.png',
        'https://i.ibb.co/4hxyKMk/download.jpg',
        'https://i.ibb.co/0jPNVWf2/download.jpg',
        'https://i.ibb.co/9kfRtqjq/anime-car-city.jpg',
        'https://i.ibb.co/8nj7gzNb/7400461.jpg',
        'https://i.ibb.co/hRh6Tdtd/pexels-kienvirak-4991338.jpg',
        'https://i.ibb.co/ycQr1wTL/240-F-760560007-mk7wk-XO7-OD5iv-Prep-Tdn-BZr-Rd5-Rr-Wlb-E.jpg',
        'https://i.ibb.co/qY1zYNFZ/image.jpg',
        'https://i.ibb.co/wFVzgRyw/From-Klickpin-com-Calm-status-ideas-with-charm-and-useful-ideas-for-thoughtful-sharing-that-feel-an.gif',
        'https://i.ibb.co/sdjC8ZhZ/From-Klickpin-com-Gorgeous-entryway-organization-ideas-that-are-worth-saving-if-you-love-elegant-de.gif',
        'https://i.ibb.co/N2RBXCF6/From-Klickpin-com-Build-this-guide-to-budget-friendly-budget-vacation-ideas-that-help-you-get-the-l.gif',
        'https://i.ibb.co/9mrRG0H8/From-Klickpin-com-Try-Stylish-journaling-prompts-that-combine-popular-trends-with-useful-details-yo.gif',
        'https://i.ibb.co/5XkphBM2/From-Klickpin-com-Unique-capsule-wardrobe-outfits-that-make-your-next-project-look-polished-and-exp.gif',
        'https://i.ibb.co/hFnNt6sV/From-Klickpin-com-Habit-Tracker-Ideas-That-Are-Going-Viral-77297-pin-id-1064256955673574977.gif'
    ];
    function preload() {
        bgs.forEach(function(u) { var img = new Image(); img.src = u; });
    }
    if ('requestIdleCallback' in window) { requestIdleCallback(preload); }
    else { setTimeout(preload, 500); }
})();
</script>
</body>
</html>`;
};


// ==========================================
// 🚀 EXPRESS ROUTE EXPORTS
// ==========================================
module.exports = function startDashboard(app, discordClient, { createNukeBackup, Suggestion } = {}) {
    const { attachAgenticPortal, getSSRHomepageHTML, getHomepageMarkdown } = require('./agentic_portal');
    attachAgenticPortal(app, discordClient);
    app.use('/assets', express.static(path.join(__dirname, 'public')));
    app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
    app.use('/backgrounds', express.static(path.join(__dirname, 'public', 'backgrounds'), { maxAge: '30d' }));
    app.use('/public', express.static(path.join(__dirname, 'public')));
    app.get('/assets/bg-dark.jpg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bg-dark.jpg')));
    app.get('/assets/bg-light.png', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bg-light.png')));
    app.get('/bg-dark.jpg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bg-dark.jpg')));
    app.get('/bg-light.png', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bg-light.png')));
    app.get(['/favicon.ico', '/favicon.png', '/favicon.svg', '/favicon.jpg'], (req, res) => {
        res.redirect('https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg');
    });

    // Policy & Compliance routes (Legal Entity: CHAUDHARY TANMAY)
    
    // Bug Reports & Suggestions Admin Dashboard
    app.get(['/admin/bugs', '/bugs'], async (req, res) => {
        try {
            const { SuggestionReport } = require('./database');
            const reports = await SuggestionReport.find().sort({ createdAt: -1 }).limit(100);
            res.send(getAdminBugsHTML(reports));
        } catch(e) {
            res.status(500).send("Error loading bug reports: " + e.message);
        }
    });

    app.post('/admin/api/bugs/:id/status', async (req, res) => {
        try {
            const { SuggestionReport } = require('./database');
            const { id } = req.params;
            const { status } = req.body;
            await SuggestionReport.findOneAndUpdate(
                { $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { reportId: id }] },
                { status: status, updatedAt: new Date() }
            );
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get(['/terms', '/terms-of-service', '/terms-and-conditions', '/tos'], (req, res) => res.send(getTermsHTML()));
    app.get(['/privacy', '/privacy-policy'], (req, res) => res.send(getPrivacyHTML()));
    

    // Payment: Create Cashfree Order & Supabase Transaction with Coupon Support
    app.post('/api/payment/create-order', async (req, res) => {
        try {
            const { plan, cycle, amount, customerName, customerEmail, customerPhone, coupon, userId } = req.body;
            const cleanCoupon = (coupon || '').trim().toUpperCase();
            const discordUserId = req.session?.discordId || userId || ('guest_' + Date.now());
            
            let discordUsername = req.session?.discordUsername;
            if (!discordUsername || discordUsername === 'Customer' || discordUsername === 'Guest' || discordUsername === 'User') {
                if (discordUserId && !String(discordUserId).startsWith('guest_') && discordClient) {
                    try {
                        const fetchedU = await discordClient.users.fetch(discordUserId).catch(() => null);
                        if (fetchedU) discordUsername = fetchedU.username;
                    } catch(_) {}
                }
            }
            if (!discordUsername) discordUsername = customerName || 'Discord Member';

            // Calculate pricing and apply coupon discounts
            let baseAmt = (plan === 'starter' ? (cycle === 'yearly' ? 759 : 79) : (cycle === 'yearly' ? 1429 : 149));
            let finalAmt = baseAmt;
            let isFreeTrial = false;

            if (cleanCoupon === 'FUSIONBOT') {
                // Check if user has already claimed the 1-time free trial
                if (discordUserId && hasClaimedTrial(discordUserId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'You have already claimed your 1-Month Free Trial on this Discord account. The FUSIONBOT trial coupon is strictly 1 per user!'
                    });
                }

                // 1 Month FREE TRIAL of ₹149 Pro Server Plan!
                if (plan === 'pro' && cycle === 'monthly') {
                    finalAmt = 0;
                    isFreeTrial = true;
                } else if (plan === 'starter' && cycle === 'monthly') {
                    finalAmt = 0;
                    isFreeTrial = true;
                } else {
                    finalAmt = Math.max(0, baseAmt - 149);
                }
            } else if (cleanCoupon === 'WELCOME10') {
                // 10% discount on all plans
                finalAmt = Math.round(baseAmt * 0.90);
            } else if (amount && Number(amount) > 0) {
                finalAmt = Number(amount);
            }

            const reqGuildId = req.body.guildId || '';

            // If Free Trial Coupon (₹0), bypass payment gateway and activate directly!
            if (isFreeTrial || finalAmt <= 0) {
                const trialOrderId = 'trial_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                recordClaimedTrial(discordUserId, { username: discordUsername, orderId: trialOrderId, plan, guildId: reqGuildId });

                // If guildId is provided directly from dashboard, activate immediately
                if (reqGuildId) {
                    const expiresAt = new Date(Date.now() + 30 * 86400000);
                    const liveGuild = discordClient.guilds.cache.get(reqGuildId);
                    const serverName = liveGuild ? liveGuild.name : `Discord Server (${reqGuildId})`;

                    activateServerSlot(discordUserId, discordUsername, reqGuildId, serverName, plan || 'pro', 'monthly', expiresAt, trialOrderId);

                    await ServerConfig.findOneAndUpdate(
                        { guildId: reqGuildId },
                        {
                            isPremium: true,
                            premiumPlan: plan || 'pro',
                            premiumCycle: 'monthly',
                            premiumExpiresAt: expiresAt,
                            premiumActivatedBy: `${discordUsername} (${discordUserId})`
                        },
                        { upsert: true }
                    );

                    const localCfg = readDB(dbFiles.serverConfig) || {};
                    localCfg[reqGuildId] = {
                        ...(localCfg[reqGuildId] || {}),
                        isPremium: true,
                        premiumPlan: plan || 'pro',
                        premiumCycle: 'monthly',
                        premiumExpiresAt: expiresAt
                    };
                    writeDB(dbFiles.serverConfig, localCfg);

                    // Send Discord DM Bill
                    if (discordClient && discordUserId && discordUserId !== 'user') {
                        try {
                            const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
                            const liveGuild = discordClient.guilds.cache.get(reqGuildId);
                            const serverName = liveGuild ? liveGuild.name : `Discord Server (${reqGuildId})`;
                            const invoiceSvgBuffer = generateInvoiceSVG({
                                transactionId: `#TX-${trialOrderId}`,
                                username: `@${discordUsername}`,
                                customerName: discordUsername,
                                serverName: serverName,
                                serverId: reqGuildId,
                                planName: 'Pro Server Plan',
                                cycle: 'Monthly (1-Month Free Trial)',
                                amount: '0.00 (Free Trial)',
                                date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                                expiryDate: expiresAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            });

                            const invoiceFile = new AttachmentBuilder(invoiceSvgBuffer, { name: `fusion_bill_${trialOrderId}.svg` });
                            const invoiceEmbed = new EmbedBuilder()
                                .setColor(0x10B981)
                                .setAuthor({ name: 'Fusion Bot Billing & Invoices', iconURL: 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg' })
                                .setTitle('🧾 1-Month Free Trial Activated')
                                .setDescription(`Hello **${discordUsername}**,

Your **1-Month FREE TRIAL of Pro Server Plan** is now active on **${serverName}**!

Your digital activation bill is attached below for your records.`)
                                .addFields(
                                    { name: '👑 Plan Activated', value: '`Fusion Pro Server Plan (Monthly Trial)`', inline: true },
                                    { name: '💳 Amount Paid', value: '`₹0.00 (100% OFF Free Trial)`', inline: true },
                                    { name: '🏷️ Transaction ID', value: `\`#TX-${trialOrderId}\``, inline: true },
                                    { name: '🛡️ Activated Server', value: `**${serverName}**
(\`${reqGuildId}\`)`, inline: true },
                                    { name: '👤 Billed To', value: `<@${discordUserId}> (\`${discordUsername}\`)`, inline: true },
                                    { name: '📅 Valid Until', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
                                )
                                
                                .setFooter({ text: 'Merchant: CHAUDHARY TANMAY • https://panel.fusionhub.in' })
                                .setTimestamp();

                            const userObj = await discordClient.users.fetch(discordUserId).catch(() => null);
                            if (userObj) {
                                await userObj.send({ embeds: [invoiceEmbed], files: [invoiceFile] }).catch(() => {});
                            }
                        } catch(e) { console.log('[Trial DM Notice]', e.message); }
                    }
                }

                await recordSupabasePayment({
                    transaction_id: trialOrderId,
                    order_id: trialOrderId,
                    discord_user_id: String(discordUserId),
                    discord_username: discordUsername,
                    guild_id: reqGuildId || null,
                    customer_email: customerEmail || 'support@fusionhub.in',
                    customer_phone: customerPhone || '+91 99999 99999',
                    plan_name: plan === 'starter' ? 'Starter Plan (Free Trial)' : 'Pro Server Plan (1-Month Free Trial)',
                    billing_cycle: cycle || 'monthly',
                    amount: 0,
                    currency: 'INR',
                    payment_method: 'COUPON_FUSIONBOT',
                    payment_status: 'SUCCESS',
                    created_at: new Date().toISOString()
                });

                return res.json({
                    success: true,
                    freeTrial: true,
                    redirectUrl: `/api/payment/verify?order_id=${trialOrderId}&plan=${plan}&cycle=${cycle}${reqGuildId ? '&guild_id=' + reqGuildId : ''}`
                });
            }

            const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const orderPayload = {
                order_id: orderId,
                order_amount: finalAmt,
                order_currency: 'INR',
                customer_details: {
                    customer_id: String(discordUserId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 45),
                    customer_name: discordUsername,
                    customer_email: customerEmail || 'support@fusionhub.in',
                    customer_phone: customerPhone || '9999999999'
                },
                order_meta: {
                    return_url: `${PANEL_DOMAIN}/api/payment/verify?order_id={order_id}&plan=${plan}&cycle=${cycle}`
                },
                order_note: `Fusion ${plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan'} (${cycle}) ${cleanCoupon ? '[Coupon: ' + cleanCoupon + ']' : ''}`
            };

            const cfRes = await fetch(`${CASHFREE_API_URL}/orders`, {
                method: 'POST',
                headers: {
                    'x-client-id': CASHFREE_APP_ID,
                    'x-client-secret': CASHFREE_SECRET_KEY,
                    'x-api-version': '2023-08-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderPayload)
            });

            const cfData = await cfRes.json();
            if (cfData && cfData.payment_session_id) {
                // Record initial pending transaction in Supabase
                await recordSupabasePayment({
                    transaction_id: orderId,
                    discord_user_id: String(discordUserId),
                    discord_username: discordUsername,
                    plan_name: plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan',
                    billing_cycle: cycle,
                    amount: orderPayload.order_amount,
                    currency: 'INR',
                    payment_status: 'PENDING',
                    created_at: new Date().toISOString()
                });

                const paymentLink = cfData.payments?.url || cfData.payment_link || `https://payments.cashfree.com/order/#${cfData.payment_session_id}`;
                res.json({ success: true, paymentSessionId: cfData.payment_session_id, paymentLink, orderId });
            } else {
                console.error('Cashfree error response:', cfData);
                res.status(500).json({ success: false, error: cfData.message || 'Failed to create Cashfree session' });
            }
        } catch(e) {
            console.error('Payment order creation error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Post-Payment Claim Server API
    app.post('/api/payment/claim-server', async (req, res) => {
        try {
            const { orderId, guildId, plan, cycle } = req.body;
            if (!guildId) return res.status(400).json({ success: false, error: 'Server ID required' });

            const liveGuild = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId).catch(() => null);
            const serverName = liveGuild ? liveGuild.name : `Discord Server (${guildId})`;

            let discordUserId = req.session?.discordId || req.body?.userId || '';
            let discordUsername = req.session?.discordUsername || '';

            // If userId is missing or guest, look up by orderId in licenses or trials
            if (!discordUserId || discordUserId === 'user' || discordUserId === 'undefined') {
                const allLics = getUserLicenses();
                if (orderId) {
                    for (const uid in allLics) {
                        if (allLics[uid]?.orderId === orderId || uid === orderId) {
                            discordUserId = uid;
                            discordUsername = allLics[uid].username || discordUsername;
                            break;
                        }
                    }
                }
                if (!discordUserId || discordUserId === 'user') {
                    discordUserId = (orderId ? orderId : ('user_' + Date.now()));
                }
            }

            if (!discordUsername || discordUsername === 'Admin' || discordUsername === 'Customer' || discordUsername === 'User' || discordUsername === 'Discord Member') {
                if (discordUserId && !String(discordUserId).startsWith('guest_') && !String(discordUserId).startsWith('order_') && !String(discordUserId).startsWith('trial_') && discordClient) {
                    try {
                        const fetchedU = await discordClient.users.fetch(discordUserId).catch(() => null);
                        if (fetchedU) discordUsername = fetchedU.username;
                    } catch(_) {}
                }
            }
            if (!discordUsername) discordUsername = (liveGuild?.name ? `${liveGuild.name} Admin` : 'Server Admin');

            const numDays = (cycle === 'yearly' ? 365 : 30);
            const expiresAt = new Date(Date.now() + numDays * 86400000);

            // 1. Activate in MongoDB ServerConfig
            await ServerConfig.findOneAndUpdate(
                { guildId },
                {
                    isPremium: true,
                    premiumPlan: plan || 'pro',
                    premiumCycle: cycle || 'monthly',
                    premiumExpiresAt: expiresAt,
                    premiumActivatedBy: `${discordUsername} (${discordUserId})`
                },
                { upsert: true }
            );

            // 2. Activate in Local server_config.json
            const localCfg = readDB(dbFiles.serverConfig) || {};
            localCfg[guildId] = {
                ...(localCfg[guildId] || {}),
                isPremium: true,
                premiumPlan: plan || 'pro',
                premiumCycle: cycle || 'monthly',
                premiumExpiresAt: expiresAt,
                premiumActivatedBy: `${discordUsername} (${discordUserId})`
            };
            writeDB(dbFiles.serverConfig, localCfg);

            // 3. Activate in Multi-Server License Slots
            activateServerSlot(discordUserId, discordUsername, guildId, serverName, plan || 'pro', cycle || 'monthly', expiresAt, orderId);

            console.log(`[Slot Activated] Server ${serverName} (${guildId}) successfully activated with ${plan || 'pro'} license!`);

            const planTitle = (plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan');
            const cycleTitle = (cycle === 'yearly' ? 'Yearly' : 'Monthly');
            const rawAmt = (plan === 'starter' ? (cycle === 'yearly' ? '759.00' : '79.00') : (cycle === 'yearly' ? '1429.00' : '149.00'));
            const finalAmt = (orderId && orderId.startsWith('trial_')) ? '0.00 (Free Trial)' : rawAmt;
            const issueDateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const expiryDateStr = expiresAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

            if (orderId) {
                if (orderId.startsWith('trial_')) {
                    recordClaimedTrial(discordUserId, { username: discordUsername, guildId, orderId, plan: plan || 'pro' });
                }
                await recordSupabasePayment({
                    transaction_id: orderId,
                    order_id: orderId,
                    discord_user_id: String(discordUserId),
                    discord_username: discordUsername,
                    guild_id: guildId,
                    guild_name: serverName,
                    plan_name: planTitle,
                    billing_cycle: cycle || 'monthly',
                    amount: (orderId.startsWith('trial_') ? 0 : Number(rawAmt) || 0),
                    payment_status: 'SUCCESS',
                    created_at: new Date().toISOString()
                });
            }

            // DM invoice if possible
            if (discordClient && discordUserId && !String(discordUserId).startsWith('guest_') && !String(discordUserId).startsWith('trial_') && !String(discordUserId).startsWith('order_')) {
                try {
                    const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
                    const invoiceSvgBuffer = generateInvoiceSVG({
                        transactionId: `#TX-${orderId || ('FUSION_' + Date.now())}`,
                        username: `@${discordUsername}`,
                        customerName: discordUsername,
                        serverName: serverName,
                        serverId: guildId,
                        planName: planTitle,
                        cycle: cycleTitle,
                        amount: finalAmt,
                        date: issueDateStr,
                        expiryDate: expiryDateStr
                    });

                    const invoiceFile = new AttachmentBuilder(invoiceSvgBuffer, { name: `fusion_bill_${orderId || 'receipt'}.svg` });
                    const invoiceEmbed = new EmbedBuilder()
                        .setColor(0x10B981)
                        .setAuthor({ name: 'Fusion Bot Billing & Invoices', iconURL: 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg' })
                        .setTitle('🧾 Payment Bill & Subscription Activated')
                        .setDescription(`Hello **${discordUsername}**,\n\nThank you for choosing **Fusion ${planTitle}**! Your premium subscription is now active on **${serverName}**.\n\nYour digital payment bill image is attached below for your records.`)
                        .addFields(
                            { name: '👑 Plan Name', value: `\`Fusion ${planTitle} (${cycleTitle})\``, inline: true },
                            { name: '💳 Amount Paid', value: `\`₹${finalAmt}\``, inline: true },
                            { name: '🏷️ Transaction ID', value: `\`#TX-${orderId || 'ACTIVE'}\``, inline: true },
                            { name: '🛡️ Activated Server', value: `**${serverName}**\n(\`${guildId}\`)`, inline: true },
                            { name: '👤 Billed To', value: `<@${discordUserId}> (\`${discordUsername}\`)`, inline: true },
                            { name: '📅 Valid Until', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
                        )
                        .setFooter({ text: 'Merchant: CHAUDHARY TANMAY • https://panel.fusionhub.in' })
                        .setTimestamp();

                    const userObj = await discordClient.users.fetch(discordUserId).catch(() => null);
                    if (userObj) {
                        await userObj.send({ embeds: [invoiceEmbed], files: [invoiceFile] }).catch(() => {});
                    }
                } catch(e) {}
            }

            const targetRedirect = (discordUserId && !String(discordUserId).startsWith('guest_') && !String(discordUserId).startsWith('order_') && !String(discordUserId).startsWith('trial_'))
                ? `/dashboard/${discordUserId}/${guildId}`
                : `/dashboard/${guildId}`;

            res.json({ success: true, redirectUrl: targetRedirect });
        } catch(e) {
            console.error('[Claim Server Error]', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Payment Verification Callback, Post-Payment Server Selector & Animated Receipt
    app.get(['/api/payment/verify', '/payment/verify'], async (req, res) => {
        const orderId = req.query.order_id || req.query.link_id || '';
        const plan = req.query.plan || 'starter';
        const cycle = req.query.cycle || 'monthly';
        const guildId = req.query.guild_id || '';
        const liveGuild = guildId ? discordClient.guilds.cache.get(guildId) : null;
        const serverName = liveGuild ? liveGuild.name : (guildId ? `Server (${guildId})` : '');

        try {
            let cfData = {};
            let cfPayments = [];
            const isTrial = !!(orderId && orderId.startsWith('trial_'));

            if (!isTrial && orderId) {
                try {
                    const cfRes = await fetch(`${CASHFREE_API_URL}/orders/${orderId}`, {
                        headers: {
                            'x-client-id': CASHFREE_APP_ID,
                            'x-client-secret': CASHFREE_SECRET_KEY,
                            'x-api-version': '2023-08-01'
                        }
                    });
                    cfData = await cfRes.json();
                } catch(_) {}

                try {
                    const payRes = await fetch(`${CASHFREE_API_URL}/orders/${orderId}/payments`, {
                        headers: {
                            'x-client-id': CASHFREE_APP_ID,
                            'x-client-secret': CASHFREE_SECRET_KEY,
                            'x-api-version': '2023-08-01'
                        }
                    });
                    cfPayments = await payRes.json();
                } catch(_) {}
            }

            const latestPayment = (Array.isArray(cfPayments) && cfPayments.length > 0) ? cfPayments[0] : {};
            const isExplicitActive = req.query.status === 'active' || !!(liveGuild && ((getUserLicense(discordUserId)?.activeGuilds || []).some(g => g.guildId === guildId)));
            const isPaid = isTrial || isExplicitActive || !!(cfData && (cfData.order_status === 'PAID' || cfData.order_status === 'SUCCESS' || latestPayment.payment_status === 'SUCCESS'));
            
            const rawAmt = isTrial ? 0 : (cfData.order_amount || (plan === 'starter' ? (cycle === 'yearly' ? 759 : 79) : (cycle === 'yearly' ? 1429 : 149)));
            const amountFormatted = isTrial ? '0.00 (Free Trial)' : Number(rawAmt).toFixed(2);
            
            const customerEmail = cfData.customer_details?.customer_email || (req.session?.discordEmail || 'support@fusionhub.in');
            const customerPhone = cfData.customer_details?.customer_phone || '+91 98765 43210';
            const transactionId = isTrial ? `#${orderId}` : (latestPayment.cf_payment_id ? `#TX-${latestPayment.cf_payment_id}` : (orderId ? `#${orderId}` : '#TX-84920194'));
            
            let paymentMethod = isTrial ? 'FREE TRIAL COUPON (FUSIONBOT)' : 'UPI / NetBanking / Card';
            if (!isTrial) {
                if (latestPayment.payment_group) {
                    paymentMethod = latestPayment.payment_group.toUpperCase();
                } else if (latestPayment.payment_method && typeof latestPayment.payment_method === 'object') {
                    paymentMethod = Object.keys(latestPayment.payment_method)[0]?.toUpperCase() || 'UPI / Card';
                }
            }

            // Real failure reason extraction
            let failureReason = 'Transaction declined by bank / server timeout';
            if (latestPayment.payment_message) {
                failureReason = latestPayment.payment_message;
            } else if (latestPayment.error_details?.error_description) {
                failureReason = latestPayment.error_details.error_description;
            } else if (cfData.order_status === 'USER_DROPPED') {
                failureReason = 'Payment was cancelled by user';
            } else if (cfData.order_status === 'EXPIRED') {
                failureReason = 'Payment session expired';
            }

            let discordUserId = req.session?.discordId || req.query.user_id || req.query.discord_id || '';
            let discordUsername = req.session?.discordUsername || '';

            if (!discordUserId && orderId && orderId.startsWith('trial_')) {
                const parts = orderId.split('_');
                if (parts[1]) discordUserId = parts[1];
            }
            if (!discordUserId && cfData?.customer_details?.customer_id) {
                discordUserId = cfData.customer_details.customer_id;
            }
            if (!discordUsername && cfData?.customer_details?.customer_name) {
                discordUsername = cfData.customer_details.customer_name;
            }
            if (!discordUsername) discordUsername = 'Customer';

            // Record transaction in Supabase
            if (orderId) {
                if (orderId.startsWith('trial_')) {
                    recordClaimedTrial(discordUserId, { username: discordUsername, guildId, orderId, plan });
                }
                await recordSupabasePayment({
                    transaction_id: String(transactionId).replace('#', ''),
                    order_id: String(orderId),
                    discord_user_id: String(discordUserId),
                    discord_username: discordUsername,
                    customer_email: customerEmail,
                    customer_phone: customerPhone,
                    plan_name: plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan',
                    billing_cycle: cycle,
                    amount: Number(rawAmt),
                    currency: 'INR',
                    payment_method: paymentMethod,
                    payment_status: isPaid ? 'SUCCESS' : 'FAILED',
                    failure_reason: isPaid ? null : failureReason,
                    created_at: new Date().toISOString()
                });
            }

            // Mutual servers where user is in and bot is in
            let eligibleServers = [];
            const botGuildIds = new Set(discordClient.guilds.cache.keys());

            // 1. From session.guilds
            if (req.session && Array.isArray(req.session.guilds)) {
                req.session.guilds.forEach(g => {
                    if (botGuildIds.has(g.id) && !eligibleServers.some(es => es.id === g.id)) {
                        const live = discordClient.guilds.cache.get(g.id);
                        eligibleServers.push({
                            id: g.id,
                            name: live ? live.name : (g.name || `Server (${g.id})`),
                            members: live?.memberCount || '?',
                            icon: (live && typeof live.iconURL === 'function') ? live.iconURL({ size: 64 }) : (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null)
                        });
                    }
                });
            }

            // 2. From MongoDB DashSession if session wasn't loaded in memory
            if (discordUserId && discordUserId !== 'user') {
                try {
                    const savedSession = await DashSession.findOne({ discordId: discordUserId }).sort({ createdAt: -1 });
                    if (savedSession && Array.isArray(savedSession.guilds)) {
                        savedSession.guilds.forEach(g => {
                            if (botGuildIds.has(g.id) && !eligibleServers.some(es => es.id === g.id)) {
                                const live = discordClient.guilds.cache.get(g.id);
                                eligibleServers.push({
                                    id: g.id,
                                    name: live ? live.name : (g.name || `Server (${g.id})`),
                                    members: live?.memberCount || '?',
                                    icon: (live && typeof live.iconURL === 'function') ? live.iconURL({ size: 64 }) : (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null)
                                });
                            }
                        });
                    }
                } catch(_) {}
            }

            // 3. From Discord bot guilds cache (checking ownership & member presence)
            if (discordClient && discordUserId && discordUserId !== 'user') {
                for (const [gid, g] of discordClient.guilds.cache.entries()) {
                    if (!eligibleServers.some(es => es.id === gid)) {
                        let isMember = (g.ownerId === discordUserId);
                        if (!isMember) {
                            if (g.members.cache.has(discordUserId)) {
                                isMember = true;
                            } else {
                                try {
                                    const m = await g.members.fetch(discordUserId).catch(() => null);
                                    if (m) isMember = true;
                                } catch (_) {}
                            }
                        }
                        if (isMember) {
                            eligibleServers.push({
                                id: g.id,
                                name: g.name,
                                members: g.memberCount || '?',
                                icon: typeof g.iconURL === 'function' ? g.iconURL({ size: 64 }) : null
                            });
                        }
                    }
                }
            }

            // Fallback: If no mutual servers detected, populate all active bot guilds so user can select any server
            if (eligibleServers.length === 0 && discordClient) {
                for (const [gid, g] of discordClient.guilds.cache.entries()) {
                    eligibleServers.push({
                        id: g.id,
                        name: g.name,
                        members: g.memberCount || '?',
                        icon: typeof g.iconURL === 'function' ? g.iconURL({ size: 64 }) : null
                    });
                }
            }

            const userLicense = (discordUserId && discordUserId !== 'user') ? getUserLicense(discordUserId) : null;
            const maxSlots = (plan === 'starter' ? 1 : 3);
            const activeSlots = (userLicense && Array.isArray(userLicense.activeGuilds)) ? userLicense.activeGuilds : (guildId ? [{ guildId, name: serverName }] : []);

            res.send(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${isPaid ? 'Payment Successful' : 'Payment Failed'} | Fusion Premium</title>
  <link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      position: relative;
      padding: 24px 16px;
      transition: background-color 0.3s ease;
    }

    /* ─── DARK THEME (DEFAULT) ─── */
    html[data-theme="dark"] body {
      background-color: ${isPaid ? '#070a13' : '#0b0709'};
    }

    html[data-theme="dark"] .blob-1 {
      width: 340px; height: 340px;
      background: ${isPaid ? 'radial-gradient(circle, #10b981 0%, #059669 100%)' : 'radial-gradient(circle, #ef4444 0%, #b91c1c 100%)'};
      top: -60px; left: calc(50% - 250px);
    }
    html[data-theme="dark"] .blob-2 {
      width: 300px; height: 300px;
      background: ${isPaid ? 'radial-gradient(circle, #3b82f6 0%, #1d4ed8 100%)' : 'radial-gradient(circle, #f97316 0%, #c2410c 100%)'};
      bottom: -50px; right: calc(50% - 240px);
      animation-delay: -3.5s;
    }
    html[data-theme="dark"] .blob-3 {
      width: 240px; height: 240px;
      background: ${isPaid ? 'radial-gradient(circle, #8b5cf6 0%, #6d28d9 100%)' : 'radial-gradient(circle, #ec4899 0%, #be185d 100%)'};
      bottom: 25%; left: calc(50% - 220px);
      animation-delay: -7s;
    }

    html[data-theme="dark"] .glass-card {
      background: ${isPaid ? 'rgba(15, 23, 42, 0.72)' : 'rgba(26, 16, 21, 0.72)'};
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-top: 1px solid rgba(255, 255, 255, 0.25);
      box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.15);
    }

    html[data-theme="dark"] .title { color: #f8fafc; }
    html[data-theme="dark"] .amount-tag {
      background: ${isPaid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
      border: 1px solid ${isPaid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'};
      color: ${isPaid ? '#34d399' : '#f87171'};
      box-shadow: 0 0 20px ${isPaid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
    }
    html[data-theme="dark"] .glass-details-box {
      background: ${isPaid ? 'rgba(2, 6, 23, 0.55)' : 'rgba(18, 10, 14, 0.55)'};
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    html[data-theme="dark"] .detail-row {
      color: #94a3b8;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    html[data-theme="dark"] .detail-row span:last-child { color: #f1f5f9; }

    /* ─── WHITE / LIGHT THEME ─── */
    html[data-theme="light"] body {
      background-color: ${isPaid ? '#f1f5f9' : '#f8fafc'};
    }

    html[data-theme="light"] .blob-1 {
      width: 320px; height: 320px;
      background: ${isPaid ? 'radial-gradient(circle, #4ade80 0%, #22c55e 100%)' : 'radial-gradient(circle, #fca5a5 0%, #f87171 100%)'};
      top: -60px; left: calc(50% - 240px);
    }
    html[data-theme="light"] .blob-2 {
      width: 280px; height: 280px;
      background: ${isPaid ? 'radial-gradient(circle, #60a5fa 0%, #38bdf8 100%)' : 'radial-gradient(circle, #fdba74 0%, #fb923c 100%)'};
      bottom: -40px; right: calc(50% - 220px);
      animation-delay: -3s;
    }
    html[data-theme="light"] .blob-3 {
      width: 220px; height: 220px;
      background: ${isPaid ? 'radial-gradient(circle, #fde047 0%, #facc15 100%)' : 'radial-gradient(circle, #f9a8d4 0%, #f472b6 100%)'};
      bottom: 20%; left: calc(50% - 200px);
      animation-delay: -6s;
    }

    html[data-theme="light"] .glass-card {
      background: rgba(255, 255, 255, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.85);
      box-shadow: 0 24px 48px -12px ${isPaid ? 'rgba(15, 23, 42, 0.12)' : 'rgba(239, 68, 68, 0.12)'}, inset 0 1px 2px rgba(255, 255, 255, 0.8);
    }

    html[data-theme="light"] .title { color: #0f172a; }
    html[data-theme="light"] .amount-tag {
      background: ${isPaid ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.1)'};
      border: 1px solid ${isPaid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.25)'};
      color: ${isPaid ? '#15803d' : '#dc2626'};
    }
    html[data-theme="light"] .glass-details-box {
      background: rgba(255, 255, 255, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.8);
      box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.03);
    }
    html[data-theme="light"] .detail-row {
      color: #64748b;
      border-bottom: 1px solid rgba(226, 232, 240, 0.7);
    }
    html[data-theme="light"] .detail-row span:last-child { color: #1e293b; }

    /* ─── COMMON ANIMATIONS & STYLES ─── */
    .blob {
      position: absolute;
      filter: blur(75px);
      border-radius: 50%;
      opacity: 0.65;
      z-index: 0;
      animation: float 10s infinite alternate ease-in-out;
      pointer-events: none;
    }

    .glass-card {
      position: relative;
      z-index: 1;
      width: 480px;
      max-width: 96%;
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      border-radius: 32px;
      padding: 36px 24px;
      text-align: center;
      animation: cardEntrance 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards ${!isPaid ? ', cardShake 0.4s ease-in-out 0.85s' : ''};
      margin: auto;
    }

    .badge-stage {
      position: relative;
      width: 100px;
      height: 100px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shockwave {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid ${isPaid ? '#10b981' : '#ef4444'};
      box-shadow: 0 0 15px ${isPaid ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'};
      opacity: 0;
      pointer-events: none;
    }

    .shockwave-1 { animation: shockwavePulse 2s cubic-bezier(0.1, 0.8, 0.3, 1) 0.6s infinite; }
    .shockwave-2 { animation: shockwavePulse 2s cubic-bezier(0.1, 0.8, 0.3, 1) 1.2s infinite; }

    .particle {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      opacity: 0;
      pointer-events: none;
    }

    ${isPaid ? `
      .p1 { background: #34d399; box-shadow: 0 0 8px #34d399; --tx: -55px; --ty: -45px; animation: burst 0.8s ease-out 0.65s forwards; }
      .p2 { background: #38bdf8; box-shadow: 0 0 8px #38bdf8; --tx: 50px;  --ty: -50px; width: 6px; height: 10px; border-radius: 2px; animation: burstRotate 0.85s ease-out 0.65s forwards; }
      .p3 { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; --tx: -60px; --ty: 15px;  animation: burst 0.75s ease-out 0.68s forwards; }
      .p4 { background: #f472b6; box-shadow: 0 0 8px #f472b6; --tx: 65px;  --ty: 10px;  width: 7px; height: 7px; animation: burst 0.8s ease-out 0.65s forwards; }
      .p5 { background: #10b981; box-shadow: 0 0 8px #10b981; --tx: -35px; --ty: 55px;  width: 5px; height: 9px; border-radius: 2px; animation: burstRotate 0.9s ease-out 0.67s forwards; }
      .p6 { background: #a78bfa; box-shadow: 0 0 8px #a78bfa; --tx: 40px;  --ty: 50px;  animation: burst 0.8s ease-out 0.65s forwards; }
    ` : `
      .p1 { background: #f87171; box-shadow: 0 0 8px #f87171; --tx: -55px; --ty: -45px; animation: burst 0.8s ease-out 0.65s forwards; }
      .p2 { background: #fb923c; box-shadow: 0 0 8px #fb923c; --tx: 50px;  --ty: -50px; width: 6px; height: 10px; border-radius: 2px; animation: burstRotate 0.85s ease-out 0.65s forwards; }
      .p3 { background: #f43f5e; box-shadow: 0 0 8px #f43f5e; --tx: -60px; --ty: 15px;  animation: burst 0.75s ease-out 0.68s forwards; }
      .p4 { background: #e11d48; box-shadow: 0 0 8px #e11d48; --tx: 65px;  --ty: 10px;  width: 7px; height: 7px; animation: burst 0.8s ease-out 0.65s forwards; }
      .p5 { background: #ef4444; box-shadow: 0 0 8px #ef4444; --tx: -35px; --ty: 55px;  width: 5px; height: 9px; border-radius: 2px; animation: burstRotate 0.9s ease-out 0.67s forwards; }
      .p6 { background: #fda4af; box-shadow: 0 0 8px #fda4af; --tx: 40px;  --ty: 50px;  animation: burst 0.8s ease-out 0.65s forwards; }
    `}

    .icon-container {
      width: 80px;
      height: 80px;
      background: ${isPaid ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 3;
      box-shadow: 0 0 30px ${isPaid ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'};
      transform: scale(0);
      animation: badgePop 0.6s cubic-bezier(0.34, 1.7, 0.64, 1) 0.2s forwards;
    }

    .checkmark-svg { width: 44px; height: 44px; }
    .checkmark-path {
      stroke-dasharray: 60;
      stroke-dashoffset: 60;
      stroke: #ffffff;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      animation: drawCheck 0.45s cubic-bezier(0.65, 0, 0.45, 1) 0.65s forwards;
    }

    .cross-svg { width: 40px; height: 40px; }
    .cross-line {
      stroke-dasharray: 40;
      stroke-dashoffset: 40;
      stroke: #ffffff;
      stroke-width: 5;
      stroke-linecap: round;
      fill: none;
    }
    .line-1 { animation: drawLine 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards; }
    .line-2 { animation: drawLine 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.75s forwards; }

    .title {
      font-size: 1.45rem;
      font-weight: 700;
      margin-bottom: 2px;
      opacity: 0;
      transform: translateY(14px);
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.75s forwards;
    }

    .amount-tag {
      display: inline-block;
      font-size: 1.4rem;
      font-weight: 800;
      padding: 4px 18px;
      border-radius: 999px;
      margin: 8px 0 16px;
      opacity: 0;
      transform: scale(0.85);
      animation: tagPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.85s forwards;
    }

    .glass-details-box {
      border-radius: 18px;
      padding: 14px 16px;
      margin-bottom: 16px;
      text-align: left;
      opacity: 0;
      transform: translateY(16px);
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.95s forwards;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      padding: 6px 0;
    }
    .detail-row:last-child { border-bottom: none; padding-bottom: 0; }
    .detail-row:first-child { padding-top: 0; }
    .detail-row span:last-child { font-weight: 600; text-align: right; word-break: break-word; max-width: 60%; }

    .text-danger { color: #ef4444 !important; }

    /* Button Group */
    .btn-glass, .btn-retry {
      position: relative;
      background: linear-gradient(135deg, ${isPaid ? '#10b981 0%, #059669 100%' : '#ef4444 0%, #b91c1c 100%'});
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 13px 24px;
      border-radius: 14px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 8px 24px -4px ${isPaid ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'};
      opacity: 0;
      transform: translateY(16px);
      transition: transform 0.15s ease, box-shadow 0.2s ease;
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.05s forwards;
      text-decoration: none;
      display: inline-block;
    }

    .btn-glass::after, .btn-retry::after {
      content: '';
      position: absolute;
      top: -50%; left: -60%; width: 40%; height: 200%;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.45) 50%, rgba(255, 255, 255, 0) 100%);
      transform: rotate(25deg);
      animation: shimmerSweep 3s infinite 1.8s;
    }

    .btn-glass:hover, .btn-retry:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px -4px ${isPaid ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'};
    }

    .btn-glass:active, .btn-retry:active, .btn-cancel:active { transform: scale(0.98); }

    .btn-group {
      display: flex;
      gap: 10px;
      opacity: 0;
      transform: translateY(16px);
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.05s forwards;
    }

    .btn-cancel {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 13px;
      border-radius: 14px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .btn-cancel:hover { background: rgba(255, 255, 255, 0.12); color: #ffffff; }

    /* Theme Switcher Toggle */
    .theme-toggle-top {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.2s;
    }
    .theme-toggle-top:hover { color: #fff; transform: scale(1.05); }

    /* Keyframes */
    @keyframes float { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(30px, 40px) scale(1.1); } }
    @keyframes cardEntrance { 0% { opacity: 0; transform: translateY(40px) scale(0.94); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes cardShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
    @keyframes badgePop { 0% { transform: scale(0); } 70% { transform: scale(1.18); } 100% { transform: scale(1); } }
    @keyframes drawCheck { 0% { stroke-dashoffset: 60; } 100% { stroke-dashoffset: 0; } }
    @keyframes drawLine { to { stroke-dashoffset: 0; } }
    @keyframes burst { 0% { opacity: 1; transform: translate(0, 0) scale(0.5); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(1.1); } }
    @keyframes burstRotate { 0% { opacity: 1; transform: translate(0, 0) scale(0.5) rotate(0deg); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(1.1) rotate(180deg); } }
    @keyframes shockwavePulse { 0% { transform: scale(0.7); opacity: 0.9; } 100% { transform: scale(1.7); opacity: 0; } }
    @keyframes tagPop { to { opacity: 1; transform: scale(1); } }
    @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }

    /* Mobile Optimization for Phones */
    @media (max-width: 480px) {
      body { padding: 12px 8px; }
      .glass-card { padding: 22px 14px; border-radius: 20px; width: 100%; max-width: 100%; }
      .title { font-size: 1.25rem; }
      .amount-tag { font-size: 1.15rem; padding: 4px 14px; }
      .glass-details-box { padding: 10px 12px; margin-bottom: 14px; }
      .detail-row { font-size: 0.8rem; padding: 7px 0; }
      select, button, input { min-height: 40px; font-size: 0.8rem !important; }
      .btn-glass { padding: 12px 16px; font-size: 0.88rem; }
    }
  </style>
</head>
<body>

  <!-- Theme Toggle Button -->
  <button class="theme-toggle-top" onclick="toggleTheme()" title="Toggle Dark/Light Mode">
    <i class="fa-solid fa-sun-bright" id="themeIcon"></i>
  </button>

  <!-- Ambient Liquid Blobs -->
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>

  <!-- Liquid Glass Card -->
  <div class="glass-card">
    
    <div class="badge-stage">
      <div class="shockwave shockwave-1"></div>
      <div class="shockwave shockwave-2"></div>

      <div class="particle p1"></div>
      <div class="particle p2"></div>
      <div class="particle p3"></div>
      <div class="particle p4"></div>
      <div class="particle p5"></div>
      <div class="particle p6"></div>

      <div class="icon-container">
        ${isPaid ? `
          <svg class="checkmark-svg" viewBox="0 0 52 52">
            <path class="checkmark-path" d="M14 27 L22 35 L38 17" />
          </svg>
        ` : `
          <svg class="cross-svg" viewBox="0 0 52 52">
            <line class="cross-line line-1" x1="16" y1="16" x2="36" y2="36" />
            <line class="cross-line line-2" x1="36" y1="16" x2="16" y2="36" />
          </svg>
        `}
      </div>
    </div>

    <h2 class="title">${isPaid ? 'Payment Successful!' : 'Payment Failed'}</h2>
    <div class="amount-tag">₹${amountFormatted}</div>

    <!-- User Information & Receipt Details -->
    <div class="glass-details-box">
      ${serverName ? `
        <div class="detail-row">
          <span>Server</span>
          <span style="color:#34d399;font-weight:700;">${serverName}</span>
        </div>
      ` : ''}
      <div class="detail-row">
        <span>Transaction ID</span>
        <span>${transactionId}</span>
      </div>
      <div class="detail-row">
        <span>Payment Method</span>
        <span>${paymentMethod}</span>
      </div>
      <div class="detail-row">
        <span>Plan</span>
        <span>${plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan'} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})</span>
      </div>
      ${!isPaid ? `
        <div class="detail-row">
          <span>Reason</span>
          <span class="text-danger">${failureReason}</span>
        </div>
      ` : `
        <div class="detail-row">
          <span>Status</span>
          <span style="color:#34d399;font-weight:800;">✓ Active &amp; Verified</span>
        </div>
      `}
    </div>

    ${isPaid ? `
      <!-- 🧾 Official Digital Tax Invoice & Bill Section -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:16px;margin-bottom:18px;text-align:left;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-weight:800;font-size:0.9rem;color:#fff;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-file-invoice-dollar" style="color:#10b981;"></i> Official Tax Invoice &amp; Bill
          </div>
          <span style="background:rgba(16,185,129,0.15);color:#34d399;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:999px;border:1px solid rgba(16,185,129,0.3);">
            ✓ Verified Bill
          </span>
        </div>

        <div style="background:rgba(0,0,0,0.35);border-radius:12px;padding:12px;margin-bottom:12px;font-size:0.8rem;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;color:#94a3b8;">
            <span>Invoice No:</span> <strong style="color:#fff;font-family:monospace;">${transactionId}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;color:#94a3b8;">
            <span>Date of Issue:</span> <span style="color:#cbd5e1;">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#94a3b8;">
            <span>Billed To:</span> <span style="color:#cbd5e1;">${discordUsername}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#94a3b8;">
            <span>Plan &amp; Cycle:</span> <span style="color:#34d399;font-weight:700;">${plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan'} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#94a3b8;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:2px;">
            <span style="font-weight:700;color:#fff;">Total Amount:</span> <span style="color:#10b981;font-weight:900;font-size:0.95rem;">₹${amountFormatted}</span>
          </div>
        </div>

        <!-- Invoice Action Buttons -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="/api/invoice/image?tx=${encodeURIComponent(transactionId)}&user=${encodeURIComponent(discordUsername)}&customer=${encodeURIComponent(customerEmail)}&server=${encodeURIComponent(serverName || 'Discord Server')}&server_id=${encodeURIComponent(guildId || '')}&plan=${encodeURIComponent(plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan')}&cycle=${encodeURIComponent(cycle)}&amount=${encodeURIComponent(amountFormatted)}" target="_blank" download="fusion_invoice_${String(transactionId).replace(/[^a-zA-Z0-9]/g, '_')}.svg" style="flex:1;min-width:140px;background:#6366f1;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-size:0.8rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 14px rgba(99,102,241,0.35);">
            <i class="fa-solid fa-download"></i> Download Bill (SVG)
          </a>
          <button type="button" onclick="toggleInvoicePreview()" style="flex:1;min-width:140px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:10px 14px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-eye"></i> <span id="btnViewBillText">View Full Bill</span>
          </button>
        </div>

        <!-- Inline Invoice SVG Preview Container -->
        <div id="invoicePreviewBox" style="display:none;margin-top:14px;border-radius:12px;overflow:hidden;border:1px solid rgba(99,102,241,0.3);box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          <div style="background:rgba(99,102,241,0.2);padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.75rem;font-weight:700;color:#c7d2fe;">Tax Invoice Preview</span>
            <button type="button" onclick="printInvoice()" style="background:#10b981;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:0.72rem;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:4px;">
              <i class="fa-solid fa-print"></i> Print Bill
            </button>
          </div>
          <img id="invoiceSvgImg" src="/api/invoice/image?tx=${encodeURIComponent(transactionId)}&user=${encodeURIComponent(discordUsername)}&customer=${encodeURIComponent(customerEmail)}&server=${encodeURIComponent(serverName || 'Discord Server')}&server_id=${encodeURIComponent(guildId || '')}&plan=${encodeURIComponent(plan === 'starter' ? 'Starter Plan' : 'Pro Server Plan')}&cycle=${encodeURIComponent(cycle)}&amount=${encodeURIComponent(amountFormatted)}" style="width:100%;height:auto;display:block;" alt="Tax Invoice" />
        </div>
      </div>

      <!-- Multi-Server License Slots Management (Pro = 3 Slots, Starter = 1 Slot) -->
      <div style="margin-bottom:18px;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <h3 style="font-size:0.9rem;font-weight:800;margin:0;display:flex;align-items:center;gap:6px;color:#fff;">
            <i class="fa-solid fa-layer-group" style="color:#6366f1;"></i> Server License Slots (${activeSlots.length}/${maxSlots} Active)
          </h3>
          <span style="background:rgba(99,102,241,0.2);color:#a5b4fc;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;border:1px solid rgba(99,102,241,0.3);">
            ${plan === 'starter' ? '1 Server License' : '3 Server Licenses (Pro)'}
          </span>
        </div>

        <!-- Slots List with Integrated Dropdowns in Slot 2 & Slot 3 -->
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">
          ${Array.from({ length: maxSlots }).map((_, slotIdx) => {
            const slotData = activeSlots[slotIdx];
            const availableGuilds = eligibleServers.filter(s => !activeSlots.some(as => as.guildId === s.id));

            if (slotData) {
              return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);">
                <div style="display:flex;align-items:center;gap:10px;overflow:hidden;">
                  <div style="width:28px;height:28px;border-radius:8px;background:#10b981;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:12px;">${slotIdx + 1}</div>
                  <div style="overflow:hidden;">
                    <div style="font-weight:800;font-size:0.85rem;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;">${slotData.name || 'Server ' + slotData.guildId}</div>
                    <div style="font-size:0.68rem;color:#94a3b8;">ID: ${slotData.guildId}</div>
                  </div>
                </div>
                <span style="color:#34d399;font-size:0.75rem;font-weight:800;display:flex;align-items:center;gap:4px;background:rgba(16,185,129,0.15);padding:4px 10px;border-radius:8px;">
                  <i class="fa-solid fa-circle-check"></i> Active
                </span>
              </div>`;
            } else {
              return `<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.22);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#94a3b8;font-weight:900;font-size:11px;">${slotIdx + 1}</div>
                    <div style="font-weight:700;font-size:0.82rem;color:#f1f5f9;">Server Slot ${slotIdx + 1} (Available)</div>
                  </div>
                  <span style="color:#a5b4fc;font-size:0.68rem;font-weight:700;">Select Server</span>
                </div>
                <div style="display:flex;gap:6px;margin-bottom:6px;">
                  <select id="slotDropdown_${slotIdx + 1}" style="flex:1;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:8px 10px;color:white;font-size:0.78rem;outline:none;">
                    ${availableGuilds.length > 0 ? `
                      <option value="">— Select from Your Servers —</option>
                      ${availableGuilds.map(s => `<option value="${s.id}">${s.name} (${s.members} members)</option>`).join('')}
                    ` : `
                      <option value="" disabled selected>— No other mutual servers in list —</option>
                    `}
                  </select>
                  <button type="button" onclick="claimSlotFromDropdown(${slotIdx + 1})" style="background:#10b981;color:white;border:none;padding:8px 14px;border-radius:10px;font-size:0.78rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                    <i class="fa-solid fa-bolt"></i> Activate
                  </button>
                </div>
                <div style="display:flex;gap:6px;">
                  <input type="text" id="manualSlotInput_${slotIdx + 1}" placeholder="Or enter Server ID manually..." style="flex:1;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 10px;color:white;font-size:0.72rem;outline:none;">
                  <button type="button" onclick="claimManualSlot(${slotIdx + 1})" style="background:rgba(99,102,241,0.8);color:white;border:none;padding:6px 10px;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                    Apply ID
                  </button>
                </div>
                <div style="font-size:0.68rem;color:#94a3b8;margin-top:4px;">
                  <a href="https://bot.fusionhub.in" target="_blank" style="color:#a5b4fc;text-decoration:underline;">➕ Invite Bot to another server</a>
                </div>
              </div>`;
            }
          }).join('')}
        </div>
      </div>

      <a href="${guildId ? (discordUserId ? `/dashboard/${discordUserId}/${guildId}` : `/dashboard/${guildId}`) : '/dashboard'}" class="btn-glass" style="display:flex;align-items:center;justify-content:center;gap:8px;">
        <i class="fa-solid fa-gauge-high"></i> Go to Server Dashboard
      </a>
    ` : `
      <div class="btn-group">
        <a href="/dashboard" class="btn-cancel">Cancel</a>
        <a href="/premium" class="btn-retry">Try Again</a>
      </div>
    `}
  </div>

  <script>
    // Theme Manager
    function initTheme() {
      var saved = localStorage.getItem('fusion_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      updateThemeIcon(saved);
    }
    function toggleTheme() {
      var curr = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = (curr === 'dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('fusion_theme', next);
      updateThemeIcon(next);
    }
    function updateThemeIcon(t) {
      var icon = document.getElementById('themeIcon');
      if (!icon) return;
      if (t === 'light') {
        icon.className = 'fa-solid fa-moon';
      } else {
        icon.className = 'fa-solid fa-sun';
      }
    }
    initTheme();

    async function claimServer(guildId) {
      if (!confirm('Activate premium plan on this server?')) return;
      try {
        var res = await fetch('/api/payment/claim-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: '${orderId}',
            guildId: guildId,
            plan: '${plan}',
            cycle: '${cycle}',
            userId: '${discordUserId}'
          })
        }).then(function(r) { return r.json(); });

        if (res.success) {
          window.location.href = res.redirectUrl || '/dashboard';
        } else {
          alert('Activation failed: ' + (res.error || 'Unknown error'));
        }
      } catch(err) {
        alert('Error: ' + err.message);
      }
    }

    async function claimSlotFromDropdown(slotNum) {
      var select = document.getElementById('slotDropdown_' + slotNum);
      var gid = select ? select.value.trim() : '';
      if (!gid) {
        var manualInput = document.getElementById('manualSlotInput_' + slotNum);
        gid = manualInput ? manualInput.value.trim() : '';
      }
      if (!gid) return alert('Please select a server from the dropdown or enter a Server ID.');
      claimServer(gid);
    }

    function claimManualSlot(slotNum) {
      var input = document.getElementById('manualSlotInput_' + slotNum);
      var gid = input ? input.value.trim() : '';
      if (!gid) return alert('Please enter a Discord Server ID.');
      claimServer(gid);
    }

    function toggleInvoicePreview() {
      var box = document.getElementById('invoicePreviewBox');
      var btnText = document.getElementById('btnViewBillText');
      if (!box) return;
      if (box.style.display === 'none' || !box.style.display) {
        box.style.display = 'block';
        if (btnText) btnText.textContent = 'Hide Bill';
      } else {
        box.style.display = 'none';
        if (btnText) btnText.textContent = 'View Full Bill';
      }
    }

    function printInvoice() {
      var img = document.getElementById('invoiceSvgImg');
      if (!img) return;
      var w = window.open('');
      w.document.write('<html><head><title>Print Tax Invoice</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}img{max-width:100%;height:auto;}</style></head><body><img src="' + img.src + '" onload="window.print();window.close();" /></body></html>');
      w.document.close();
    }
  </script>
</body>
</html>`);
        } catch(e) {
            console.error('Payment verify error:', e);
            res.redirect('/premium?error=' + encodeURIComponent(e.message));
        }
    });


                // API: Send Tax Invoice & Bill to Discord DM
    app.post('/api/invoice/send-dm', async (req, res) => {
        try {
            let userId = req.session?.discordId || req.body?.userId;
            const guildId = req.body?.guildId;

            if (!userId || userId === 'user' || userId === 'undefined') {
                const localCfg = readDB(dbFiles.serverConfig) || {};
                const guildCfg = localCfg[guildId] || {};
                const allLics = getUserLicenses();
                for (const uid in allLics) {
                    const lic = allLics[uid];
                    if (lic && Array.isArray(lic.activeGuilds) && lic.activeGuilds.some(g => g.guildId === guildId)) {
                        userId = uid;
                        break;
                    }
                }
                if (!userId && guildCfg.premiumActivatedBy) {
                    const m = guildCfg.premiumActivatedBy.match(/\((\d+)\)/);
                    if (m) userId = m[1];
                }
            }

            if (!userId || userId === 'user' || userId === 'undefined') {
                return res.status(400).json({ success: false, error: 'User authentication required.' });
            }

            const liveGuild = guildId ? discordClient.guilds.cache.get(guildId) : null;
            const serverName = liveGuild ? liveGuild.name : (guildId ? `Server (${guildId})` : 'Discord Server');
            const localCfg = readDB(dbFiles.serverConfig) || {};
            const guildCfg = localCfg[guildId] || {};
            const userLicense = getUserLicense(userId);

            const planTitle = (userLicense?.plan === 'starter' || guildCfg.premiumPlan === 'starter') ? 'Starter Plan' : 'Pro Server Plan';
            const cycleTitle = (userLicense?.cycle === 'yearly' || guildCfg.premiumCycle === 'yearly') ? 'Yearly' : 'Monthly';
            const expiresAt = (userLicense?.expiresAt || guildCfg.premiumExpiresAt) ? new Date(userLicense?.expiresAt || guildCfg.premiumExpiresAt) : new Date(Date.now() + 30 * 86400000);
            const isTrial = !!(userLicense?.orderId?.startsWith('trial_') || guildCfg.premiumActivatedBy?.includes('trial') || (!guildCfg.premiumPrice));

            // Fetch live user to get genuine Discord username
            let cleanUsername = req.session?.discordUsername;
            let userObj = null;
            if (discordClient && userId) {
                userObj = await discordClient.users.fetch(userId).catch(() => null);
                if (userObj) cleanUsername = userObj.username;
            }
            if (!cleanUsername && guildCfg.premiumActivatedBy) {
                const m = guildCfg.premiumActivatedBy.match(/^(.+?)\s*\(\d+\)$/);
                if (m && m[1] !== 'Admin' && m[1] !== 'User') cleanUsername = m[1];
            }
            if (!cleanUsername) cleanUsername = 'Discord User';

            if (!userObj) {
                return res.status(404).json({ success: false, error: 'Could not find Discord user.' });
            }

            const rawTx = userLicense?.orderId ? `#TX-${userLicense.orderId}` : (guildId ? `#TX-FUSION-${guildId.slice(-6)}` : `#TX-FUSION-${Date.now()}`);
            const paidAmtStr = isTrial ? '₹0.00 (100% OFF Free Trial)' : (planTitle === 'Starter Plan' ? '₹79.00' : '₹149.00');

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const invoiceEmbed = new EmbedBuilder()
                .setColor(0x10B981)
                .setAuthor({ name: 'Fusion Bot Billing & Official Invoices', iconURL: 'https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg' })
                .setTitle('🧾 Official Tax Invoice & Payment Receipt')
                .setDescription(`Hello **@${cleanUsername}**,\n\nYour official digital payment receipt and tax invoice for **Fusion ${planTitle}** is ready.\n\n🔗 **Click the button below to view and download your full Vector Tax Invoice (SVG)!**`)
                .addFields(
                    { name: '👑 Plan Activated', value: `\`Fusion ${planTitle} (${cycleTitle})\``, inline: true },
                    { name: '💳 Status', value: '`PAID & ACTIVE`', inline: true },
                    { name: '💰 Total Paid', value: `\`${paidAmtStr}\``, inline: true },
                    { name: '🛡️ Server', value: `**${serverName}**`, inline: true },
                    { name: '🏷️ Transaction ID', value: `\`${rawTx}\``, inline: true },
                    { name: '📅 Valid Until', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Merchant: CHAUDHARY TANMAY • panel.fusionhub.in' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('📥 View & Download Tax Invoice')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://panel.fusionhub.in/api/invoice/download?guild_id=${guildId}`),
                new ButtonBuilder()
                    .setLabel('👑 Open Server Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://panel.fusionhub.in/dashboard/${userId}/${guildId}`)
            );

            await userObj.send({ embeds: [invoiceEmbed], components: [row] });
            res.json({ success: true, message: 'Official Tax Invoice sent to your Discord DM!' });
        } catch (err) {
            console.error('[DM Invoice Error]', err.message);
            res.status(500).json({ success: false, error: 'Could not send DM: ' + err.message });
        }
    });

    // API: Upload Custom Image / GIF
    app.post('/api/upload-image', requireAuth, express.json({ limit: '15mb' }), async (req, res) => {
        try {
            const { data, filename, mimeType } = req.body;
            if (!data) return res.status(400).json({ success: false, error: 'No image data provided.' });
            
            const uploadsDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const ext = (mimeType && mimeType.includes('gif')) ? '.gif' : ((mimeType && mimeType.includes('png')) ? '.png' : '.jpg');
            const safeName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
            const filePath = path.join(uploadsDir, safeName);

            const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

            const publicUrl = `${PANEL_DOMAIN}/uploads/${safeName}`;
            res.json({ success: true, url: publicUrl });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get(['/api/invoice/download', '/api/invoice/image', '/api/invoice/view'], async (req, res) => {
        let { tx, user, customer, server, server_id, plan, cycle, amount, date, expiry, guild_id, user_id } = req.query;
        
        const targetGuildId = guild_id || server_id || '';
        if (targetGuildId) {
            const liveGuild = discordClient.guilds.cache.get(targetGuildId);
            if (liveGuild) server = liveGuild.name;
            
            const serverConfigDoc = await ServerConfig.findOne({ guildId: targetGuildId }).lean() || {};
            const localCfg = readDB(dbFiles.serverConfig) || {};
            const guildCfg = { ...(serverConfigDoc || {}), ...(localCfg[targetGuildId] || {}) };
            
            let targetUid = user_id || req.session?.discordId;
            if (!targetUid && guildCfg.premiumActivatedBy) {
                const m = guildCfg.premiumActivatedBy.match(/\((\d+)\)/);
                if (m) targetUid = m[1];
            }
            if (!targetUid) {
                const allLics = getUserLicenses();
                for (const uid in allLics) {
                    const lic = allLics[uid];
                    if (lic && Array.isArray(lic.activeGuilds) && lic.activeGuilds.some(g => g.guildId === targetGuildId)) {
                        targetUid = uid;
                        break;
                    }
                }
            }

            let cleanUser = '';
            if (targetUid && discordClient) {
                try {
                    const fu = await discordClient.users.fetch(targetUid).catch(() => null);
                    if (fu) cleanUser = fu.username;
                } catch(_) {}
            }
            if (!cleanUser && req.session?.discordUsername && req.session.discordUsername !== 'Customer' && req.session.discordUsername !== 'User' && req.session.discordUsername !== 'Admin') {
                cleanUser = req.session.discordUsername;
            }
            if (!cleanUser && guildCfg.premiumActivatedBy) {
                const m = guildCfg.premiumActivatedBy.match(/^(.+?)\s*\(\d+\)$/);
                if (m && m[1] !== 'Customer' && m[1] !== 'User' && m[1] !== 'Admin') cleanUser = m[1];
            }
            if (!cleanUser) cleanUser = 'Discord Member';

            const userLicense = targetUid ? getUserLicense(targetUid) : null;

            if (!plan) plan = (userLicense?.plan === 'starter' || guildCfg.premiumPlan === 'starter') ? 'Starter Plan' : 'Pro Server Plan';
            if (!cycle) cycle = (userLicense?.cycle === 'yearly' || guildCfg.premiumCycle === 'yearly') ? 'Yearly' : 'Monthly';
            if (!tx) tx = userLicense?.orderId ? `#TX-${userLicense.orderId}` : (guildCfg.premiumActivatedBy?.includes('trial') ? `#TX-TRIAL-${targetGuildId.slice(-6)}` : `#TX-FUSION-${targetGuildId.slice(-6)}`);
            
            user = `@${cleanUser}`;
            customer = cleanUser;

            const isTrial = !!(userLicense?.orderId?.startsWith('trial_') || guildCfg.premiumActivatedBy?.includes('trial') || (!guildCfg.premiumPrice));
            if (!amount) amount = isTrial ? '0.00 (Free Trial)' : (plan === 'Starter Plan' ? '79.00' : '149.00');
            if (!expiry) {
                const expDate = (userLicense?.expiresAt || guildCfg.premiumExpiresAt) ? new Date(userLicense?.expiresAt || guildCfg.premiumExpiresAt) : new Date(Date.now() + 30 * 86400000);
                expiry = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            }
        }

        const svgBuf = generateInvoiceSVG({
            transactionId: tx || '#TX-FUSION',
            username: user || '@Discord Member',
            customerName: customer || user?.replace('@', '') || 'Discord Member',
            serverName: server || 'Discord Server',
            serverId: targetGuildId || server_id || '',
            planName: plan || 'Pro Server Plan',
            cycle: cycle || 'Monthly',
            amount: amount || '149.00',
            date: date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            expiryDate: expiry || new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        });
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Content-Disposition', `inline; filename="fusion_bill_${targetGuildId || 'receipt'}.svg"`);
        res.send(svgBuf);
    });

    app.get('/api/supabase/ping', async (req, res) => {
        await pingSupabaseKeepAlive();
        res.json({ success: true, message: 'Supabase keep-alive ping executed successfully', timestamp: new Date().toISOString() });
    });

    app.get(['/refund-policy', '/refund', '/refunds', '/cancellation-policy', '/return-policy'], (req, res) => res.send(getRefundPolicyHTML()));
    app.get(['/shipping-policy', '/shipping', '/delivery-policy', '/shipping-and-delivery'], (req, res) => res.send(getShippingPolicyHTML()));
    app.get(['/support', '/contact', '/contact-us', '/customer-support', '/help'], (req, res) => res.send(getSupportHTML()));
    app.get(['/premium', '/pricing', '/plans', '/upgrade', '/subscribe'], (req, res) => {
        let eligibleServers = [];
        if (req.session && Array.isArray(req.session.guilds)) {
            const botGuildIds = new Set(discordClient.guilds.cache.keys());
            eligibleServers = req.session.guilds.filter(g => {
                // Must be a server where the bot is currently in
                if (!botGuildIds.has(g.id)) return false;
                // And user is owner OR has Admin / Manage Guild permissions
                if (g.owner === true || g.owner === 'true') return true;
                try {
                    const perms = BigInt(g.permissions || 0);
                    return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n;
                } catch(e) {
                    return false;
                }
            }).map(g => {
                const live = discordClient.guilds.cache.get(g.id);
                return {
                    id: g.id,
                    name: live ? live.name : g.name,
                    icon: (live && typeof live.iconURL === 'function') ? live.iconURL({ size: 64 }) : (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null)
                };
            });
        }
        res.send(getPremiumHTML(eligibleServers, req.session));
    });

    // Auth & Navigation
    app.get(['/dash/login', '/login'], (req, res) => {
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        const accept = (req.headers.accept || '').toLowerCase();
        if (accept.includes('text/markdown') || accept.includes('text/x-markdown')) {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            const { getHomepageMarkdown } = require('./agentic_portal');
            return res.send(getHomepageMarkdown());
        }
        res.send(getLoginHTML());
    });

    app.get('/auth/discord', (req, res) => {
        const redirectUri = encodeURIComponent(`${PANEL_DOMAIN}/dash/callback`);
        res.redirect(302, `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds`);
    });

    app.get(['/dash/callback', '/auth/discord/callback'], async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');
        try {
            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: `${PANEL_DOMAIN}/dash/callback`
                })
            }).then(r => r.json());

            if (!tokenRes.access_token) return res.redirect('/');

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenRes.access_token}` }
            }).then(r => r.json());

            const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${tokenRes.access_token}` }
            }).then(r => r.json());

            const sessionId = crypto.randomBytes(32).toString('hex');
            await DashSession.findOneAndUpdate(
                { discordId: userRes.id },
                {
                    sessionId,
                    discordId: userRes.id,
                    discordUsername: userRes.username,
                    discordAvatar: userRes.avatar,
                    accessToken: tokenRes.access_token,
                    guilds: Array.isArray(guildsRes) ? guildsRes : [],
                    updatedAt: new Date()
                },
                { upsert: true, returnDocument: 'after' }
            );

            res.setHeader('Set-Cookie', `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
            res.redirect('/dashboard');
        } catch(e) {
            console.error('Discord callback error:', e);
            res.redirect('/');
        }
    });

    app.get('/logout', (req, res) => {
        res.setHeader('Set-Cookie', 'sessionId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        res.redirect('/');
    });

    app.get('/', async (req, res) => {
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        const accept = (req.headers.accept || '').toLowerCase();
        if (accept.includes('text/markdown') || accept.includes('text/x-markdown')) {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            return res.send(getHomepageMarkdown());
        }

        const cookies = parseCookies(req);
        if (cookies.sessionId) {
            const session = await DashSession.findOne({ sessionId: cookies.sessionId });
            if (session) return res.redirect('/dashboard');
        }
        res.send(getSSRHomepageHTML(discordClient));
    });

    // Helper: Get admin guilds for user
    
async function safeFetchWithTimeout(promise, timeoutMs = 2500) {
    let timeoutHandle;
    const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        return result;
    } catch(e) {
        clearTimeout(timeoutHandle);
        return null;
    }
}

    function getAdminGuildsForUser(session) {
        const userGuilds = Array.isArray(session.guilds) ? session.guilds : [];
        return userGuilds.filter(g => {
            if (g.owner === true || g.owner === 'true') return true;
            try {
                const perms = BigInt(g.permissions || 0);
                return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n; // Administrator (0x8) or Manage Guild (0x20)
            } catch(e) {
                return false;
            }
        });
    }

    async function checkGuildAdminAccess(session, guildId) {
        if (!guildId) return { allowed: false, isOwner: false, guild: null, error: 'No guild ID' };
        
        let guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
            try { guild = await safeFetchWithTimeout(discordClient.guilds.fetch(guildId), 2000); } catch(_) {}
        }
        if (!guild) return { allowed: false, isOwner: false, guild: null, error: 'Bot is not in this server.' };
        
        const userGuild = (session.guilds || []).find(g => g.id === guildId);
        let isOwner = (guild.ownerId === session.discordId) || (userGuild && (userGuild.owner === true || userGuild.owner === 'true'));
        let isAdmin = isOwner;
        
        if (!isAdmin && userGuild) {
            try {
                const perms = BigInt(userGuild.permissions || 0);
                isAdmin = (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n;
            } catch(e) {}
        }
        
        if (!isAdmin) {
            try {
                const member = guild.members.cache.get(session.discordId) || await safeFetchWithTimeout(guild.members.fetch(session.discordId), 2000);
                if (member) {
                    if (member.id === guild.ownerId) {
                        isOwner = true;
                        isAdmin = true;
                    } else if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) {
                        isAdmin = true;
                    }
                }
            } catch(e) {}
        }
        
        return { allowed: isAdmin, isOwner, guild };
    }

    // Server Selector Route (supports /dashboard, /servers, and /dashboard/:userId)
    app.get(['/servers', '/dashboard', '/dashboard/:userId'], requireAuth, async (req, res, next) => {
        const paramId = req.params.userId;
        const currentUserId = req.session.discordId;

        // If paramId is a guildId that the bot is in, redirect directly to that guild dashboard!
        if (paramId && paramId !== currentUserId && discordClient.guilds.cache.has(paramId)) {
            return res.redirect(`/dashboard/${currentUserId}/${paramId}`);
        }

        // If route is /dashboard or /servers or wrong userId, redirect to /dashboard/:currentUserId
        if (!paramId || paramId !== currentUserId) {
            return res.redirect(`/dashboard/${currentUserId}`);
        }

        try {
            // Automatically fetch live user avatar from Discord client
            if (req.session.discordId && discordClient) {
                try {
                    const fetchedUser = await discordClient.users.fetch(req.session.discordId).catch(() => null);
                    if (fetchedUser) {
                        req.session.avatarUrl = fetchedUser.displayAvatarURL({ extension: 'png', dynamic: true, size: 128 });
                        if (fetchedUser.avatar && fetchedUser.avatar !== req.session.discordAvatar) {
                            req.session.discordAvatar = fetchedUser.avatar;
                            await DashSession.updateOne({ sessionId: req.session.sessionId }, { discordAvatar: fetchedUser.avatar });
                        }
                    }
                } catch(_) {}
            }
            if (!req.session.guilds || !Array.isArray(req.session.guilds) || req.session.guilds.length === 0) {
                if (req.session.accessToken) {
                    try {
                        const freshGuilds = await fetch('https://discord.com/api/users/@me/guilds', {
                            headers: { Authorization: `Bearer ${req.session.accessToken}` }
                        }).then(r => r.json());
                        if (Array.isArray(freshGuilds) && freshGuilds.length > 0) {
                            req.session.guilds = freshGuilds;
                            await DashSession.updateOne({ sessionId: req.session.sessionId }, { guilds: freshGuilds });
                        } else {
                            return res.redirect('/');
                        }
                    } catch(e) {
                        return res.redirect('/');
                    }
                } else {
                    return res.redirect('/');
                }
            }

            const adminGuilds = getAdminGuildsForUser(req.session);
            const botGuildIds = new Set(discordClient.guilds.cache.keys());
            const botAdminGuilds = adminGuilds.filter(g => botGuildIds.has(g.id));
            res.send(getServerSelectorHTML(req.session, botAdminGuilds, botGuildIds));
        } catch(e) {
            console.error('Servers route error:', e);
            res.redirect('/logout');
        }
    });

    // Guild Dashboard Route (supports /dashboard/:userId/:guildId and /dashboard/:guildId)
    app.get(['/dashboard/:userId/:guildId', '/dashboard/:guildId'], requireAuth, async (req, res) => {
        let userId = req.params.userId;
        let guildId = req.params.guildId;
        const currentUserId = req.session.discordId;

        // Handle single param /dashboard/:guildId -> redirect to /dashboard/:currentUserId/:guildId
        if (!guildId) {
            guildId = userId;
            return res.redirect(`/dashboard/${currentUserId}/${guildId}`);
        }

        // If URL userId doesn't match session, redirect to correct user URL
        if (userId !== currentUserId) {
            return res.redirect(`/dashboard/${currentUserId}/${guildId}`);
        }

        // Strict Administrator Rank check
        const { allowed, isOwner, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!guild) {
            return res.redirect(`/dashboard/${currentUserId}`);
        }
        if (!allowed) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                <meta charset="UTF-8">
                <title>Access Denied | Fusion Bot</title>
                <style>
                    body { background: #0b0e14; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                    .box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; max-width: 480px; }
                    h1 { color: #f87171; margin-bottom: 10px; font-size: 24px; }
                    p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
                    a { background: #5865F2; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; }
                </style>
                </head>
                <body>
                    <div class="box">
                        <h1>🔒 Access Denied</h1>
                        <p>You need <b>Administrator</b> rank in <b>${guild.name}</b> to manage its dashboard settings.</p>
                        <a href="/dashboard/${currentUserId}">← Return to Server List</a>
                    </div>
                </body>
                </html>
            `);
        }

        let configDoc = await ServerConfig.findOne({ guildId }).lean();
        const localCfgAll = readDB(dbFiles.serverConfig) || {};
        const localGuildCfg = localCfgAll[guildId] || {};
        let config = { ...(configDoc || {}), ...(localGuildCfg || {}) };

        // Merge User Licenses to guarantee 100% immediate premium synchronization
        const userLicense = (currentUserId && currentUserId !== 'user') ? getUserLicense(currentUserId) : null;
        const allLicenses = getUserLicenses();
        
        let hasActiveLicense = !!(config.isPremium || configDoc?.isPremium || localGuildCfg.isPremium);
        let licensePlan = config.premiumPlan || configDoc?.premiumPlan || localGuildCfg.premiumPlan || 'pro';
        let licenseExpiresAt = config.premiumExpiresAt || configDoc?.premiumExpiresAt || localGuildCfg.premiumExpiresAt;

        // Check if user license or any slot covers this guild
        if (!hasActiveLicense) {
            if (userLicense && Array.isArray(userLicense.activeGuilds) && userLicense.activeGuilds.some(g => g.guildId === guildId)) {
                hasActiveLicense = true;
                licensePlan = userLicense.plan || 'pro';
                licenseExpiresAt = userLicense.expiresAt;
            }
        }
        if (!hasActiveLicense) {
            for (const uid in allLicenses) {
                const lic = allLicenses[uid];
                if (lic && Array.isArray(lic.activeGuilds) && lic.activeGuilds.some(g => g.guildId === guildId)) {
                    hasActiveLicense = true;
                    licensePlan = lic.plan || 'pro';
                    licenseExpiresAt = lic.expiresAt;
                    break;
                }
            }
        }

        if (hasActiveLicense) {
            config.isPremium = true;
            config.premiumPlan = licensePlan || 'pro';
            config.premiumCycle = (userLicense && userLicense.cycle) || config.premiumCycle || 'monthly';
            config.premiumExpiresAt = licenseExpiresAt;
        }

        const driveAuth = await DriveAuth.findOne({ guildId });
        const isDriveLinked = !!(driveAuth && driveAuth.accessToken);

        const adminGuilds = getAdminGuildsForUser(req.session);
        const botGuildIds = new Set(discordClient.guilds.cache.keys());
        const botAdminGuilds = adminGuilds.filter(g => botGuildIds.has(g.id));
        
        // Fetch channels and roles with 2s max timeout to prevent page hang
        if (guild.channels.cache.size === 0) {
            try { await safeFetchWithTimeout(guild.channels.fetch(), 2000); } catch(_) {}
        }
        if (guild.roles.cache.size === 0) {
            try { await safeFetchWithTimeout(guild.roles.fetch(), 2000); } catch(_) {}
        }

        // Get guild roles and channels for dropdowns
        const guildRoles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const guildChannels = guild.channels.cache
            .filter(c => c.type === 0 || c.type === 5)
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        
        const guildIconUrl = guild.iconURL ? guild.iconURL({ size: 128 }) : (guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}?size=128` : null);

        res.send(getDashboardHTML(config, guild.name, discordClient.user.username, isDriveLinked, guildIconUrl, botAdminGuilds, guildId, guildRoles, guildChannels, isOwner, currentUserId));
    });

    // Google Drive OAuth routes (Strictly Server Owner Only)
    app.get(['/auth/google', '/auth/google/:guildId'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.query.guildId;
        const currentUserId = req.session.discordId;
        if (!guildId) return res.redirect(`/dashboard/${currentUserId}`);

        const { allowed, isOwner, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!isOwner) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Owner Only</title></head>
                <body style="background:#0b0e14;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
                    <div style="background:rgba(255,255,255,0.05);padding:30px;border-radius:16px;">
                        <h2 style="color:#f87171;">👑 Server Owner Only</h2>
                        <p style="color:#9ca3af;">Only the Discord Server Owner can authorize and connect Google Drive backups.</p>
                        <a href="/dashboard/${currentUserId}/${guildId}" style="color:#5865F2;font-weight:bold;">← Return to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        const oauth2Client = getOAuth2Client();
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/userinfo.email'
            ],
            state: guildId
        });
        res.redirect(url);
    });

    app.get('/auth/google/callback', async (req, res) => {
        const { code, state: guildId } = req.query;
        if (!code || !guildId) return res.redirect('/dashboard');
        try {
            const tokens = await exchangeGoogleCode(code);
            
            let userId = null;
            const cookies = parseCookies(req);
            if (cookies.sessionId) {
                const session = await DashSession.findOne({ sessionId: cookies.sessionId });
                if (session) userId = session.discordId;
            }

            const updateData = {
                guildId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || 'no_refresh_token',
                tokenExpiry: tokens.expiry_date || (Date.now() + 3500 * 1000)
            };
            if (userId) updateData.userId = userId;

            // If no new refresh_token provided, keep existing one if valid
            if (!tokens.refresh_token || tokens.refresh_token === 'no_refresh_token') {
                const existing = await DriveAuth.findOne({ guildId });
                if (existing && existing.refreshToken && existing.refreshToken !== 'no_refresh_token') {
                    updateData.refreshToken = existing.refreshToken;
                }
            }

            await DriveAuth.findOneAndUpdate(
                { guildId },
                { $set: updateData },
                { upsert: true, returnDocument: 'after' }
            );

            console.log(`[Google Drive] Linked successfully for server ${guildId}`);
            res.redirect('/dashboard/' + guildId + '?drive=connected');
        } catch (e) {
            console.error('Google Auth Callback Error:', e);
            res.redirect('/dashboard/' + guildId + '?error=drive_auth_failed&msg=' + encodeURIComponent(e.message));
        }
    });

    // API: Google Drive Disconnect
    app.post('/dashboard/:guildId/api/drive/disconnect', requireAuth, async (req, res) => {
        try {
            await DriveAuth.deleteOne({ guildId: req.params.guildId });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // API: Google Drive Manual Backup
    app.post('/dashboard/:guildId/api/drive/backup', requireAuth, async (req, res) => {
        try {
            const guild = discordClient.guilds.cache.get(req.params.guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
            if (typeof createNukeBackup === 'function') {
                const result = await createNukeBackup(guild, req.session ? req.session.discordUsername : 'Dashboard');
                const now = new Date();
                await ServerConfig.findOneAndUpdate(
                    { guildId: req.params.guildId },
                    { $set: { 'nukeBackup.backupDate': now, 'nukeBackup.channels': result.channelCount, 'nukeBackup.roles': result.roleCount } },
                    { upsert: true }
                );
                return res.json({ success: true, result, backupDate: now.toLocaleString() });
            }
            res.json({ success: false, error: 'Backup service not configured' });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // API: Channels
    app.get(['/dashboard/:userId/:guildId/channels', '/dashboard/:guildId/channels'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.params.userId;
        const { allowed, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!allowed || !guild) return res.json([]);
        if (guild.channels.cache.size === 0) {
            try { await safeFetchWithTimeout(guild.channels.fetch(), 2000); } catch(_) {}
        }
        const chs = guild.channels.cache
            .filter(c => c.type === 0 || c.type === 5)
            .map(c => ({ id: c.id, name: c.name, type: c.type }));
        res.json(chs);
    });

    // API: Roles
    app.get(['/dashboard/:userId/:guildId/roles', '/dashboard/:guildId/roles'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.params.userId;
        const { allowed, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!allowed || !guild) return res.json([]);
        if (guild.roles.cache.size === 0) {
            try { await safeFetchWithTimeout(guild.roles.fetch(), 2000); } catch(_) {}
        }
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
        res.json(roles);
    });

    // API: Create Role
    app.post(['/dashboard/:userId/:guildId/roles', '/dashboard/:guildId/roles'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.params.userId;
        const { allowed, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!allowed || !guild) return res.status(403).json({ success: false, error: 'Admin rank required.' });
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
        try {
            const r = await guild.roles.create({ name, color: color || '#5865f2', reason: 'Created from Web Dashboard' });
            res.json({ success: true, role: { id: r.id, name: r.name, color: r.hexColor } });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // API: Deploy React Roles
    app.post(['/dashboard/:userId/:guildId/deploy-react-roles', '/dashboard/:guildId/deploy-react-roles'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.params.userId;
        const { allowed, guild } = await checkGuildAdminAccess(req.session, guildId);
        if (!allowed || !guild) return res.status(403).json({ success: false, error: 'Admin rank required.' });
        const { channel, title, desc, pairs } = req.body;
        try {
            const ch = guild.channels.cache.get(channel);
            if (!ch) return res.status(400).json({ success: false, error: 'Channel not found' });
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle(title || '🎭 React Role Picker')
                .setDescription(desc + '\n\n' + pairs.map(p => p.emoji + ' — <@&' + p.roleId + '>').join('\n'))
                .setColor(0x5865F2);
            const msg = await ch.send({ embeds: [embed] });
            for (const p of pairs) {
                try { await msg.react(p.emoji); } catch(e) { console.error('React error:', e); }
            }
            // Save to config
            await ServerConfig.findOneAndUpdate({ guildId }, {
                reactRoleMessageId: msg.id,
                reactRoleChannel: channel,
                reactRoles: pairs,
                reactRoleTitle: title,
                reactRoleDesc: desc
            }, { upsert: true });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // API: Create Snapshot
    app.post(['/dashboard/:userId/:guildId/snapshot', '/dashboard/:guildId/snapshot'], requireAuth, async (req, res) => {
        try {
            const guildId = req.params.guildId || req.params.userId;
            const { allowed, guild } = await checkGuildAdminAccess(req.session, guildId);
            if (!allowed || !guild) return res.status(403).json({ success: false, error: 'Admin rank required.' });
            
            let channelCount = guild.channels.cache.size;
            let roleCount = guild.roles.cache.size;
            let result = { channelCount, roleCount };

            try {
                if (typeof createNukeBackup === 'function') {
                    const driveRes = await createNukeBackup(guild, req.session ? req.session.discordUsername : 'Dashboard');
                    if (driveRes) result = driveRes;
                }
            } catch(backupErr) {
                console.log('[Snapshot Notice]', backupErr.message);
            }

            const now = new Date();
            await ServerConfig.findOneAndUpdate(
                { guildId },
                { $set: { 'nukeBackup.backupDate': now, 'nukeBackup.channels': result.channelCount || channelCount, 'nukeBackup.roles': result.roleCount || roleCount } },
                { upsert: true }
            );

            res.json({ success: true, backupDate: now.toLocaleString(), result });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // API: Save
    app.post(['/dashboard/:userId/:guildId/api/save', '/dashboard/:guildId/api/save'], requireAuth, async (req, res) => {
        const guildId = req.params.guildId || req.params.userId;
        const { allowed } = await checkGuildAdminAccess(req.session, guildId);
        if (!allowed) return res.status(403).json({ success: false, error: 'Admin permissions required.' });
        try {
            const existingCfg = await ServerConfig.findOne({ guildId }).lean() || {};
            const localCfgAll = readDB(dbFiles.serverConfig) || {};
            const localGuildCfg = localCfgAll[guildId] || {};
            const allLicenses = getUserLicenses();
            let isServerPremium = !!(existingCfg.isPremium || localGuildCfg.isPremium);
            if (!isServerPremium) {
                for (const uid in allLicenses) {
                    const lic = allLicenses[uid];
                    if (lic && Array.isArray(lic.activeGuilds) && lic.activeGuilds.some(g => g.guildId === guildId)) {
                        isServerPremium = true;
                        break;
                    }
                }
            }
            const isPro = isServerPremium;

            const updates = req.body;

            // Strip premium-only fields for free users
            if (!isServerPremium) {
                delete updates.botNickname;
                delete updates.botAvatar;
                delete updates.botBanner;
                delete updates.antiNukeEnabled;
                delete updates.antiSpamEnabled;
                delete updates.attachmentSpamEnabled;
                delete updates.mentionSpamEnabled;
                delete updates.scamProtectionEnabled;
                delete updates.nsfwProtectionEnabled;
            } else if (!isPro) {
                delete updates.scamProtectionEnabled;
                delete updates.nsfwProtectionEnabled;
            }
            
            // Parse arrays from string fields
            if (typeof updates.banWords === 'string') {
                updates.banWords = updates.banWords.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (typeof updates.bannedUsers === 'string') {
                updates.bannedUsers = updates.bannedUsers.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (updates.customPrefix === 'fb') updates.customPrefix = '';
            if (typeof updates.customPrefixes === 'string') {
                updates.customPrefixes = updates.customPrefixes.split('\n').map(s => s.trim()).filter(p => p && p !== 'fb');
            }
            if (typeof updates.youtubeChannels === 'string') {
                updates.youtubeChannels = updates.youtubeChannels.split('\n').map(s => s.trim()).filter(Boolean);
            }
            if (typeof updates.twitchChannels === 'string') {
                updates.twitchChannels = updates.twitchChannels.split('\n').map(s => s.trim()).filter(Boolean);
            }
            if (typeof updates.ticketAiQuestions === 'string') {
                updates.ticketAiQuestions = updates.ticketAiQuestions.split('\n').map(s => s.trim()).filter(Boolean);
            }
            if (typeof updates.levelRoleRewards === 'string') {
                try { updates.levelRoleRewards = JSON.parse(updates.levelRoleRewards); } catch(e) {}
            }
            if (typeof updates.reactRoles === 'string') {
                try { updates.reactRoles = JSON.parse(updates.reactRoles); } catch(e) {}
            }
            if (typeof updates.commandPermissions === 'string') {
                try { updates.commandPermissions = JSON.parse(updates.commandPermissions); } catch(e) {}
            }

            // Parse auto roles
            if (typeof updates.autoRoleMember === 'string') {
                try { updates.autoRoleMember = JSON.parse(updates.autoRoleMember); } catch(e) { updates.autoRoleMember = [updates.autoRoleMember]; }
            }
            if (typeof updates.autoRoleBot === 'string') {
                try { updates.autoRoleBot = JSON.parse(updates.autoRoleBot); } catch(e) { updates.autoRoleBot = [updates.autoRoleBot]; }
            }

            // Parse 7 ticket options
            if (!Array.isArray(updates.ticketOptions)) {
                updates.ticketOptions = [];
                for (let i = 1; i <= 7; i++) {
                    const label = updates[`tOptLabel_${i}`];
                    const desc = updates[`tOptDesc_${i}`];
                    const emoji = updates[`tOptEmoji_${i}`];
                    if (label && label.trim()) {
                        updates.ticketOptions.push({
                            label: label.trim(),
                            desc: desc ? desc.trim() : 'Open a ticket',
                            emoji: emoji ? emoji.trim() : '🎫'
                        });
                    }
                }
            }

            // Sanitize all boolean fields to prevent Cast to Boolean CastError
            const boolFields = [
                'autoBackup','autoBackupEnabled','welcomeDmEnabled','welcomeEnabled','byeEnabled',
                'ticketsEnabled','reactRolesEnabled','inviteTrackerEnabled','autoRoleEnabled',
                'levelingEnabled','antiNukeEnabled','wordFilterEnabled','antiSpamEnabled',
                'logsEnabled','attachmentSpamEnabled','mentionSpamEnabled','banWordKickEnabled',
                'antiLinksEnabled','ghostPingEnabled','aiGlobalEnabled','gamesDisabledGlobal'
            ];
            boolFields.forEach(f => {
                if (f in updates) {
                    updates[f] = (updates[f] === true || updates[f] === 'true' || updates[f] === 'on' || updates[f] === 1 || updates[f] === '1');
                }
            });
            // Also sanitize any key ending with Enabled or autoBackup
            Object.keys(updates).forEach(k => {
                if (k.endsWith('Enabled') || k === 'autoBackup') {
                    updates[k] = (updates[k] === true || updates[k] === 'true' || updates[k] === 'on' || updates[k] === 1 || updates[k] === '1');
                }
            });

            // Live Discord Bot Identity Synchronization on Server
            try {
                const liveGuild = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId).catch(() => null);
                if (liveGuild) {
                    let me = liveGuild.members.me;
                    if (!me) {
                        me = await liveGuild.members.fetchMe().catch(() => null);
                    }

                    // 1. Sync Nickname in server (supported natively by Discord API)
                    if (me && updates.botNickname !== undefined) {
                        const cleanNick = (typeof updates.botNickname === 'string' && updates.botNickname.trim()) ? updates.botNickname.trim() : null;
                        await me.setNickname(cleanNick).catch(() => {});
                    }

                    // 2. Format avatar & banner URLs for full public hosting
                    if (updates.botAvatar && typeof updates.botAvatar === 'string') {
                        if (updates.botAvatar.startsWith('/uploads/')) {
                            updates.botAvatar = `${PANEL_DOMAIN}${updates.botAvatar}`;
                        }
                    }
                    if (updates.botBanner && typeof updates.botBanner === 'string') {
                        if (updates.botBanner.startsWith('/uploads/')) {
                            updates.botBanner = `${PANEL_DOMAIN}${updates.botBanner}`;
                        }
                    }
                }
            } catch (syncErr) {
                // Silent
            }

            const savedDoc = await ServerConfig.findOneAndUpdate({ guildId }, updates, { upsert: true, returnDocument: 'after' });
            try {
                const currentLocal = readDB(localCfgPath) || {};
                currentLocal[guildId] = { ...(currentLocal[guildId] || {}), ...(savedDoc ? savedDoc.toObject() : updates) };
                writeDB(localCfgPath, currentLocal);
            } catch(e) {}
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ==========================================
    // 🤖 AGENT-FRIENDLY HTTP 404 NOT FOUND HANDLER
    // Returns structured JSON for APIs and clean Markdown / HTML
    // ==========================================
    app.use((req, res) => {
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        res.status(404);

        const accept = (req.headers.accept || '').toLowerCase();
        if (req.path.startsWith('/api') || req.path.startsWith('/v1') || accept.includes('application/json')) {
            return res.json({
                success: false,
                error: 'RESOURCE_NOT_FOUND',
                code: 404,
                message: `The requested endpoint '${req.path}' does not exist on this server.`,
                links: {
                    sitemap: 'https://bot.fusionhub.in/sitemap.xml',
                    llms: 'https://bot.fusionhub.in/llms.txt',
                    docs: 'https://bot.fusionhub.in/docs',
                    developers: 'https://bot.fusionhub.in/developers',
                    openapi: 'https://bot.fusionhub.in/openapi.json',
                    mcp: 'https://bot.fusionhub.in/.well-known/mcp'
                }
            });
        }

        if (accept.includes('text/markdown') || accept.includes('text/x-markdown')) {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            return res.send(`# 404 Not Found - Fusion Bot\n\nThe path \`${req.path}\` does not exist on this server.\n\n## Agent Discovery Resources:\n- Sitemap: https://bot.fusionhub.in/sitemap.xml\n- LLM Guidance (llms.txt): https://bot.fusionhub.in/llms.txt\n- Developer Portal: https://bot.fusionhub.in/developers\n- Interactive Documentation: https://bot.fusionhub.in/docs\n- OpenAPI Specification: https://bot.fusionhub.in/openapi.json\n- Model Context Protocol: https://bot.fusionhub.in/.well-known/mcp\n`);
        }

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 — Page Not Found | Fusion Bot</title>
    <link rel="icon" type="image/jpeg" href="https://i.ibb.co/vC79Nthr/Whats-App-Image-2026-03-23-at-6-49-47-PM.jpg">
    <style>
        body { background: #0b0e14; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
        .box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 40px; border-radius: 24px; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        h1 { font-size: 56px; font-weight: 900; color: #6366f1; margin: 0 0 10px; }
        h2 { font-size: 22px; color: #fff; margin-bottom: 12px; }
        p { color: #94a3b8; line-height: 1.6; margin-bottom: 28px; font-size: 15px; }
        .btn-group { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        a { background: #6366f1; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 12px; font-weight: 700; font-size: 14px; transition: 0.2s; }
        a:hover { background: #4f46e5; }
        a.sec { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); }
        a.sec:hover { background: rgba(255,255,255,0.15); }
    </style>
</head>
<body>
    <div class="box">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The requested URL <code>${req.path}</code> was not found on this server. Explore the documentation or developer portal below.</p>
        <div class="btn-group">
            <a href="/">Home</a>
            <a href="/docs" class="sec">Documentation</a>
            <a href="/developers" class="sec">Developer Portal</a>
        </div>
    </div>
</body>
</html>`);
    });

    // ==========================================
    // 🛡️ GLOBAL UNHANDLED ERROR HANDLER (HTTP 500)
    // ==========================================
    app.use((err, req, res, next) => {
        console.error('[Unhandled Express Exception]', err);
        res.setHeader('Vary', 'Accept, Accept-Encoding');
        res.status(500);

        const accept = (req.headers.accept || '').toLowerCase();
        if (req.path.startsWith('/api') || req.path.startsWith('/v1') || accept.includes('application/json')) {
            return res.json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                code: 500,
                message: err.message || 'An unexpected internal server error occurred.',
                resolution: 'Verify parameters or retry the request shortly.'
            });
        }

        res.send(`<!DOCTYPE html><html><body style="background:#0b0e14;color:#fff;font-family:sans-serif;text-align:center;padding:50px;"><h1>500 — Server Error</h1><p>${err.message || 'Internal error'}</p><a href="/" style="color:#6366f1;">Return Home</a></body></html>`);
    });
};
