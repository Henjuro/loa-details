<template>
  <div class="entity-bar">
    <q-toggle
      v-for="player of players"
      v-bind:key="player.id"
      :label="player.name"
      v-model="playerIdList"
      :val="player.id"
    >
    </q-toggle>
  </div>
  <div class="chart-container">
    <v-chart
      class="statuseffect-chart"
      :option="option"
      autoresize
      :init-options="initOptions"
    />
  </div>
</template>

<script setup lang="ts">
import { graphic, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart, CustomChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  MarkPointComponent,
  ToolboxComponent,
  DataZoomComponent,
} from "echarts/components";
import { onMounted, PropType, Ref, ref, shallowRef, watch } from "vue";
import VChart from "vue-echarts";
import { EntityExtended, getClassName, getIconPath } from "src/util/helpers";
import { useSettingsStore } from "stores/settings";
import {
  GameState,
  StatusEffect,
  StatusEffectCast,
  StatusEffectTarget,
} from "app/../meter-core/dist/logger/data";
import type {
  TooltipFormatterCallback,
  TopLevelFormatterParams,
} from "echarts/types/dist/shared";
import type {
  CustomSeriesRenderItem,
  SeriesOption,
  CustomSeriesRenderItemReturn,
  EChartsOption,
} from "echarts";
import { ShallowRef } from "vue";

interface CustomSeriesRenderItemParamsCoordSysCartesian2D {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  MarkPointComponent,
  ToolboxComponent,
  DataZoomComponent,
  CustomChart,
]);
const props = defineProps({
  sessionState: { type: Object as PropType<GameState>, required: true },
});
const settingsStore = useSettingsStore();

let entitiesCopy: EntityExtended[] = [];

const option = ref<EChartsOption>({});
const initOptions = shallowRef({ renderer: "canvas" });
const players: ShallowRef<EntityExtended[]> = shallowRef([]);
const playerIdList: Ref<string[]> = ref([]);
let playerAmount = 0;

function prepareExistingEntities() {
  players.value = Array.from(props.sessionState?.entities.values()).filter(
    (e) => e.isPlayer && e.damageDealt > 0
  );
  players.value.sort((a, b) => a.damageDealt - b.damageDealt);
  players.value.forEach((p) => {
    playerIdList.value.push(p.id);
  });
}

function filterForDisplayEntities() {
  entitiesCopy = players.value.filter((val) => {
    return playerIdList.value.includes(val.id);
  })
}

watch(props, () => {
  prepareExistingEntities();
  filterForDisplayEntities();
  prepare()
});
onMounted(() => {
  prepareExistingEntities();
  filterForDisplayEntities();
  prepare()
});
watch(playerIdList, () => {
  filterForDisplayEntities();
  prepare();
});

const renderToolTip: TooltipFormatterCallback<TopLevelFormatterParams> = (
  params
) => {
  if (Array.isArray(params)) return "";
  if (!Array.isArray(params.value)) return "";
  if (!Array.isArray(params.value[4])) return "";
  const buffNames = params.value[4] as string[];
  const iconPaths = (params.value[5] as string).split("|");
  const sourceName = params.value[7] as string;
  const targetName = params.value[8] as string;
  let pics = "";
  iconPaths.forEach((val) => {
    pics += `<image src="${val}"/>`;
  });
  let tooltip =
    pics +
    `</br>Names: ${buffNames.join(", ")}` +
    `</br>Duration: ${((params.value[3] as number) / 1000).toFixed(
      1
    )}s</br>Source: ${sourceName}</br>Target: ${targetName}`;
  return tooltip;
};

