import {
  app,
  dialog,
  nativeTheme,
  ipcMain,
  Menu,
  Tray,
  shell,
  BrowserWindow,
} from "electron";
import { initialize } from "@electron/remote/main";

import { Decompressor } from "meter-core/dist/decompressor";
import { PktCaptureAll } from "meter-core/dist/pkt-capture";
import { PKTStream } from "meter-core/dist/pkt-stream";
import { LegacyLogger } from "meter-core/dist/legacy-logger";
import { MeterData } from "meter-core/dist/data";

import log from "electron-log";
import path from "path";
import os from "os";
import Store from "electron-store";

if (app.commandLine.hasSwitch("disable-hardware-acceleration")) {
  log.info("Hardware acceleration disabled");
  app.disableHardwareAcceleration();
}

import {
  shortcutEventEmitter,
  initializeShortcuts,
  updateShortcuts,
} from "./util/shortcuts-manager";

import {
  createPrelauncherWindow,
  createMainWindow,
  createDamageMeterWindow,
} from "./electron-windows";

import { getSettings, saveSettings } from "./util/app-settings";

import {
  updaterEventEmitter,
  checkForUpdates,
  quitAndInstall,
} from "./util/updater";

import { saveScreenshot } from "./util/screenshot";

import { LogParser } from "loa-details-log-parser";
import { mainFolder } from "./util/directories";

import {
  parseLogs,
  getParsedLogs,
  getLogData,
  wipeParsedLogs,
} from "./log-parser/file-parser";
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "fs";

const store = new Store();

let prelauncherWindow: BrowserWindow | null,
  mainWindow: BrowserWindow | null,
  damageMeterWindow: BrowserWindow | null;
let tray = null;

