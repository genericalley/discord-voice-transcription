const PREFIX = "*";

export const HELP = PREFIX + "help";
export const JOIN = PREFIX + "join";
export const LEAVE = PREFIX + "leave";
export const DEBUG = PREFIX + "debug";
// TODO: add multiple language support? Only if it's possible to do concurrently for different VCs

export const HELP_TEXT = `**COMMANDS**:
  \`${HELP}\`: Show this help text
  \`${JOIN}\`: Begin transcribing your current VC
  \`${LEAVE}\`: Stop transcribing your current VC
  \`${DEBUG}\`: Toggle the logging of debug info (devs only)
`;
