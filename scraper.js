const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');

const getYad2Response = async (url) => {
    try {
        const res = await fetch(url);
        return await res.text();
    } catch (err) {
        console.log("Request error:", err);
        return null;
    }
};

const scrapeItems = async (url) => {
    const html = await getYad2Response(url);
    if (!html) throw new Error("Could not get Yad2 response");

    const $ = cheerio.load(html);
    const titleText = $("title").text();
    if (titleText === "ShieldSquare Captcha") throw new Error("Bot detection");

    const items = [];
    $('.feeditem').each((_, elem) => {
        const pic = $(elem).find('.pic img').attr('src');
        const title = $(elem).find('.title').text().trim();
        const price = $(elem).find('.price').text().trim();
        const location = $(elem).find('.subtitle').text().trim();
        const itemId = $(elem).attr('id');

        if (pic && itemId) {
            items.push({
                id: itemId,
                img: pic,
                title,
                price,
                location
            });
        }
    });
    return items;
};

const checkForNewItems = async (items, topic) => {
    const filePath = `./data/${topic}.json`;
    let seenIds = [];

    try {
        seenIds = JSON.parse(fs.readFileSync(filePath));
    } catch (e) {
        if (e.code === 'ENOENT') {
            fs.mkdirSync('data', { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify([]));
        } else {
            console.error(e);
            throw new Error("Could not read or write file");
        }
    }

    const newItems = items.filter(item => !seenIds.includes(item.id));
    if (newItems.length > 0) {
        const updated = [...new Set([...seenIds, ...newItems.map(i => i.id)])];
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
        fs.writeFileSync("push_me", "");
    }
    return newItems;
};

const scrape = async (topic, url) => {
    const apiToken = process.env.API_TOKEN || config.telegramApiToken;
    const chatId = process.env.CHAT_ID || config.chatId;
    const telenode = new Telenode({ apiToken });

    try {
        const items = await scrapeItems(url);
        const newItems = await checkForNewItems(items, topic);

        if (newItems.length > 0) {
            for (const item of newItems) {
                const message = `🏠 ${item.title || 'No title'}\n📍 ${item.location || 'Unknown'}\n💰 ${item.price || 'No price'}\n🖼️ ${item.img}`;
                await telenode.sendTextMessage(message, chatId);
            }
        }
    } catch (e) {
        const errMsg = e?.message || String(e);
        await telenode.sendTextMessage(`Scan failed: ${errMsg}`, chatId);
        throw e;
    }
};

const program = async () => {
    await Promise.all(
        config.projects
            .filter(project => !project.disabled)
            .map(project => scrape(project.topic, project.url))
    );
};

program();
