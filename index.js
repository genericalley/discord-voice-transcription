function getCurrentDateString() {
  return new Date().toISOString() + " ::";
}

// TODO: rewrite so it works for all log levels
__originalLog = console.log;
console.log = function () {
  var args = [].slice.call(arguments);
  __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};

const fs = require("fs");
const { Readable } = require("stream");
//
// function necessary_dirs() {
//     if (!fs.existsSync('./data/')){
//         fs.mkdirSync('./data/');
//     }
// }
// necessary_dirs()

async function convert_audio(input) {
  try {
    // stereo to mono channel
    const data = new Int16Array(input);
    const ndata = new Int16Array(data.length / 2);
    for (let i = 0, j = 0; i < data.length; i += 4) {
      ndata[j++] = data[i];
      ndata[j++] = data[i + 1];
    }
    return Buffer.from(ndata);
  } catch (e) {
    console.log(e);
    console.log("convert_audio: " + e);
    throw e;
  }
}

const SETTINGS_FILE = "settings.json";

let DISCORD_TOK = null;

function loadConfig() {
  if (fs.existsSync(SETTINGS_FILE)) {
    const CFG_DATA = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    DISCORD_TOK = CFG_DATA.discord_token;
  } else {
    DISCORD_TOK = process.env.DISCORD_TOK;
  }
  if (!DISCORD_TOK) throw "failed loading config #113 missing keys!";
}
loadConfig();

const Discord = require("discord.js");
const DISCORD_MSG_LIMIT = 2000;
const discordClient = new Discord.Client();
if (process.env.DEBUG) discordClient.on("debug", console.debug);
discordClient.on("ready", () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});
discordClient.login(DISCORD_TOK);

const PREFIX = "*";
// TODO: refactor so these definitions supply the help text
const _CMD_HELP = PREFIX + "help";
const _CMD_JOIN = PREFIX + "join";
const _CMD_LEAVE = PREFIX + "leave";
const _CMD_DEBUG = PREFIX + "debug";
const _CMD_TEST = PREFIX + "hello";
// const _CMD_LANG        = PREFIX + 'lang';
// TODO: add multiple language support (but would this change it for all users?)

const guildMap = new Map();

discordClient.on("message", async (msg) => {
  try {
    if (!("guild" in msg) || !msg.guild) return; // prevent private messages to bot
    const mapKey = msg.guild.id;
    if (msg.content.trim().toLowerCase() === _CMD_JOIN) {
      if (!msg.member.voice.channelID) {
        msg.reply("Error: please join a voice channel first.");
      } else {
        if (!guildMap.has(mapKey)) await connect(msg, mapKey);
        else msg.reply("Already connected");
      }
    } else if (msg.content.trim().toLowerCase() === _CMD_LEAVE) {
      if (guildMap.has(mapKey)) {
        let val = guildMap.get(mapKey);
        if (val.voice_Channel) val.voice_Channel.leave();
        if (val.voice_Connection) val.voice_Connection.disconnect();
        guildMap.delete(mapKey);
        msg.reply("Disconnected.");
      } else {
        msg.reply("Cannot leave because not connected.");
      }
    } else if (msg.content.trim().toLowerCase() === _CMD_HELP) {
      msg.reply(getHelpString());
    } else if (msg.content.trim().toLowerCase() === _CMD_DEBUG) {
      console.log("toggling debug mode");
      let val = guildMap.get(mapKey);
      if (val.debug) val.debug = false;
      else val.debug = true;
    } else if (msg.content.trim().toLowerCase() === _CMD_TEST) {
      msg.reply("hello back =)");
    }
  } catch (e) {
    console.log("discordClient message: " + e);
    msg.reply(
      "Error#180: Something went wrong, try again or contact the developers if this keeps happening."
    );
  }
});

function getHelpString() {
  let out = "**COMMANDS:**\n";
  out += "```";
  out += PREFIX + "join\n";
  out += PREFIX + "leave\n";
  out += "```";
  return out;
}

const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, mapKey) {
  try {
    let voice_Channel = await discordClient.channels.fetch(
      msg.member.voice.channelID
    );
    if (!voice_Channel)
      return msg.reply("Error: The voice channel does not exist!");
    let text_Channel = await discordClient.channels.fetch(msg.channel.id);
    if (!text_Channel)
      return msg.reply("Error: The text channel does not exist!");
    let voice_Connection = await voice_Channel.join();
    voice_Connection.play(new Silence(), { type: "opus" });
    guildMap.set(mapKey, {
      text_Channel: text_Channel,
      voice_Channel: voice_Channel,
      voice_Connection: voice_Connection,
      debug: false,
    });
    speak_impl(voice_Connection, mapKey);
    voice_Connection.on("disconnect", async (e) => {
      if (e) console.log(e);
      guildMap.delete(mapKey);
    });
    msg.reply("connected!");
  } catch (e) {
    console.log("connect: " + e);
    msg.reply("Error: unable to join your voice channel.");
    throw e;
  }
}

function speak_impl(voice_Connection, mapKey) {
  voice_Connection.on("speaking", async (user, speaking) => {
    if (speaking.bitfield === 0 || user.bot) {
      return;
    }
    console.log(`I'm listening to ${user.username}`);
    // this creates a 16-bit signed PCM, stereo 48KHz stream
    const audioStream = voice_Connection.receiver.createStream(user, {
      mode: "pcm",
    });
    audioStream.on("error", (e) => {
      console.log("audioStream: " + e);
    });
    let buffer = [];
    audioStream.on("data", (data) => {
      buffer.push(data);
    });
    audioStream.on("end", async () => {
      buffer = Buffer.concat(buffer);
      const duration = buffer.length / 48000 / 4;
      console.log("duration: " + duration);

      // TODO: stream audio & chunk response instead of using hard upper limit
      // TODO: refine lower limit to work better for interjections
      if (duration < 1.0 || duration > 19) {
        console.log("TOO SHORT / TOO LONG; SKIPPING");
        return;
      }

      try {
        let new_buffer = await convert_audio(buffer);
        let out = await transcribe(new_buffer);
        if (out != null) {
          const member = voice_Connection.channel.guild.member(user);
          prefix_username(out, mapKey, user, member);
        }
      } catch (e) {
        console.log("tmpraw rename: " + e);
      }
    });
  });
}

function prefix_username(txt, mapKey, user, member) {
  if (txt && txt.length) {
    let val = guildMap.get(mapKey);
    member.displayName
      ? val.text_Channel.send(member.displayName + ": " + txt)
      : val.text_Channel.send(user.username + ": " + txt);
  }
}

const gspeech = require("@google-cloud/speech");
const gspeechclient = new gspeech.SpeechClient({
  projectId: "discordbot",
  keyFilename: "gspeech_key.json",
});

async function transcribe(buffer) {
  const bytes = buffer.toString("base64");
  const audio = {
    content: bytes,
  };
  const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 48000,
    languageCode: "en-US", // https://cloud.google.com/speech-to-text/docs/languages
  };
  const request = {
    audio: audio,
    config: config,
  };

  const [response] = await gspeechclient.recognize(request);
  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join("\n");
  console.log(`gspeech: ${transcription}`);
  return transcription;
}

// TODO: tests! tests! tests!
// TODO: sentry integration?
