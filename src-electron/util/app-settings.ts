import Store from "electron-store";
import log from "electron-log";
import { cloneDeep, merge } from "lodash";

const store = new Store();

export function getSettings() {
  let appSettings = cloneDeep(defaultSettings);

  try {
    const settingsStr = store.get("settings");

    if (typeof settingsStr === "object")
      appSettings = merge(appSettings, cloneDeep(settingsStr));
    else if (typeof settingsStr === "string")
      merge(appSettings, JSON.parse(settingsStr));

    log.info("Found and applied settings.");
  } catch (e) {
    log.info("Setting retrieval failed: " + e);
  }

  return appSettings;
}

export function saveSettings(settings: Settings | string) {
  if (typeof settings === "object")
    store.set("settings", JSON.stringify(settings));
  else store.set("settings", settings);

  log.info(`Saved settings: ${settings}`);
}
export type ClassSettings = { color: string; defaultColor: string };
export type Settings = {
  appVersion: string;
  general: {
    startMainHidden: boolean;
    startMainMinimized: boolean;
    closeToSystemTray: boolean;
    saveScreenshots: boolean;
    server: "steam" | "kr" | "ru";
    customLogPath: string | null;
  };
  shortcuts: {
    minimizeDamageMeter: {
      value: string;
      defaultValue: string;
    };
    resetSession: {
      value: string;
      defaultValue: string;
    };
    pauseDamageMeter: {
      value: string;
      defaultValue: string;
    };
  };
  uploads: {
    uploadLogs: boolean;
    uploadKey: string;
    api: {
      value?: string;
      defaultValue?: string;
    };
    endpoint: {
      value?: string;
      defaultValue?: string;
    };
    site: {
      value?: string;
      defaultValue?: string;
    };
    openOnUpload: boolean;
    uploadUnlisted: boolean;
    includeRegion: boolean;
  };
  damageMeter: {
    functionality: {
      dontResetOnZoneChange: boolean;
      removeOverkillDamage: boolean;
      pauseOnPhaseTransition: boolean;
      resetAfterPhaseTransition: boolean;
      autoMinimize: boolean;
      autoMinimizeTimer: number;
      minimizeToTaskbar: boolean;
      nameDisplay: string;
      nameDisplayV2: string;
    };
    design: {
      compactDesign: boolean;
      pinUserToTop: boolean;
      transparency: boolean;
      opacity: number;
    };
    header: {
      [key: string]: {
        name: string;
        enabled: boolean;
      };
    };
    tabs: {
      [key: string]: {
        name: string;
        enabled: boolean;
      };
    };
    classes: { [key: string]: ClassSettings };
  };
  logs: {
    minimumSessionDurationInMinutes: number;
    minimumEncounterDurationInMinutes: number;
    minimumDurationInMinutes: number;
    splitOnPhaseTransition: boolean;
  };
};
// TODO: find a better way to handle this
const defaultSettings: Settings = {
  appVersion: "",
  general: {
    startMainHidden: false,
    startMainMinimized: false,
    closeToSystemTray: true,
    saveScreenshots: true,
    server: "steam",
    customLogPath: null,
  },
  shortcuts: {
    minimizeDamageMeter: {
      value: "CommandOrControl+Down",
      defaultValue: "CommandOrControl+Down",
    },
    resetSession: {
      value: "CommandOrControl+Up",
      defaultValue: "CommandOrControl+Up",
    },
    pauseDamageMeter: {
      value: "CommandOrControl+Right",
      defaultValue: "CommandOrControl+Right",
    },
  },
  uploads: {
    uploadLogs: false,
    uploadKey: "",
    api: {
      value: process.env.UPLOADS_API_URL,
      defaultValue: process.env.UPLOADS_API_URL,
    },
    endpoint: {
      value: process.env.UPLOADS_ENDPOINT,
      defaultValue: process.env.UPLOADS_ENDPOINT,
    },
    site: {
      value: process.env.UPLOADS_LOGIN_URL,
      defaultValue: process.env.UPLOADS_LOGIN_URL,
    },
    openOnUpload: false,
    uploadUnlisted: true,
    includeRegion: false,
  },
  damageMeter: {
    functionality: {
      dontResetOnZoneChange: false,
      removeOverkillDamage: true,
      pauseOnPhaseTransition: true,
      resetAfterPhaseTransition: true,
      autoMinimize: false,
      autoMinimizeTimer: 60,
      minimizeToTaskbar: false,
      nameDisplay: "name+class",
      nameDisplayV2: "name+gear+class",
    },
    design: {
      compactDesign: false,
      pinUserToTop: false,
      transparency: true,
      opacity: 0.9,
    },
    header: {
      damage: {
        name: "Damage",
        enabled: true,
      },
      dps: {
        name: "DPS",
        enabled: true,
      },
      tank: {
        name: "Tanked",
        enabled: false,
      },
      bossHP: {
        name: "Boss HP",
        enabled: false,
      },
    },
    tabs: {
      damage: {
        name: "Damage/Tanked",
        enabled: true,
      },
      deathTime: {
        name: "Death Time",
        enabled: false,
      },
      damagePercent: {
        name: "D% (Damage Percent)",
        enabled: true,
      },
      dps: {
        name: "DPS/TPS",
        enabled: true,
      },
      critRate: {
        name: "Crit Rate",
        enabled: true,
      },
      faRate: {
        name: "Front Attack Rate",
        enabled: true,
      },
      baRate: {
        name: "Back Attack Rate",
        enabled: true,
      },
      counterCount: {
        name: "Counter Count",
        enabled: true,
      },
      maxDmg: {
        name: "Skill View / Max Damage",
        enabled: true,
      },
      avgDmg: {
        name: "Skill View / Average Damage",
        enabled: true,
      },
      totalHits: {
        name: "Skill View / Total Hits",
        enabled: true,
      },
      hpm: {
        name: "Skill View / Hits per Minute",
        enabled: true,
      },
    },
    classes: {},
  },
  logs: {
    minimumSessionDurationInMinutes: 1,
    minimumEncounterDurationInMinutes: 0.5,
    minimumDurationInMinutes: 0.0,
    splitOnPhaseTransition: true,
  },
};
