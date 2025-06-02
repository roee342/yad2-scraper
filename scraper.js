const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');

const getYad2Response = async (url) => {
    const requestOptions = {
        method: 'GET',
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    };
    try {
        const res = await fetch(url, requestOptions);
        return await res.text();
    } catch (err) {
        console.log(err);
    }
};

const scrapeListings = async (url) => {
    const html = await getYad2Response(url);
    if (!html) throw new Error("No HTML from Yad2");

    const $ = cheerio.load(html);
    const pageTitle = $("title").first().text();
    if (pageTitle.includes("ShieldSquare")) throw new Error("Captcha / bot detection");

    const listings = [];

    $(".feeditem").each((_, el) => {
        const $el = $(el);
        const imgSrc = $el.find(".feed_image img").attr("src") || null;
        const title = $el.find(".title").text().trim() || null;
        const price = $el.find(".price").text().trim() || null;
        const location = $el.find(".subtitle").text().trim() || null;

        if (title && price && location) {
            const id = `${title} | ${location} | ${price}`;
            listings.push({ id, title, price, location, imgSrc });
        }
    });

    return listings;
};

const checkForNewItems = (topic, listings) => {
    const dirPath = './data';
    const filePath = `${dirPath}/${topic}.json`;

    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');

    const savedItems = JSON.parse(fs.readFileSync(filePath));
    const savedIds = new Set(savedItems.map(item => item.id));
    const newItems = listings.filter(item => !savedIds.has(item.id));

    if (newItems.length > 0) {
        const updated = [...savedItems, ...newItems];
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
        await telenode.sendTextMessage(`🔍 מתחיל סריקה עבור "${topic}"\n${url}`, chatId);
        const listings = await scrapeListings(url);
        const newItems = checkForNewItems(topic, listings);

        if (newItems.length > 0) {
            for (const item of newItems) {
                let message = `🆕 מודעה חדשה:\n\n🏷️ ${item.title}\n💰 ${item.price}\n📍 ${item.location}`;
                if (item.imgSrc) {
                    await telenode.sendPhoto(item.imgSrc, chatId, message);
                } else {
                    await telenode.sendTextMessage(message, chatId);
                }
            }
        } else {
            await telenode.sendTextMessage("😴 אין מודעות חדשות כרגע", chatId);
        }
    } catch (e) {
        const errorMsg = `❌ שגיאה:\n${e.message || e}`;
        await telenode.sendTextMessage(errorMsg, chatId);
        throw e;
    }
};

const program = async () => {
    const activeProjects = config.projects.filter(p => !p.disabled);
    await Promise.all(activeProjects.map(project => scrape(project.topic, project.url)));
};

program();