const appLockKey = { myKey: "loa-details" };
const gotTheLock = app.requestSingleInstanceLock(appLockKey);
if (!gotTheLock) {
  app.quit();
} else {
  // set up a listener for "second-instance", this will fire if a second instance is requested
  // second instance won't get the lock and it will quit itself, we can also focus on our window
  app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

initialize();

const logParser = new LogParser(true);
logParser.debugLines = true;

let appSettings = getSettings();

logParser.dontResetOnZoneChange =
  appSettings.damageMeter.functionality.dontResetOnZoneChange;

logParser.resetAfterPhaseTransition =
  appSettings.damageMeter.functionality.resetAfterPhaseTransition;

logParser.removeOverkillDamage =
  appSettings.damageMeter.functionality.removeOverkillDamage;

appSettings.appVersion = app.getVersion();

// needed in case process is undefined under Linux
const platform = process.platform || os.platform();
try {
  if (platform === "win32" && nativeTheme.shouldUseDarkColors === true) {
    require("fs").unlinkSync(
      path.join(app.getPath("userData"), "DevTools Extensions")
    );
  }
} catch (_) {}

app.whenReady().then(() => {
  // Don't create prelauncher if debugging
  if (!process.env.DEBUGGING) {
    prelauncherWindow = createPrelauncherWindow();
    prelauncherWindow.on("show", () => {
      checkForUpdates();
    });
  } else {
    startApplication();
  }
});

let prelauncherStatus = "open";

updaterEventEmitter.on("event", (details) => {
  if (
    typeof prelauncherWindow !== "undefined" &&
    prelauncherWindow &&
    prelauncherWindow.webContents
  ) {
    prelauncherWindow.webContents.send("updater-message", details);
  } else if (
    typeof mainWindow !== "undefined" &&
    mainWindow &&
    mainWindow.webContents
  ) {
    mainWindow.webContents.send("updater-message", details);
  }

  if (
    details.message === "update-not-available" &&
    prelauncherStatus === "open"
  ) {
    startApplication();
    if (typeof prelauncherWindow != "undefined") {
      prelauncherStatus = "closed";
      prelauncherWindow?.close();
      prelauncherWindow = null;
    }
  }

  // quitAndInstall only when prelauncher is visible (aka startup of application)
  if (
    details.message === "update-downloaded" &&
    typeof prelauncherWindow != "undefined" &&
    prelauncherWindow
  ) {
    quitAndInstall(false, true); // isSilent=false, forceRunAfter=true
  }
});

function startApplication() {
  tray = new Tray(
    process.env.DEBUGGING
      ? path.resolve(__dirname, "../../src-electron/icons/icon.png")
      : path.resolve(__dirname, "icons/icon.png")
  );

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show LOA Details",
      click() {
        mainWindow?.show();
        if (mainWindow?.isMinimized()) mainWindow?.restore();
        mainWindow?.focus();
      },
    },
    {
      label: "Quit",
      click() {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("LOA Details");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
    if (mainWindow?.isMinimized()) mainWindow?.restore();
    mainWindow?.focus();
  });
  /*
  setupBridge(appSettings);

  httpServerEventEmitter.on("packet", (value) => {
    logParser.parseLogLine(value);
  });

  httpServerEventEmitter.on("debug", (data) => {
    log.info("debug:", data);
  });
  */
  /*   const dontShowPatreonBox = store.get("dont_show_patreon_box");
  if (!dontShowPatreonBox) {
    const userSelection = dialog.showMessageBoxSync(mainWindow, {
      type: "info",
      title: "Support LOA Details",
      message: "Would you like to support this project by donating on Patreon?",
      buttons: ["No", "Yes"],
      defaultId: 0,
      cancelId: 0,
    });

    if (userSelection === 1) {
      shell.openExternal("https://www.patreon.com/loadetails");
    }

    store.set("dont_show_patreon_box", "true");
  } */

  mainWindow = createMainWindow(appSettings);
  damageMeterWindow = createDamageMeterWindow(logParser, appSettings);
  damageMeterWindow.on("ready-to-show", () => {
    const xorTable = readFileSync("./meter-data/xor.bin");
    const oodle_state = readFileSync("./meter-data/oodle_state.bin");
    const compressor = new Decompressor(oodle_state, xorTable);
    const stream = new PKTStream(compressor);
    const capture = new PktCaptureAll();
    capture.on("packet", (buf) => stream.read(buf));
    const meterData = new MeterData();
    meterData.processEnumData(
      JSON.parse(readFileSync("./meter-data/databases/Enums.json", "utf-8"))
    );
    meterData.processNpcData(
      JSON.parse(readFileSync("./meter-data/databases/Npc.json", "utf-8"))
    );
    meterData.processPCData(
      JSON.parse(readFileSync("./meter-data/databases/PCData.json", "utf-8"))
    );
    meterData.processSkillData(
      JSON.parse(readFileSync("./meter-data/databases/Skill.json", "utf-8"))
    );
    meterData.processSkillBuffData(
      JSON.parse(readFileSync("./meter-data/databases/SkillBuff.json", "utf-8"))
    );
    meterData.processSkillBuffEffectData(
      JSON.parse(
        readFileSync("./meter-data/databases/SkillEffect.json", "utf-8")
      )
    );
    const padTo2Digits = (num: number) => num.toString().padStart(2, "0");

    const legacyLogger = new LegacyLogger(stream, meterData);
    const date = new Date();
    const filename =
      "LostArk_" +
      [
        date.getFullYear(),
        padTo2Digits(date.getMonth() + 1),
        padTo2Digits(date.getDate()),
        padTo2Digits(date.getHours()),
        padTo2Digits(date.getMinutes()),
        padTo2Digits(date.getSeconds()),
      ].join("-") +
      ".log";
    const logfile = createWriteStream(path.join(mainFolder, filename), {
      highWaterMark: 0,
      encoding: "utf-8",
    });
    //TODO: write version to log?

    legacyLogger.on("line", (line) => {
      logParser.parseLogLine(line);
      logfile?.write(line);
      logfile?.write("\n");
    });
  });

  initializeShortcuts(appSettings);

  shortcutEventEmitter.on("shortcut", (shortcut) => {
    log.debug(shortcut);

    if (shortcut.action === "minimizeDamageMeter") {
      damageMeterWindow?.webContents.send(
        "shortcut-action",
        "toggle-minimized-state"
      );
    } else if (shortcut.action === "resetSession") {
      damageMeterWindow?.webContents.send("shortcut-action", "reset-session");
    } else if (shortcut.action === "pauseDamageMeter") {
      damageMeterWindow?.webContents.send(
        "shortcut-action",
        "pause-damage-meter"
      );
    }
  });
}

let damageMeterWindowOldSize: number[],
  damageMeterWindowOldPosition: number[],
  damageMeterWindowOldMinimumSize: number[],
  damageMeterPositionDifference: number[];

