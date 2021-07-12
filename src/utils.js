export const convertAudio = async (input) => {
  // stereo to mono channel
  const data = new Int16Array(input);
  const ndata = new Int16Array(data.length / 2);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    ndata[j++] = data[i];
    ndata[j++] = data[i + 1];
  }
  return Buffer.from(ndata);
};

export const prefixUsername = (guildMap, txt, mapKey, user, member) => {
  if (txt && txt.length) {
    const val = guildMap.get(mapKey);
    val.text_Channel.send((member.displayName || user.username) + ": " + txt);
  }
};