const renderItem: CustomSeriesRenderItem = (params, api) => {
  const SHOW_ICONS = false;
  // value[playerIdx, startTime, endTime, duration]
  if (params.coordSys.type !== "cartesian2d") return;
  const coordSys =
    params.coordSys as unknown as CustomSeriesRenderItemParamsCoordSysCartesian2D;
  const categoryIndex = api.value(0);
  const start = api.coord([api.value(1), categoryIndex]);
  const end = api.coord([api.value(2), categoryIndex]);
  const playerIdx = api.value(6) as number;
  if (api.size === undefined) return;
  const sizeResult = api.size([0, 1]) as number[];
  const barPercent = 0.8;
  const height = (sizeResult[1] * barPercent) / playerAmount;
  const iconSize = height * 0.8;
  const yPos =
    start[1] -
    sizeResult[1] / 2 +
    height * playerIdx +
    (sizeResult[1] * (1 - barPercent)) / 2;
  const durationBar = graphic.clipRectByRect(
    {
      x: start[0],
      y: yPos,
      width: end[0] - start[0],
      height: height,
    },
    {
      x: coordSys.x,
      y: coordSys.y,
      width: coordSys.width,
      height: coordSys.height,
    }
  );
  const drawGroup = {
    type: "group",
    children: [
      {
        type: "rect",
        transition: ["shape"],
        shape: durationBar,
        style: api.style(),
      },
    ],
  } as { type: string; children: any[] };

  if (SHOW_ICONS) {
    const iconPaths = (api.value(5) as string).split("|");
    for (let i = 0; i < iconPaths.length; i++) {
      const iconDrawObject = {
        type: "image",
        style: {
          image: iconPaths[i],
          x: 0,
          y: 0,
          width: iconSize,
          height: iconSize,
        },
        position: [start[0] + i * iconSize, yPos],
      };
      drawGroup.children.push(iconDrawObject);
    }
  }
  return drawGroup as CustomSeriesRenderItemReturn;
};

function filterStatusEffects(
  buff: StatusEffect,
  id: number,
  statusEffects: Map<string, Map<number, StatusEffect>>
) {
  // Party synergies
  if (
    ["classskill", "identity", "ability"].includes(buff.buffcategory) &&
    buff.target === StatusEffectTarget.PARTY
  ) {
    const key = `${getClassName(buff.source.skill?.classid)}_${
      buff.uniquegroup ? buff.uniquegroup : buff.source.skill?.name
    }`;
    addStatusEffect(statusEffects, key, id, buff);
  }
  // Self synergies
  else if (
    ["pet", "cook", "battleitem", "dropsofether", "bracelet"].includes(
      buff.buffcategory
    )
  ) {
    addStatusEffect(statusEffects, buff.buffcategory, id, buff);
  } else if (["set"].includes(buff.buffcategory)) {
    addStatusEffect(statusEffects, `set_${buff.source.setname}`, id, buff);
  } else if (
    ["classskill", "identity", "ability"].includes(buff.buffcategory)
  ) {
    // self & other identity, classskill, engravings
    let key;
    if (buff.buffcategory === "ability") {
      key = `${buff.uniquegroup ? buff.uniquegroup : id}`;
    } else {
      key = `${getClassName(buff.source.skill?.classid)}_${
        buff.uniquegroup ? buff.uniquegroup : buff.source.skill?.name
      }`;
    }
    addStatusEffect(statusEffects, key, id, buff);
  } else {
    // others
    const key = `${buff.buffcategory}_${
      buff.uniquegroup ? buff.uniquegroup : id
    }`;
    addStatusEffect(statusEffects, key, id, buff);
  }
}
function addStatusEffect(
  collection: Map<string, Map<number, StatusEffect>>,
  tableKey: string,
  buffId: number,
  statusEffect: StatusEffect
) {
  if (!isStatusEffectFiltered(statusEffect)) return;
  // Add status effect to collection
  if (collection.has(tableKey)) {
    collection.get(tableKey)?.set(buffId, statusEffect);
  } else {
    collection.set(tableKey, new Map([[buffId, statusEffect]]));
  }
}

