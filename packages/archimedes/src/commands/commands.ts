import child_process from "child_process";
import { Message, MessageEmbedOptions } from "discord.js";
import { calcSvt, CalcVals, ChainCalcVals, EnemyCalcVals, cmdArgs, getNps, init } from "fgo-calc";
import fs from "fs";
import { IncomingMessage } from "http";
import https from "https";
import { JSDOM } from "jsdom";
import { create, all } from "mathjs";
import fetch from "node-fetch";
import os from "os";

import { ApiConnector, Entity, Language, Region } from "@atlasacademy/api-connector";

import { emoji, nicknames } from "../assets/assets";
import { getCardEmbeds, getChainEmbeds, getEnemyEmbeds } from "../helpers/embeds";
import { getEntities, getSvt, init as svtInit } from "../helpers/svt";

const math = create(all, {});
const NAApiConnector = new ApiConnector({ host: "https://api.atlasacademy.io", region: Region.NA, language: Language.ENGLISH });

const entityTypeDescriptions = new Map<string, string>([
    ["all", "all"],
    ["combineMaterial", "Exp Card"],
    ["commandCode", "Command Code"],
    ["enemy", "Enemy"],
    ["enemyCollection", "Enemy Servant"],
    ["enemyCollectionDetail", "Boss"],
    ["heroine", "Servant (Mash)"],
    ["normal", "Servant"],
    ["servantEquip", "Craft Essence"],
    ["statusUp", "Fou Card"],
    ["svtEquipMaterial", "svtEquipMaterial"],
    ["svtMaterialTd", "NP Enhancement Material"],
    ["mysticCode", "Mystic Code"],
    ["war", "War"],
    ["event", "Event"],
]);

const botCommandsMap = new Map<string, string>()
    .set("test (t)", "Calculate servant/enemy cards")
    .set("help (h)", "Help for !test")
    .set("getnames (g, names)", "Get nicknames for a servant")
    .set("getnps (list, l, nps)", "List servant NPs")
    .set("math(m)/calculate(calc, c)/evaluate(eval, e)", "Evaluate mathematical expression")
    .set("db (d, aa)", "Search aa-db for entity, for instance to get the ID /C.No. to calc with")
    .set("wikia (w)", "Search F/GO wikia using google")
    .set("google (bing, search, s)", "Search query with bing")
    .set("junao", "Own/Borrowed junao+waver|merlin calc")
    .set("commands", "Haha recursion");

const resourceCommandsMap = new Map<string, string>()
    .set("lookup", "Look up where to farm a material (references the dropsheets)")
    .set("looping", "Looping guide")
    .set("refunddemo", 'Refund "guide"')
    .set("ce", "CE Encyclopedia")
    .set("upgrades", "Upcoming STR and ludes")
    .set("dropsheet", "Lists the top 5 farming nodes for non-event mats (based on drop rate as well as AP/drop)")
    .set("drops", "Slightly cooler and less mobile-friendly version of the dropsheet")
    .set("submissions", "Site to submit your drop results of free quests for the dropsheet")
    .set("interludes (ludes)", "Lists the materials gained from interludes and rank up quests")
    .set("npdmg", "NP damage table for NA")
    .set("npdmgjp", "NP damage table for JP")
    .set("buffcaps", "View the possiblerange of different (de)buffs")
    .set("chargers", "Lists of NP batteries on servants")
    .set("appends", "List of servants with append s3 against class advantage")
    .set("cost", "List of cost for servants and CEs")
    .set("bond", "Bond farming spreadsheet")
    .set("sos", "Account recovery guide (NA)")
    .set("sosjp", "Account recovery guide (JP)")
    .set("fgodoc", "Atlas Academy write-up explaining some hidden nuances of the game")
    .set("fprates", "Domus Aurea sheet sourced from community data on FP gacha rates")
    .set("reset (reset*, reset na, reset jp, resetna, resetjp)", "Short list of typical server reset times");

const forecastResourcesCommandsMap = new Map<string, string>()
    .set("compendium", "Spreadsheet containing various information regarding future events")
    .set("forecast", "Upcoming event materials")
    .set(
        "papermoon (limited, limiteds)",
        "Spreadsheet containing lists of limited items (grails, gfous, bgrails, etc), material tickets, and event farming drop data"
    )
    .set("banners", "NA's list of upcoming banners by servant")
    .set("efficiency", "List of upcoming AP reduction campaigns")
    .set("nerofest (nf3, gnf, nf21, nf23)", "Comp video archive for Grand Nero Festival 2021 lottery event")
    .set("karnamas (xmas6)", "Comp video archive for Christmas 6 lottery event");

const beginnerResourcesCommandsMap = new Map<string, string>()
    .set("beginners (beginner)", "Beginner's guide to FGO")
    .set("starters", "Recommended servants to raise for beginners")
    .set(
        "hong (solo, solos, soloes)",
        "Video playlists of friend soloing main story + Guide on cheesing hard quests with support servants + Hong's f2p farming playlist"
    )
    .set("ticket", "Recommended servants to pick from the NA 17M DL campaign SSR ticket")
    .set("lottery (lotto)", "Explanation on lottery events")
    .set("rp", "Guide on what to buy from rp shop")
    .set("howtosave", "How to save SQ & Tickets (if you didn't already know)")
    .set("blueprism", "Explanation on blue prisms (free limited-time revive mat)")
    .set("leyline", "Explanation on blue prisms (free limited-time revive mat)")
    .set("glossary", "Explanations of community terms and abbreviations");

