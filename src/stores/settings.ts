import { defineStore } from "pinia";
import { classes } from "../constants/classes";
import { merge } from "lodash";
import { ClassSettings, Settings } from "../../src-electron/util/app-settings";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    settings: {
      appVersion: "",
      general: {
        startMainHidden: false,
        startMainMinimized: false,
        closeToSystemTray: true,
        saveScreenshots: true,
        server: "steam",
        customLogPath: null,
        useRawSocket: false,
        listenPort: 6040,
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
          opacity: 0.9,
          transparency: false,
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
          dBuffedBySup: {
            name: "Dmg % buffed by Support",
            enabled: false,
          },
          dDebuffedBySup: {
            name: "Dmg % debuffed by Support",
            enabled: false,
          },
          dBuffed: {
            name: "Dmg % Buffed",
            enabled: false,
          },
          dDebuffed: {
            name: "Dmg % Debuffed",
            enabled: false,
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
          hBuffedBySup: {
            name: "Hit % buffed by Support",
            enabled: false,
          },
          hDebuffedBySup: {
            name: "Hit % debuffed by Support",
            enabled: false,
          },
          hBuffed: {
            name: "Hit % Buffed",
            enabled: false,
          },
          hDebuffed: {
            name: "Hit % Debuffed",
            enabled: false,
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
    } as Settings,
  }),
  getters: {
    getClassColor(state) {
      return (className: string) => {
        if (className in state?.settings?.damageMeter?.classes)
          return state.settings.damageMeter.classes[className].color;
        return "#353535";
      };
    },
  },
  actions: {
    initSettings() {
      merge(this.settings.damageMeter.classes, classes);
      for (const classSetting of Object.values(
        this.settings.damageMeter.classes
      ) as [ClassSettings]) {
        classSetting.defaultColor = classSetting.color;
      }
    },
    loadSettings(settingsToLoad: Settings) {
      merge(this.settings, settingsToLoad);
    },
    saveSettings() {
      window.messageApi.send("window-to-main", {
        message: "save-settings",
        value: JSON.stringify(this.settings),
      });
    },
  },
});