function isStatusEffectFiltered(
  se: StatusEffect
) {
  if (se.bufftype === 0) return true;
  // Party synergies
  if (
    ["classskill", "identity", "ability"].includes(se.buffcategory) &&
    se.target === StatusEffectTarget.PARTY
  ) {
    if(settingsStore.settings.damageMeter.buffFilter['party'] & StatusEffectBuffTypeFlags.ANY)
      return true;
    return (
      (settingsStore.settings.damageMeter.buffFilter['party'] &
      se.bufftype) !== 0
    );
  } else if (
    ["classskill", "identity", "ability", "pet", "cook", "battleitem", "dropsofether", "bracelet", "set"].includes(se.buffcategory)
  ) {
    if(settingsStore.settings.damageMeter.buffFilter['self'] & StatusEffectBuffTypeFlags.ANY)
      return true;
    return (
      (settingsStore.settings.damageMeter.buffFilter['self'] &
      se.bufftype) !== 0
    );
  }
  return false;
}

interface CastGroupInfo {
  name: string;
  casts: CastInfo[];
  yAxisIndex: number;
  color: string;
}

interface CastInfo {
  from: number;
  to: number;
  icons: string[];
  names: string[];
  playerIdx: number;
  sourceName: string;
  targetName: string;
}

function prepare() {
  // these are the rows
  const yAxisNames: string[] = [];
  const castGroupInfos: CastGroupInfo[] = [];
  const groupKeyToRowIndexMap: Map<string, number> = new Map();
  const playerNames: string[] = [];

  playerAmount = entitiesCopy.length;
  entitiesCopy.forEach((e) => {
    playerNames.push(e.name);
    const playerIdx = playerNames.length - 1;
    const effectGroups: Map<string, Map<number, StatusEffect>> = new Map();
    e.statusEffectsGotten.forEach((seData, idx) => {
      const se =
        props.sessionState.damageStatistics.buffs.get(seData.id) ??
        props.sessionState.damageStatistics.debuffs.get(seData.id);
      if (!se) return;
      filterStatusEffects(se, seData.id, effectGroups);
    });

    // these are the different rows
    effectGroups.forEach((effectGroup, rowKey) => {
      let rowName: string | undefined = undefined;
      // group things that have same start time and duration
      const castInstanceGroups: StatusEffectCast[][] = [];
      // sorted instance array by starttime and duration
      const instanceCastsForGroup: StatusEffectCast[] = e.statusEffectsGotten
        .filter((val) => {
          return effectGroup.has(val.id);
        })
        .sort((a, b) => {
          if (a.started < b.started) {
            return -1;
          } else if (b.started < a.started) {
            return 1;
          } else {
            if (a.duration < b.duration) {
              return -1;
            } else if (b.duration < a.duration) {
              return 1;
            }
            return 0;
          }
        });

      let currentGroupStart: StatusEffectCast | undefined = undefined;
      let castGroup: StatusEffectCast[] = [];
      for (let idx = 0; idx < instanceCastsForGroup.length; idx++) {
        if (
          currentGroupStart === undefined ||
          (Math.abs(
            currentGroupStart.started - instanceCastsForGroup[idx].started
          ) > 20 &&
            currentGroupStart.sourceName ===
              instanceCastsForGroup[idx].sourceName &&
            currentGroupStart.targetName ===
              instanceCastsForGroup[idx].targetName)
        ) {
          currentGroupStart = instanceCastsForGroup[idx];
          castGroup = [currentGroupStart];
          castInstanceGroups.push(castGroup);
          continue;
        }
        castGroup.push(instanceCastsForGroup[idx]);
      }

      let rowIndex = groupKeyToRowIndexMap.get(rowKey);
      let castGroupInfo: CastGroupInfo | undefined;
      if (rowIndex === undefined) {
        effectGroup.forEach((effect) => {
          if (!rowName) {
            rowName = effect.source.skill?.name ?? effect.source.name;
          }
        });
        yAxisNames.push(rowName ?? "Unknown");
        rowIndex = yAxisNames.length - 1;
        groupKeyToRowIndexMap.set(rowKey, rowIndex);
      } else {
        rowName = yAxisNames[rowIndex];
      }
      castGroupInfo = {
        name: (rowName ?? "Unknown") + "_" + e.name,
        casts: [],
        yAxisIndex: rowIndex,
        color: settingsStore.getClassColor(getClassName(e.classId)),
      };
      // these are the different "columns"
      castInstanceGroups.forEach((castGroup) => {
        const buffIcons: string[] = [];
        let started = -1;
        let ended = -1;
        const effectNames: string[] = [];
        let sourceName = "Unknown";
        let targetName = "Unknown";
        castGroup.forEach((seCast) => {
          const buffInfo =
            props.sessionState.damageStatistics.buffs.get(seCast.id) ??
            props.sessionState.damageStatistics.debuffs.get(seCast.id);
          if (
            buffInfo?.source.name !== undefined &&
            !effectNames.includes(buffInfo?.source.name)
          ) {
            effectNames.push(buffInfo?.source.name);
          }
          if (buffInfo !== undefined) {
            buffIcons.push(getIconPath(buffInfo.source.icon));
          }
          if (started === -1 || started > seCast.started) {
            started = seCast.started;
          }
          if (ended === -1 || ended < seCast.started + seCast.duration) {
            ended = seCast.started + seCast.duration;
          }
          if (sourceName === "Unknown" && seCast.sourceName !== undefined) {
            sourceName = seCast.sourceName;
          }
          if (targetName === "Unknown" && seCast.targetName !== undefined) {
            targetName = seCast.targetName;
          }
        });
        castGroupInfo?.casts.push({
          from: started - props.sessionState.fightStartedOn,
          to: ended - props.sessionState.fightStartedOn,
          icons: buffIcons,
          names: effectNames,
          playerIdx: playerIdx,
          sourceName: sourceName,
          targetName: targetName,
        });
      });
      castGroupInfos.push(castGroupInfo);
    });
  });
  const seriesData: unknown[] = [];
  castGroupInfos.forEach((castGroupInfo: CastGroupInfo) => {
    castGroupInfo.casts.forEach((cast) => {
      cast.from = Math.max(cast.from, 0);
      cast.to = Math.min(cast.to, (props.sessionState.lastCombatPacket-props.sessionState.fightStartedOn));
      seriesData.push({
        name: castGroupInfo.name,
        value: [
          castGroupInfo.yAxisIndex,
          cast.from,
          cast.to,
          cast.to - cast.from,
          cast.names,
          cast.icons.join("|"),
          cast.playerIdx,
          cast.sourceName,
          cast.targetName,
        ],
        itemStyle: {
          normal: {
            color: castGroupInfo.color,
          },
        },
      });
    });
  });
  const series: SeriesOption[] = [
    {
      type: "custom",
      renderItem: renderItem,
      encode: {
        x: [1, 2],
        y: [0],
      },
      data: seriesData,
    },
  ];
  option.value = {
    responsive: true,
    tooltip: {
      trigger: "item",
      axisPointer: {
        type: "cross",
        label: {
          backgroundColor: "#6a7985",
        },
      },
      formatter: renderToolTip,
    },
    toolbox: {
      left: "left",
      itemSize: 25,
      top: 55,
      feature: {
        dataZoom: {
        },
        restore: {},
      },
    },
    dataZoom: [
      {
        type: "slider",
        filterMode: "weakFilter",
        showDataShadow: false,
      },
      {
        type: "inside",
        filterMode: "weakFilter",
      },
    ],
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    yAxis: {
      type: "category",
      data: yAxisNames,
    },
    xAxis: {
      min: 0,
      scale: true,
      axisLabel: {
        formatter: function (val: number) {
          return Math.floor(Math.max(0, val - 0) / 1000) + "s";
        },
      },
    },
    aria: {
      enabled: true,
      decal: {
        show: true,
      },
    },
    series: series,
  };
}
</script>
<style scoped>
.chart-container {
  flex-grow: 1;
  min-height: 0;
}
.chart-container > div {
  position: relative;
  height: 100%;
}
.chart-button {
  flex: 0 0 50px;
}
</style>
<style>
.damage-meter-table-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1 0 200px;
}
.page-container {
  display: flex;
  flex: 1 1 200px;
}
.log-view {
  display: flex;
  flex-direction: column;
  flex: 1 1 0px;
}
.logs-page-container {
  display: flex;
  min-height: 100%;
  min-width: 100%;
  position: absolute;
}
.button-container {
  display: flex;
  flex: 0 1 0px;
  align-items: center;
  justify-content: center;
}
</style>