const emojiArgMap = new Map<string, ReturnType<typeof emoji>>()
    .set("arts", emoji("arts"))
    .set("buster", emoji("buster"))
    .set("quick", emoji("quick"))
    .set("extra", emoji("extra"))
    .set("artsfirst", emoji("artsfirst"))
    .set("quickfirst", emoji("quickfirst"))
    .set("busterfirst", emoji("busterfirst"))
    .set("atkmod", emoji("atk_up"))
    .set("defmod", emoji("def_down"))
    .set("cardmod", emoji("avatar"))
    .set("artsmod", emoji("arts_up"))
    .set("bustermod", emoji("buster_up"))
    .set("quickmod", emoji("quick_up"))
    .set("extramod", emoji("sp_atk_up"))
    .set("artsresdown", emoji("arts_resist_down"))
    .set("busterresdown", emoji("buster_resist_down"))
    .set("quickresdown", emoji("quick_resist_down"))
    .set("npmod", emoji("np_dmg_up"))
    .set("nppower", emoji("buffrate"))
    .set("powermod", emoji("sp_atk_up"))
    .set("critdamagemod", emoji("crit_dmg_up"))
    .set("critical", emoji("crit_rate_up"))
    .set("flatdamage", emoji("sp_atk_up"))
    .set("supereffectivemod", emoji("sp_atk_up"))
    .set("specialattackmod", emoji("specdmg"))
    .set("specialdefensemod", emoji("spec_def_up"))
    .set("npgain", emoji("np_gain_up"))
    .set("flatrefund", emoji("np_turn"))
    .set("stargen", emoji("star_gen_up"))
    .set("flatstars", emoji("stars_turn"))
    .set("hitcountoverride", emoji("hits"))
    .set("hitmultiplier", emoji("hits"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commands = new Map<string, (args: string, message: Message) => any>();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const links: { [key: string]: string } = require("../assets/links.json");

for (const [key, value] of Object.entries(links)) {
    commands.set(key, () => value);
}

function link(args: string, message: Message) {
    if (!process.env.AUTH_USERS?.includes(message.author.id)) return;
    // eslint-disable-next-line prefer-const
    let [linkName, link] = args.split(" ");

    if (link.startsWith("<")) link = link.slice(1);
    if (link.endsWith(">")) link = link.slice(0, link.length - 1);

    links[linkName.toLowerCase()] = "<" + link + ">";

    fs.writeFileSync(`${__dirname}/../../src/assets/links.json`, JSON.stringify(links, null, 2));
    fs.writeFileSync(`${__dirname}/../assets/links.json`, JSON.stringify(links, null, 2));

    console.info(`Linked ${linkName.toLowerCase()} to <${link}>.`);

    return { embeds: [{ description: `Linked ${linkName.toLowerCase()} to ${link}.` }] };
}

function unlink(linkName: string, message: Message) {
    if (!process.env.AUTH_USERS?.includes(message.author.id)) return;
    // eslint-disable-next-line prefer-const
    delete links[linkName];

    fs.writeFileSync(`${__dirname}/../../src/assets/links.json`, JSON.stringify(links, null, 2));
    fs.writeFileSync(`${__dirname}/../assets/links.json`, JSON.stringify(links, null, 2));

    console.info(`Unlinked ${linkName.toLowerCase()}.`);

    return { embeds: [{ description: `Unlinked ${linkName.toLowerCase()}.` }] };
}

function getNames(servant: string) {
    let title = `No matches found for ${servant}!`,
        description = "";

    if (+servant === +servant) {
        if (nicknames[servant] && nicknames[servant].length > 0) {
            title = `Nicknames for Servant #${servant}:`;
            description = nicknames[servant].join("\n");
        }
    } else {
        const id = Object.keys(nicknames).find((id) => nicknames?.[id]?.includes(servant)) ?? -1;
        const names = nicknames?.[id] ?? "";

        if (names) {
            title = `Nicknames for ${servant} (ID #${id}):`;
            description = names.join("\n");
        }
    }

    return {
        embeds: [
            {
                title,
                description,
            },
        ],
        name: "getnames",
    };
}

async function addName(str: string, message: Message) {
    if (process.env.AUTH_USERS?.includes(message.author.id)) {
        const [id, ...nicknameWords] = str.split(/\s+/);

        const nickname = nicknameWords.join("");

        if (!nickname) {
            return "Illegal nickname!";
        }

        if (+id === +id) {
            // If id is a number

            if (!(id in nicknames)) {
                nicknames[id] = [];
            }

            if (!nicknames[id].includes(nickname)) {
                nicknames[id].push(nickname);
                fs.writeFileSync(`${__dirname}/../../src/assets/nicknames.json`, JSON.stringify(nicknames, null, 2));
                console.info(`Set ${id}: ${nickname}`);
                return `Set ${id}: ${nickname}`;
            } else {
                return `[${id}: "${nickname}"] already exists!`;
            }
        } else {
            // If id is a string, check it's an existing nickname
            const cNo = Object.keys(nicknames).find((cNo) => nicknames?.[cNo]?.includes(id)) ?? 0;

            // If cNo is 0, then id is not a nickname
            if (cNo == 0) {
                return "Invalid ID!";
            }

            if (!nicknames[cNo].includes(nickname)) {
                nicknames[cNo].push(nickname);
                fs.writeFileSync(`${__dirname}/../../src/assets/nicknames.json`, JSON.stringify(nicknames, null, 2));
                console.info(`Set ${cNo}: ${nickname}`);
                return `Set ${cNo}: ${nickname}`;
            } else {
                return `[${id}: "${nickname}"] already exists!`;
            }
        }
    }
}

async function removeName(str: string, message: Message) {
    if (process.env.AUTH_USERS?.includes(message.author.id)) {
        const [id, ...nicknameWords] = str.split(/\s+/);

        const nickname = nicknameWords.join("");

        if (!nickname) {
            return "Illegal nickname!";
        }

        if (+id === +id) {
            // If id is a number

            if (!(id in nicknames)) {
                return "ID not found!";
            }

            // ID exists in nickname map

            if (!nicknames[id].includes(nickname)) {
                return `Nickname "${nickname}" does not exist for ${id}!`;
            } else {
                nicknames[id].splice(nicknames[id].indexOf(nickname), 1);
                fs.writeFileSync(`${__dirname}/../../src/assets/nicknames.json`, JSON.stringify(nicknames, null, 2));
                console.info(`Removed "${nickname}" from ${id}`);
                return `Removed "${nickname}" from ${id}`;
            }
        } else {
            // If id is a string, check it's an existing nickname
            /** The key in the cNo-nickname[] map, can be collectionNo or ID */
            const cNo = Object.keys(nicknames).find((cNo) => nicknames?.[cNo]?.includes(id)) ?? 0;

            // If cNo is 0, then id is not a nickname
            if (cNo == 0) {
                return "Invalid ID!";
            }

            if (!nicknames[id].includes(nickname)) {
                return `Set ${nickname} does not exist for ${id}!`;
            } else {
                nicknames[id].splice(nicknames[id].indexOf(nickname), 1);
                fs.writeFileSync(`${__dirname}/../../src/assets/nicknames.json`, JSON.stringify(nicknames, null, 2));
                console.info(`Removed "${nickname}" from ${id}`);
                return `Removed "${nickname}" from ${id}`;
            }
        }
    }
}

async function test(args: string) {
    const svtName = args.split(" ")[0],
        argStr = args.split(" ").slice(1).join(" ");

    if (svtName === undefined) {
        return { content: "haha :WoahWheeze:" };
    }

    const { svt, NAServant } = await getSvt(svtName);

    if (svt.id === 200100) {
        // Fix NP order for Emiya: Buster, Buster (luded), Arts, Arts(luded)
        svt.noblePhantasms = [svt.noblePhantasms[0], svt.noblePhantasms[1], svt.noblePhantasms[3], svt.noblePhantasms[2]];
    }

    init(NAServant ? (await NAApiConnector.servant(svt.id)).noblePhantasms : []);

    const resultFields = calcSvt(svt, argStr);

    switch (resultFields.type) {
        case "card":
            return getCardEmbeds(resultFields.vals as CalcVals);
        case "chain":
            return getChainEmbeds(resultFields.vals as ChainCalcVals);
        case "enemy":
            return getEnemyEmbeds(resultFields.vals as EnemyCalcVals);
    }
}

async function help(args: string, message: Message) {
    args = args.trim().toLowerCase();

    let cmds = cmdArgs().filter((arg) => arg.name === args);

    cmds = cmds.length ? cmds : cmdArgs();

    if (!args && !args.trim()) {
        const parts = cmds.reduce((acc, curr) => {
            if (!acc[curr.type]) {
                acc[curr.type] = [];
            }

            const emoji = emojiArgMap.get(curr.name.toLowerCase());

            if (["artsmod", "bustermod", "quickmod"].includes(curr.name.toLowerCase())) {
                curr.description = emoji
                    ? `${emoji}/${emojiArgMap.get(curr.name.toLowerCase().split("mod")[0] + "resdown")} ${curr.description}`
                    : curr.description;
            } else {
                curr.description = emoji ? `${emoji} ${curr.description}` : curr.description;
            }

            acc[curr.type].push(curr);

            return acc;
        }, {} as { [key: string]: typeof cmds });

        const embedMessage = await message.channel.send({
            embeds: [
                {
                    title: "__Arguments List__",
                    description: [...parts["General"], ...parts["Command cards"]].reduce(
                        (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
                        ""
                    ),
                },
            ],
            components: [
                {
                    type: 1,
                    components: [
                        { type: 2, label: "General", style: 2, customId: "general" },
                        { type: 2, label: "Shorthands", style: 2, customId: "shorthands" },
                        { type: 2, label: "Command Card Buffs", style: 2, customId: "cardArgs" },
                        { type: 2, label: "Non-offensive Buffs", style: 2, customId: "nonDmgArgs" },
                        { type: 2, label: "Aux", style: 2, customId: "auxMisc" },
                    ],
                },
            ],
        });

        const collector = embedMessage.createMessageComponentCollector({
            filter: function filter(i) {
                if (i.user.id !== message.author.id) {
                    i.reply({ content: "Please enter the command yourself to interact with it.", ephemeral: true });
                    return false;
                }
                return true;
            },
            time: 300000,
        });

        collector.on("collect", async (interaction) => {
            let description = [...parts["General"], ...parts["Command cards"]].reduce(
                (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
                ""
            );

            switch (interaction.customId) {
                case "shorthands":
                    description = parts["Shorthands"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                    break;
                case "cardArgs":
                    description = parts["Command card buffs"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                    break;
                case "nonDmgArgs":
                    description = parts["Non-offensive buffs"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                    break;
                case "auxMisc":
                    description = [...parts["Aux"], ...parts["Misc"]].reduce(
                        (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
                        ""
                    );
                    break;
            }

            await interaction.update({ embeds: [{ title: "__Arguments List__", description }] });
        });
    } else {
        const matchedCommand = cmds.find((cmd) => args === cmd.name.trim().toLowerCase() || cmd.aliases.includes(args));

        let description = "",
            title = undefined;

        if (matchedCommand) {
            title = `__**${matchedCommand.name}**__`;

            const emoji = emojiArgMap.get(matchedCommand.name.toLowerCase());

            let emojiToUse = emoji;

            if (["artsmod", "bustermod", "quickmod"].includes(matchedCommand.name.toLowerCase())) {
                emojiToUse += "/" + emojiArgMap.get(matchedCommand.name.toLowerCase().split("mod")[0] + "resdown") ?? "";
            }

            description = (emojiToUse ? `${emojiToUse} ` : "") + matchedCommand.description.replaceAll("\n", "\n>");
        } else {
            title = undefined;
            description = `**${args}** not found!`;
        }

        await message.channel.send({
            embeds: [
                {
                    title,
                    description,
                },
            ],
        });
    }
}

async function reload(_: string, message: Message) {
    console.info("Updating jsons...");

    if (message?.author?.id === process.env.MASTER_USER || message === undefined) {
        const gitFetch = child_process.spawn("git", ["fetch"]);

        gitFetch.on("close", () => {
            const gitStatus = child_process.spawn("git", ["status", "-sb"]);

            let status = "";

            gitStatus.stdout.setEncoding("utf8");
            gitStatus.stdout.on("data", (data) => (status += data));

            gitStatus.on("close", () => {
                if (status.includes("behind")) {
                    let output = "```git checkout origin/main -- packages/archimedes/src/assets/nicknames.json```";

                    const gitCheckout = child_process.spawn("git", [
                        "checkout",
                        "origin/main",
                        "--",
                        "packages/archimedes/src/assets/nicknames.json",
                    ]);

                    gitCheckout.stdout.setEncoding("utf8");
                    gitCheckout.stdout.on("data", (data) => (output += data));

                    gitCheckout.on("close", () => {
                        const jsons = child_process.spawn("npm", ["run", "jsons"]);

                        output += "```npm run jsons```";

                        jsons.stdout.setEncoding("utf-8");
                        jsons.stdout.on("data", (data) => (output += data));

                        jsons.on("close", () => {
                            fs.unlink(`${__dirname}/../assets/api-info.json`, (err) => {
                                svtInit().then(() => {
                                    if (err) {
                                        return message
                                            ? () =>
                                                  message.channel.send({
                                                      embeds: [
                                                          {
                                                              title: "__Update complete__",
                                                              description:
                                                                  output + "**Could not delete `api-info.json`** [Reinitialising...]",
                                                              color: 0x00fff0,
                                                          },
                                                      ],
                                                  })
                                            : console.error(err);
                                    }

                                    message
                                        ? message.channel.send({
                                              embeds: [
                                                  {
                                                      title: "__Update complete__",
                                                      description: output + "**`api-info.json` deleted** [Reinitialising...]",
                                                      color: 0x00ff00,
                                                  },
                                              ],
                                          })
                                        : console.info("api-info.json deleted, reinitialising...");
                                });
                            });
                        });
                    });
                } else if (status.includes("ahead")) {
                    return svtInit().then(() =>
                        message?.channel?.send({
                            embeds: [
                                {
                                    description: "ERR: Local ahead of remote! [Reinitialising...]",
                                    color: 0xff0000,
                                },
                            ],
                        })
                    );
                } else {
                    return svtInit().then(() =>
                        message
                            ? message.channel.send({
                                  embeds: [
                                      {
                                          description: "Already up to date [Reinitialising...]",
                                          color: 0x00f0ff,
                                      },
                                  ],
                              })
                            : void 0
                    );
                }
            });
        });
    }
}

async function update(_: string, message: Message) {
    console.info("Updating source...");

    if (message?.author?.id === process.env.MASTER_USER || message === undefined) {
        const gitFetch = child_process.spawn("git", ["fetch"]);

        gitFetch.on("close", () => {
            const gitStatus = child_process.spawn("git", ["status", "-sb"]);

            let status = "";

            gitStatus.stdout.setEncoding("utf8");
            gitStatus.stdout.on("data", (data) => (status += data));

            gitStatus.on("close", () => {
                if (status.includes("behind")) {
                    let output = "```git pull```";

                    const gitPull = child_process.spawn("git", ["pull"]);

                    gitPull.stdout.setEncoding("utf8");
                    gitPull.stdout.on("data", (data) => (output += data));

                    gitPull.on("close", () => {
                        child_process.spawn("npm", ["ci"]).on("close", () => {
                            const build = child_process.spawn("npm", ["run", "build"]);

                            output += "```npm ci OK``````npm run build```";

                            build.stdout.setEncoding("utf-8");
                            build.stdout.on("data", (data) => (output += data));

                            build.on("close", () => {
                                fs.unlink(`${__dirname}/../assets/api-info.json`, (err) => {
                                    if (err) {
                                        return message
                                            ? () =>
                                                  message.channel
                                                      .send({
                                                          embeds: [
                                                              {
                                                                  title: "__Update complete__",
                                                                  description:
                                                                      output + "```" + err + "```**Could not delete `api-info.json`**",
                                                                  color: 0x00fff0,
                                                              },
                                                          ],
                                                      })
                                                      .then(() => exitForCleanReload("", message))
                                            : (console.error(err), process.exit(6));
                                    }

                                    message
                                        ? message.channel
                                              .send({
                                                  embeds: [
                                                      {
                                                          title: "__Update complete__",
                                                          description: output + "**`api-info.json` deleted**",
                                                          color: 0x00ff00,
                                                      },
                                                  ],
                                              })
                                              .then(() => exitForCleanReload("", message))
                                        : process.exit(0);
                                });
                            });
                        });
                    });
                } else if (status.includes("ahead")) {
                    message?.channel?.send({
                        embeds: [
                            {
                                description: "ERR: Local ahead of remote!",
                                color: 0xff0000,
                            },
                        ],
                    });
                } else {
                    message
                        ? message.channel.send({
                              embeds: [
                                  {
                                      description: "Already up to date!",
                                      color: 0x00f0ff,
                                  },
                              ],
                          })
                        : void 0;
                }
            });
        });
    }
}

async function updateLinksAndNicknames(_: string, message: Message) {
    console.info("Pushing nicknames and links...");

    let output = "```";

    const update = child_process.spawn("./scripts/update", { cwd: os.homedir() });

    update.stdout.setEncoding("utf8");
    update.stdout.on("data", (data) => (output += data));
    update.stderr.on("data", (data) => (output += data));

    update
        .on("close", () => {
            message
                ? message.channel
                      .send({
                          embeds: [
                              {
                                  title: "```Push jsons```",
                                  description: output + "```\n**Links & nicknames pushed**",
                                  color: 0xa0a0a0,
                              },
                          ],
                      })
                      .then(() => exitForCleanReload("", message))
                : process.exit(0);
        })
        .on("error", (error) => {
            message
                ? message.channel
                      .send({
                          embeds: [
                              {
                                  title: "```Push jsons```",
                                  description: output + error + "```\n**Could not push nicknames & links!**",
                                  color: 0xff2e2e,
                              },
                          ],
                      })
                      .then(() => exitForCleanReload("", message))
                : process.exit(0);
        });
}

async function exitForCleanReload(_: string, message: Message) {
    if (message.author.id === process.env.MASTER_USER) {
        const embeds: MessageEmbedOptions[] = [];

        console.info("Queueing exit...");

        fs.unlink(`${__dirname}/../assets/api-info.json`, (err) => {
            if (err) {
                embeds.push({
                    description: "Could not delete `api-info.json`. Copying jsons...",
                    color: 0x00fff0,
                });

                return;
            }

            embeds.push({
                description: "`api-info.json` deleted. Copying jsons...",
                color: 0x00f0ff,
            });

            const jsons = child_process.spawn("npm", ["run", "jsons"]);
            let jsonsOutput = "";

            jsons.stdout.setEncoding("utf8");
            jsons.stdout.on("data", (data) => (jsonsOutput += data));

            jsons
                .on("close", () => {
                    embeds.push({
                        description: jsonsOutput + "\n...Dying successfully.",
                        color: 0xa0a0a0,
                    });

                    message ? message.channel.send({ embeds }).then(() => process.exit(0)) : process.exit(0);
                })
                .on("error", (err) => {
                    embeds.push({
                        description: jsonsOutput + `\`\`\`${err}\`\`\`` + "\n...Died anyway.",
                        color: 0x00fff0,
                    });

                    message ? message.channel.send({ embeds }).then(() => process.exit(0)) : process.exit(0);
                });
        });
    } else {
        // if (process.env.NO_PREFIX_CHANNEL.split(" ").includes(message.channel.id)) {
        message.channel.send("<:MHXNaruhodo:823669571630006312>");
        // }
    }
}

async function listNPs(args: string) {
    const { svt } = await getSvt(args.split(" ")[0]);

    if (svt.id === 200100) {
        // Fix NP order for Emiya: Buster, Buster (luded), Arts, Arts(luded)
        svt.noblePhantasms = [svt.noblePhantasms[0], svt.noblePhantasms[1], svt.noblePhantasms[3], svt.noblePhantasms[2]];
    }

    const NPs = getNps(svt);

    return {
        embeds: [
            {
                title: `NPs for ${svt.name}`,
                description:
                    NPs.reduce((str, NP, snp) => {
                        return NP.npMultis.length
                            ? (str += `${emoji(NP.card.toLowerCase())} \`snp${snp}\`:\n${NP.npMultis.reduce(
                                  (str, multi, index) => (str += `**NP${index + 1}**: *${multi.slice(0, -2) + multi[multi.length - 1]}*\n`),
                                  ""
                              )}\n`)
                            : "";
                    }, "").trim() || "No NPs found.",
            },
        ],
    };
}

function wikiaSearch(searchURL: string, resultSelector: string, wikiBaseUrl: string) {
    let document: Document;

    return new Promise<string>((resolve) => {
        https.get(searchURL, function (res: IncomingMessage) {
            let data = "";

            res.on("data", function (chunk: string) {
                data += chunk;
            });

            res.on("end", () => {
                document = new JSDOM(data, { pretendToBeVisual: true }).window.document;

                const resultAnchorElement = document.querySelector(resultSelector) as HTMLAnchorElement;

                let reply = "";

                try {
                    reply = "<" + wikiBaseUrl + decodeURI(decodeURI(resultAnchorElement.href.split(wikiBaseUrl)[1].split("&")[0])) + ">";
                } catch (err) {
                    reply = `Error finding result for <${searchURL}>: ${(err as DOMException).message}`;
                    console.error(reply);
                } finally {
                    resolve(reply);
                }
            });
        });
    });
}

async function wikia(search: string) {
    const googleBaseURL = "https://www.google.com/search?q=site%3Afategrandorder.fandom.com+",
        bingBaseURL = "https://www.bing.com/search?q=site%3Afategrandorder.fandom.com+",
        fandomBaseURL = "https://fategrandorder.fandom.com/wiki/Special:Search?query=",
        ddgBaseURL = "https://duckduckgo.com/?q=site%3Afategrandorder.fandom.com+",
        searchQuery = encodeURIComponent(search),
        googleSearchURL = googleBaseURL + searchQuery,
        bingSearchURL = bingBaseURL + searchQuery,
        fandomSearchURL = fandomBaseURL + searchQuery,
        ddgSearchURL = ddgBaseURL + searchQuery,
        searchResultSelector = 'a[href*="https://fategrandorder.fandom.com/wiki/"]',
        fandomSearchResultSelector = "li.unified-search__result:nth-child(1) > article:nth-child(1) > h3:nth-child(1) > a:nth-child(1)",
        wikiBaseUrl = "https://fategrandorder.fandom.com/wiki/";

    let reply = "";

    if (process.env.USE_SEARCH === "TRUE") {
        reply = await wikiaSearch(ddgSearchURL, searchResultSelector, wikiBaseUrl);

        // Likely got rate limited by DDG
        if (reply.includes("Cannot read properties of null")) {
            reply = await wikiaSearch(bingSearchURL, searchResultSelector, wikiBaseUrl);
        }

        // Likely got rate limited by Bing
        if (reply.includes("Cannot read properties of null")) {
            reply = await wikiaSearch(googleSearchURL, searchResultSelector, wikiBaseUrl);
        }
    }

    // Likely got rate limited by Google
    if (!reply.length || reply.includes("Cannot read properties of null")) {
        reply = await wikiaSearch(fandomSearchURL, fandomSearchResultSelector, wikiBaseUrl);
    }

    return reply;
}

// `https://stackoverflow.com/a/71633648`
function setEnvValue(key: string, value: string) {
    // read file from hdd & split if from a linebreak to a array
    const ENV_VARS = fs.readFileSync(`${__dirname}/../../.env`, "utf8").split("\n");

    // find the env we want based on the key
    const target = ENV_VARS.indexOf(
        ENV_VARS.find((line) => {
            // (?<!#\s*)   Negative lookbehind to avoid matching comments (lines that starts with #).
            //             There is a double slash in the RegExp constructor to escape it.
            // (?==)       Positive lookahead to check if there is an equal sign right after the key.
            //             This is to prevent matching keys prefixed with the key of the env var to update.
            const keyValRegex = new RegExp(`(?<!#\\s*)${key}(?==)`);

            return line.match(keyValRegex);
        }) ?? ""
    );

    // if key-value pair exists in the .env file,
    if (target !== -1) {
        // replace the key/value with the new value
        ENV_VARS.splice(target, 1, `${key}=${value}`);
    } else {
        // if it doesn't exist, add it instead
        ENV_VARS.push(`${key}=${value}`);
    }

    // Updfate the key/value in current instance of process as well
    process.env[key] = value;

    // Log the change
    console.info(`Set process.env.${key} = ${value} and updated the same in ../../.env`);

    // write everything back to the file system
    fs.writeFileSync(`${__dirname}/../../.env`, ENV_VARS.join("\n"));
}

async function setUseSearchEnv(newVal: string, message: Message) {
    if (message.author.id !== process.env.MASTER_USER) return;

    console.info(`[setUseSearchEnv] Got newVal ${newVal}`);

    newVal = newVal.toLowerCase() === "true" ? "'TRUE'" : "'FALSE'";

    let reply = "",
        colour = "#ff0070";

    try {
        setEnvValue("USE_SEARCH", newVal);
        reply = `Set \`USE_SEARCH=${newVal}\`!`;
        colour = "#00ff70";
    } catch (err) {
        reply = `Could not set \`USE_SEARCH\`: ${(err as Error).message}!`;
    }

    console.info(`[setUseSearchEnv] ${reply}`);

    return { embeds: [{ description: reply, color: colour }] };
}

async function db(search: string, message: Message) {
    const entities = getEntities(search);
    const colour = message.member?.displayHexColor ?? message.author.hexAccentColor ?? "#7070EE";

    // Filter out any non-servant if a servant with the same collectionNo is already present
    const filteredEntities = entities.filter((entity, entityNo, self) => {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isEntityServant = (svt: any) =>
            [
                Entity.EntityType.ENEMY,
                Entity.EntityType.ENEMY_COLLECTION,
                Entity.EntityType.ENEMY_COLLECTION_DETAIL,
                Entity.EntityType.HEROINE,
                Entity.EntityType.NORMAL,
            ].includes(svt.type);

        const isServantCollectionNoPresent = !!(
            entity.collectionNo === self.find((e) => e.collectionNo === entity.collectionNo && isEntityServant(e))?.collectionNo
        );

        if (!isEntityServant(entity)) {
            return !isServantCollectionNoPresent; // If a servant with the same C.No. is not present then include the entity
        }

        // If entity is a servant, include it
        return true;
    });

    const URLs = filteredEntities.map((entity, entityNo) => {
        const text = `(${entity.collectionNo === 0 ? entity.id : entity.collectionNo}) ${
            "className" in entity ? emoji(entity.className.toLowerCase()) : ""
        }**[${entity.name.replace("\n", " ")}]`;

        switch (entity.type as string) {
            case "normal":
            case "heroine":
                return entity.collectionNo === 0
                    ? `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/enemy/${entity.id})** (${entityTypeDescriptions.get(
                          entity.type
                      )})`
                    : `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/servant/${
                          entity.collectionNo
                      })** (${entityTypeDescriptions.get(entity.type)})`;
            case "servantEquip":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/craft-essence/${
                    entity.collectionNo
                })** (${entityTypeDescriptions.get(entity.type)})`;
            case "enemy":
            case "enemyCollection":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/enemy/${entity.id})** (${entityTypeDescriptions.get(
                    entity.type
                )})`;
            case "enemyCollectionDetail":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/servant/${
                    entity.id
                })** (${entityTypeDescriptions.get(entity.type)})`;
            case "commandCode":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/command-code/${
                    entity.id
                })** (${entityTypeDescriptions.get(entity.type)})`;
            case "mysticCode":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/mystic-code/${
                    entity.id
                })** (${entityTypeDescriptions.get(entity.type)})`;
            case "war":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/war/${entity.id})** (${entityTypeDescriptions.get(
                    entity.type
                )})`;
            case "event":
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/event/${entity.id})** (${entityTypeDescriptions.get(
                    entity.type
                )})`;
            default:
                return `**${entityNo + 1}.** ${text}(https://apps.atlasacademy.io/db/JP/enemy/${entity.id})** (${entityTypeDescriptions.get(
                    entity.type
                )})`;
        }
    });

    return { embeds: [{ title: `Search results for query \`${search}\``, description: URLs.join("\n"), color: colour }] };
}

function lolwiki(search: string) {
    let document: Document;

    return new Promise((resolve) => {
        https.get(
            "https://www.google.com/search?q=site%3Aleagueoflegends.fandom.com/+" + search.replace(/ /g, "+"),
            function (res: IncomingMessage) {
                let data = "";

                res.on("data", function (chunk: string) {
                    data += chunk;
                });

                res.on("end", () => {
                    document = new JSDOM(data, { pretendToBeVisual: true }).window.document;

                    let reply = "";

                    try {
                        reply =
                            "<" +
                            decodeURI(
                                decodeURI(
                                    (
                                        document.querySelector(
                                            'a[href^="/url?q=https://leagueoflegends.fandom.com/wiki/"]'
                                        ) as HTMLAnchorElement
                                    ).href
                                        .slice(7)
                                        .split("&")[0]
                                )
                            ) +
                            ">";
                        resolve(reply);
                    } catch (err) {
                        resolve(
                            "Error finding result for <https://www.google.com/search?q=site%3Aleagueoflegends.fandom.com/+" +
                                search.replace(/ /g, "+") +
                                ">"
                        );
                    }
                });
            }
        );
    });
}

function bing(search: string) {
    let document: Document;

    return new Promise((resolve) => {
        https.get("https://www.bing.com/search?q=" + search.replace(/ /g, "+"), function (res: IncomingMessage) {
            let data = "";

            res.on("data", function (chunk: string) {
                data += chunk;
            });

            res.on("end", () => {
                ({ document } = new JSDOM(data, { pretendToBeVisual: true }).window);

                let reply = "";

                try {
                    reply =
                        "<" +
                        decodeURI(decodeURI((document.querySelector('main[aria-label="Search Results"] h2 a') as HTMLAnchorElement).href)) +
                        ">";
                    resolve(reply);
                } catch (err) {
                    resolve("Error finding result for <https://www.bing.com/search?q=" + search.replace(/ /g, "+") + ">");
                }
            });
        });
    });
}

async function hans(_: string, message: Message) {
    /* let allowed = true;

    if (message.guild != null) {
        if (message.guild.id === "274980577545945090") {
            message.react("555856908318146624");
            allowed = false;
        }
    }

    if (allowed) { */
    const ratposts = [
        "https://i.imgur.com/0wz7M12.png",
        "https://i.imgur.com/yQU3tGl.png",
        "https://i.imgur.com/Jta9zDt.png",
        "https://i.imgur.com/pLoYQOG.png",
        "https://i.imgur.com/lHiodn0.png",
        "https://i.imgur.com/0UCCquN.png",
    ] as const;

    const hans = Math.floor(Math.random() * Math.floor(1000));

    if (hans % 10 === 0) message.channel.send(ratposts[Math.floor(Math.random() * ratposts.length)]);
    else if (hans % 9 === 0)
        message.channel.send("https://docs.google.com/document/d/1-It8GetTxQgW8SvDt2gQtLpEaCx22LBqmxm9j2V9qm0 <@77024766145343488>");
    else if (hans % 2 === 0) message.channel.send("https://i.imgur.com/705VDSf.mp4");
    else message.channel.send("https://i.imgur.com/Kq0ODuV.gif");
    // }
}

async function calc(expr: string) {
    return math.evaluate(expr.replace(",", "")) + "";
}

async function apkLinkEmbed(_: string, message: Message) {
    const embedMessage = await message.channel.send({
        embeds: [
            {
                title: "Latest FGO APKs",
                description: "Fetching...",
                thumbnail: {
                    url: "https://github.com/boyonthebeach2k/archimedes-fgo/blob/main/packages/archimedes/src/assets/loading-mangekyou.gif?raw=true",
                },
            },
        ],
    });

    const packages = [
        { region: "JP", packageId: "com.aniplex.fategrandorder" },
        { region: "NA", packageId: "com.aniplex.fategrandorder.en" },
        { region: "KR", packageId: "com.netmarble.fgok" },
        { region: "TW", packageId: "com.xiaomeng.fategrandorder" },
    ] as const;

    const apks = {
        "JP 32-bit": { link: "", version: "" },
        "JP 64-bit": { link: "", version: "" },
        CN: { link: "", version: "" },
        TW: { link: "", version: "" },
        KR: { link: "", version: "" },
        "NA 32-bit": { link: "", version: "" },
        "NA 64-bit": { link: "", version: "" },
    };

    const versions = await Promise.all(
        packages.map((apk) => fetch(`https://gplay-ver.atlasacademy.workers.dev/?id=${apk.packageId}`).then((response) => response.text()))
    );

    for (let i = 0; i < packages.length; i++) {
        const version = versions[i],
            { region, packageId } = packages[i];

        if (region === "JP" || region === "NA") {
            for (const bitCount of ["32", "64"] as const) {
                apks[`${region} ${bitCount}-bit`].link =
                    bitCount === "64"
                        ? `https://fgo.square.ovh/apk/${packageId}.v${version}.apk`
                        : `https://fgo.square.ovh/apk/${packageId}.v${version}.armeabi_v7a.apk`;

                apks[`${region} ${bitCount}-bit`].version = version;
            }
        } else {
            apks[`${region}`].link = `https://fgo.square.ovh/apk/${packageId}.v${version}.apk`;
            apks[`${region}`].version = version;
        }
    }

    const cnApkUrl = (await (await fetch("https://static.biligame.com/config/fgo.config.js")).text())
        .split('android_link": "')[1]
        .split('"')[0];

    const match = cnApkUrl.match(/FateGO[-_](\d+\.\d+\.\d+)[-_]/i);

    apks[`CN`].link = cnApkUrl;

    if (match !== null) {
        apks[`CN`].version = match[1];
    }

    const apkButtonsMapper = ([region, apk]: [string, (typeof apks)["JP 32-bit"]]) => ({
            type: 2,
            label: `${region}${apk.version && " v" + apk.version}`,
            style: 5,
            url: `${apk.link}`,
        }),
        apkButtons1 = Object.entries(apks).slice(0, 4).map(apkButtonsMapper),
        apkButtons2 = Object.entries(apks).slice(4, 7).map(apkButtonsMapper);

    embedMessage.edit({
        // content: "FGO APK listing — Sourced from Atlas Academy/GPlay [CN from bilibili]",
        embeds: [],
        components: [
            {
                type: 1,
                components: apkButtons1,
            },
            {
                type: 1,
                components: apkButtons2,
            },
        ],
    });
}

function resetTimes(args: string, message: Message) {
    const region = args.split(/\s+/)[0].toUpperCase(); // Only the first word is necessary

    let thumbnailURL = "https://cdn.discordapp.com/role-icons/434184009346580482/be310356db0fe1e49f63cfaac03c314c.webp",
        title = "Typical reset times",
        description =
            "FP/Daily Quest/Command Seal: <t:1693440000:t>\n" +
            "Login Rewards/Maintenance Start/Banner Change: <t:1693454400:t>\n" +
            "Maintenance End: <t:1693468800:t>";

    if (region === "JP") {
        thumbnailURL = "https://cdn.discordapp.com/attachments/1004369913273663531/1146800595236311091/uHe4FQ6.png";
        title = "Typical reset times";
        description =
            "FP/Daily Quest/Command Seal: <t:1693494000:t>\n" +
            "Login Rewards: <t:1693508400:t>\n" +
            "Maintenance Start: <t:1693454400:t>\n" +
            "Maintenance End/Banner Change: <t:1693472400:t>";
    }

    return {
        embeds: [
            {
                title,
                description,
                color: message.member?.displayHexColor ?? message.author.hexAccentColor ?? "#7070EE",
                thumbnail: { url: thumbnailURL },
            },
        ],
    };
}

function hong(args: string, message: Message) {
    args = args.split(/\s+/)[0]; // Only the first word is necessary

    const title = "__FGO Follow Solos/Cheap Clears for Main Story__";

    const soloLinks = [
        "* [Hong's Solos: Part 1/1.5/2 up to LB4](https://www.youtube.com/playlist?list=PLVw95Imz4v-nkX-LKD6tE3NJSwGAQpyT8)",
        "* [LB3 Billi Solos](https://www.bilibili.com/video/av80276537)",
        "* [LB 5.1 Atlantis Solos](https://www.bilibili.com/video/av80130220)",
        "* [LB 5.2 Olympus Solos](https://www.bilibili.com/video/BV1LK4y1m7wK)",
        "* [LB 5.5 Heian-Kyō Solos](https://www.youtube.com/playlist?list=PLfKiA4IXdP7iqWz2aVE-U5vepMoSBjSK7)",
        "* **LB6 Solos/low-cost clears:**\n- [__Part 1__](https://www.bilibili.com/video/BV1Kr4y1V74x/?spm_id_from=333.788.video.desc.click)\n- [__Part 2__](https://www.bilibili.com/video/BV1WG411s7gU/?spm_id_from=333.788.video.desc.click)\n- [__Part 3__](https://www.bilibili.com/video/BV1DN4y1L7DB?p=1)",
    ];

    const bonusLinks = [
        "* [Guide on cheesing hard quests with friend/follow support servants](https://docs.google.com/document/d/13ZkaWVM7miK2RqwY-uvr6jTjZntXhmiEmG77TttC61Y/preview)",
        "* [Hong's mostly F2P FQ & Daily Farming Setups (90+ not included)](https://www.youtube.com/playlist?list=PLVw95Imz4v-kNhqIPqrN0nLautNhQAhrn)",
    ];

    let description = "";

    const soloLinksMap = new Map<string, string>([
        ["story", soloLinks[0]],
        ["hong", soloLinks[0]],
        ["lb3", soloLinks[1]],
        ["lb5.1", soloLinks[2]],
        ["lb5.2", soloLinks[3]],
        ["lb5.5", soloLinks[4]],
        ["lb6", soloLinks[5]],
        ["guide", bonusLinks[0]],
        ["help", bonusLinks[0]],
        ["doc", bonusLinks[0]],
        ["bonus", bonusLinks[1]],
        ["farming", bonusLinks[1]],
    ]);

    description =
        soloLinksMap.get(args.trim().toLowerCase()) ??
        soloLinks.join("\n\u200B") + "\n\u200B__Bonus__\n\u200B" + bonusLinks.join("\n\u200B") + "\n\u200B";

    return {
        embeds: [{ title, description, color: message.member?.displayHexColor ?? message.author.hexAccentColor ?? "#7070EE" }],
    };
}

commands
    .set("test", test)
    .set("t", test)
    .set("help", help)
    .set("h", help)
    .set("list", listNPs)
    .set("l", listNPs)
    .set("getnps", listNPs)
    .set("nps", listNPs)
    .set("hans", hans)
    .set("wikia", wikia)
    .set("wiki", wikia)
    .set("w", wikia)
    .set("lolwiki", lolwiki)
    .set("lw", lolwiki)
    .set("google", bing)
    .set("bing", bing)
    .set("search", bing)
    .set("s", bing)
    .set("calculate", calc)
    .set("calc", calc)
    .set("c", calc)
    .set("evaluate", calc)
    .set("eval", calc)
    .set("e", calc)
    .set("math", calc)
    .set("m", calc)
    .set("getnames", getNames)
    .set("names", getNames)
    .set("g", getNames)
    .set("addname", addName)
    .set("name", addName)
    .set("a", addName)
    .set("removename", removeName)
    .set("deletename", removeName)
    .set("r", removeName)
    .set("db", db)
    .set("d", db)
    .set("aa", db)
    .set(
        "blueprism",
        () =>
            "Introduced with the JP 22M DL Campaign, Blue Prisms function equivalently to a 3 CS/1 quartz revive. They have an expiration date tied to them and are restricted to main story content. They can be obtained through campaigns (both directly and through MP shop purchases)."
    )
    .set(
        "lottery",
        () => `__**What are lotto (lottery) events?**__\n\u200B
    Lotto events are specific events that feature a unique system of mat rewards in the form of a __**lottery wheel/roulette**__ which pulls from a __**box**__ that has a set of predetermined goodies in them, such as mats, QP, gems, exp, etc available at a very ap-efficient rate. The boxes are rolled with a specific event lottery currency that you obtain alongside the standard shop currencies. Once a box has been completely cleared out of items the box can be __**reset**__, replenishing all of the mats and other items within it.\n\u200B
    The reason why lottos are so highly anticipated is because there is __**no limit to the number of times you can reset the box**__ (note that reruns often have limited resets). This is why it is frequently recommended to both save a majority of one's apples for lottos, and to focus on putting together farming teams that clear the best lotto currency nodes in as few turns as possible to speed up the grind.`
    )
    .set(
        "lotto",
        () => `__**What are lotto (lottery) events?**__\n\u200B
    Lotto events are specific events that feature a unique system of mat rewards in the form of a __**lottery wheel/roulette**__ which pulls from a __**box**__ that has a set of predetermined goodies in them, such as mats, QP, gems, exp, etc available at a very ap-efficient rate. The boxes are rolled with a specific event lottery currency that you obtain alongside the standard shop currencies. Once a box has been completely cleared out of items the box can be __**reset**__, replenishing all of the mats and other items within it.\n\u200B
    The reason why lottos are so highly anticipated is because there is __**no limit to the number of times you can reset the box**__ (note that reruns often have limited resets). This is why it is frequently recommended to both save a majority of one's apples for lottos, and to focus on putting together farming teams that clear the best lotto currency nodes in as few turns as possible to speed up the grind.`
    )
    .set(
        "welfarerp",
        () =>
            "Copies 6 to 10 of welfare servants __acquired during or after the 2020 Santa Altera rerun__ will each give 1 RP upon acquisition, __automatically arriving in your present box__ - burning not required.\n\u200B\n**Any welfare servants acquired prior to that rerun will not give RP.**"
    )
    .set(
        "coins",
        () => `**Regarding Append and level 120 Grail coin cost:**
    - Every servant has 3 new passive skills. Each passive skill costs 120 coins to unlock (360 total).
    - Every grail past level 100 is 2 levels. Each one also costs 30 coins. So going 100>120 requires 300 coins.\n\u200B
**Bond-related rewards (retroactive for all):**
    Bond 1-6 = 5 coins each (30 total)
    Bond 7-9 = 10 coins each (30 total)
    Bond 10-15 = 20 coins each (120 total)\n\u200B
**NP level rewards (only retroactive for non-welfare golds):**
    SSR: 90 coins per NP level
    Limited/Storylock SRs/Angra: 50 coins per NP level
    Permanent SRs: 30 coins per NP level
    Limited/Story-locked 3s: 30 coins per NP level
    Permanent 3s/Limited 1s: 15 coins per NP level
    2s: 6 coins per NP level
    1*s: 2 coins per NP level\n\u200B
__Servant Coin Calculator for the lazy:__
    <https://r-grandorder.github.io/fgo-guides/references/coins_calculator.html>`
    )
    .set("junao", () => ({
        embeds: [
            {
                title: "Junao/Waver",
                description: "https://imgur.com/IAYH9Vb",
            },
            {
                title: "Junao/Merlin",
                description: "https://imgur.com/eA0YLIQ",
            },
        ],
    }))
    .set("commands", () => {
        let replyDesc = "__**Bot Commands**__\n";

        for (const [key, value] of botCommandsMap) {
            replyDesc += `**${key}** - ${value}\n`;
        }

        replyDesc += "\u200B\n__**Various Resources**__\n";

        for (const [key, value] of resourceCommandsMap) {
            replyDesc += `**${key}** - ${value}\n`;
        }

        replyDesc += "\u200B\n__**Forecast Resources**__\n";

        for (const [key, value] of forecastResourcesCommandsMap) {
            replyDesc += `**${key}** - ${value}\n`;
        }

        replyDesc += "\u200B\n__**Beginner Resources**__\n";

        for (const [key, value] of beginnerResourcesCommandsMap) {
            replyDesc += `**${key}** - ${value}\n`;
        }

        return {
            embeds: [
                {
                    title: "__**Commands**__",
                    description: replyDesc,
                },
            ],
        };
    })
    .set("hong", hong)
    .set("solo", hong)
    .set("solos", hong)
    .set("soloes", hong)
    .set("apk", apkLinkEmbed)
    .set("apks", apkLinkEmbed)
    .set("reset", resetTimes)
    .set("resetna", resetTimes)
    .set("resetjp", (_, message) => resetTimes("JP", message))
    .set("liz", exitForCleanReload)
    .set("reload", reload)
    .set("rl", reload)
    .set("update", update)
    .set("jsons", updateLinksAndNicknames)
    .set("pushjsons", updateLinksAndNicknames)
    .set("push-jsons", updateLinksAndNicknames)
    .set("link", link)
    .set("unlink", unlink)
    .set("setsearch", setUseSearchEnv)
    .set("usesearch", setUseSearchEnv)
    .set("setusesearch", setUseSearchEnv);

// Call update every 5 minutes
setInterval(reload, 5 * 60 * 1000);

export { commands };