const ipcFunctions: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (event: Electron.IpcMainEvent, arg: any) => void;
} = {
  "reset-session": () => {
    logParser.softReset();
  },
  "cancel-reset-session": () => {
    if (logParser.resetTimer) {
      logParser.cancelReset();
    }
  },
  "save-settings": (event, arg: { value: string }) => {
    appSettings = JSON.parse(arg.value);
    saveSettings(arg.value);

    updateShortcuts(appSettings);

    mainWindow?.webContents.send("on-settings-change", appSettings);
    damageMeterWindow?.webContents.send("on-settings-change", appSettings);

    logParser.dontResetOnZoneChange =
      appSettings.damageMeter.functionality.dontResetOnZoneChange;

    logParser.removeOverkillDamage =
      appSettings.damageMeter.functionality.removeOverkillDamage;

    logParser.resetAfterPhaseTransition =
      appSettings.damageMeter.functionality.resetAfterPhaseTransition;

    damageMeterWindow?.setOpacity(appSettings.damageMeter.design.opacity);
  },
  "get-settings": (event) => {
    event.reply("on-settings-change", appSettings);
  },
  "parse-logs": async (event) => {
    await parseLogs(event, appSettings.logs.splitOnPhaseTransition);
  },
  "get-parsed-logs": async (event) => {
    const parsedLogs = await getParsedLogs();
    await event.reply("parsed-logs-list", parsedLogs);
  },
  "get-parsed-log": async (event, arg) => {
    const logData = await getLogData(arg.value);
    await event.reply("parsed-log", logData);
  },
  "wipe-parsed-logs": async () => {
    await wipeParsedLogs();
  },
  "open-log-directory": () => {
    shell.openPath(mainFolder);
  },
  "check-for-updates": () => {
    checkForUpdates();
  },
  "quit-and-install": () => {
    quitAndInstall();
  },
  "open-link": (event, arg) => {
    shell.openExternal(arg.value);
  },
  "save-screenshot": async (event, arg) => {
    await saveScreenshot(arg.value);
  },
  "select-log-path-folder": async (event) => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return;
    event.reply("selected-log-path-folder", res.filePaths[0]);
  },
  "reset-damage-meter-position": async () => {
    damageMeterWindow?.setPosition(0, 0);
    store.set("windows.damage_meter.X", 0);
    store.set("windows.damage_meter.Y", 0);
  },
  "toggle-damage-meter-minimized-state": (event, arg) => {
    if (appSettings.damageMeter.functionality.minimizeToTaskbar) {
      if (arg.value) damageMeterWindow?.minimize();
      else damageMeterWindow?.restore();
    } else {
      if (arg.value) {
        const newW = 160,
          newH = 64;

        damageMeterWindowOldSize = damageMeterWindow?.getSize() || [0, 0];
        damageMeterWindowOldMinimumSize =
          damageMeterWindow?.getMinimumSize() || [0, 0];
        damageMeterWindowOldPosition = damageMeterWindow?.getPosition() || [
          0, 0,
        ];

        damageMeterPositionDifference = [
          damageMeterWindowOldPosition[0] + damageMeterWindowOldSize[0] - newW,
          damageMeterWindowOldPosition[1] + damageMeterWindowOldSize[1] - newH,
        ];

        damageMeterWindow?.setResizable(false);
        damageMeterWindow?.setMinimumSize(newW, newH);
        damageMeterWindow?.setSize(newW, newH);
        damageMeterWindow?.setPosition(
          damageMeterPositionDifference[0],
          damageMeterPositionDifference[1]
        );
      } else {
        damageMeterWindow?.setResizable(true);
        damageMeterWindow?.setMinimumSize(
          damageMeterWindowOldMinimumSize[0],
          damageMeterWindowOldMinimumSize[1]
        );
        damageMeterWindow?.setSize(
          damageMeterWindowOldSize[0],
          damageMeterWindowOldSize[1]
        );
        damageMeterWindow?.setPosition(
          damageMeterWindowOldPosition[0],
          damageMeterWindowOldPosition[1]
        );
      }
    }
  },
};

ipcMain.on("window-to-main", (event, arg) => {
  const ipcFunction =
    ipcFunctions[arg.message] ||
    (() => {
      log.error("Unknown window-to-main message: " + arg.message);
    });
  ipcFunction(event, arg);
});

app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow(appSettings);
  }
});
