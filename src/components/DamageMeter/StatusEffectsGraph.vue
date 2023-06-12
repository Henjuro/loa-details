<template>
  <div class="entity-bar">
    <q-toggle
      v-for="player of players"
      v-bind:key="player.name"
      :label="player.name"
      v-model="playerNameList"
      :val="player.name"
    >
    </q-toggle>
  </div>
  <div class="chart-container">
    <v-chart
      :ref="(el:EChartsType) => {chartRef = el;}"
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
import { onMounted, PropType, ShallowRef, shallowRef, watch } from "vue";
import VChart from "vue-echarts";
import { EntityExtended, getClassName, getIconPath } from "src/util/helpers";
import { useSettingsStore } from "stores/settings";
import {
  GameState,
  StatusEffect,
  StatusEffectBuffTypeFlags,
  StatusEffectCast,
  StatusEffectTarget,
} from "meter-core/logger/data";
import type {
  TooltipFormatterCallback,
  TopLevelFormatterParams,
} from "echarts/types/dist/shared";
import type {
  CustomSeriesRenderItem,
  CustomSeriesOption,
  CustomSeriesRenderItemReturn,
  EChartsOption,
  EChartsType,
} from "echarts";

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

const option = shallowRef<EChartsOption>({});
const initOptions = shallowRef({ renderer: "canvas" });
const players: ShallowRef<EntityExtended[]> = shallowRef([]);
let chartRef: EChartsType | undefined = undefined;
const playerNameList: ShallowRef<string[]> = shallowRef([]);
let displayedAmount = 0;
//let lastSelectedStat: {[name: string]: boolean} = {};
// where in the series collection is this player
let playerNameToDataIndexMap: Map<string, number> = new Map();
// where in the displayed players is this player
// based on his data position
let playerDataIndexToDisplayIndexMap: Map<number, number> = new Map();
let playerNameToSeriesMap: Map<string, CustomSeriesOption> = new Map();
let baseYAxisCategories: string[] = [];
let baseYAxisIndexToDisplayIndexMap: Map<number, number> = new Map();

function prepareExistingEntities() {
  players.value = Array.from(props.sessionState?.entities.values()).filter(
    (e) => e.isPlayer && e.damageInfo.damageDealt > 0
  );
  players.value.sort(
    (a, b) => a.damageInfo.damageDealt - b.damageInfo.damageDealt
  );
  entitiesCopy = players.value;
}

watch(props, () => {
  prepareExistingEntities();
  prepareChartData();
  createAndUpdateDisplayedData(playerNameList.value);
});
onMounted(() => {
  prepareExistingEntities();
  prepareChartData();
  createAndUpdateDisplayedData(playerNameList.value);
});
watch(playerNameList, () => {
  createAndUpdateDisplayedData(playerNameList.value);
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
  const comment = params.value[9] as string;
  const buffId = params.value[10] as number;
  let pics = "";
  iconPaths.forEach((val) => {
    pics += `<image src="${val}"/>`;
  });
  let tooltip =
    pics +
    `</br>Names: ${buffNames.join(", ")}` +
    `</br>Duration: ${((params.value[3] as number) / 1000).toFixed(
      1
    )}s</br>Source: ${sourceName}</br>Target: ${targetName}` +
    `</br>Comment: ${comment}` +
    `</br>BuffId: ${buffId}`;
  return tooltip;
};

const renderItem: CustomSeriesRenderItem = (params, api) => {
  const SHOW_ICONS = false;
  // value[playerIdx, startTime, endTime, duration]
  if (params.coordSys.type !== "cartesian2d") return;
  if (displayedAmount < 1) return;
  const coordSys =
    params.coordSys as unknown as CustomSeriesRenderItemParamsCoordSysCartesian2D;
  const baseCategoryIndex = api.value(0) as number;
  const categoryIndex = baseYAxisIndexToDisplayIndexMap.get(baseCategoryIndex);
  if (categoryIndex === undefined) return;
  const start = api.coord([api.value(1), categoryIndex]);
  const end = api.coord([api.value(2), categoryIndex]);
  const playerIdx = api.value(6) as number;
  if (api.size === undefined) return;
  const sizeResult = api.size([0, 1]) as number[];
  const barPercent = 0.8;
  const height = (sizeResult[1] * barPercent) / displayedAmount;
  const iconSize = height * 0.8;
  const displayIdx = playerDataIndexToDisplayIndexMap.get(playerIdx);
  if (displayIdx === undefined) return;
  const yPos =
    start[1] -
    sizeResult[1] / 2 +
    height * displayIdx +
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
        style: {
          fill: api.visual("color"),
        },
      },
    ],
  } as { type: string; children: unknown[] };

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
  const key = buff.source.skill?.name ?? buff.source.name;
  addStatusEffect(statusEffects, key, id, buff);
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

function isStatusEffectFiltered(se: StatusEffect) {
  if (se.bufftype === 0) return true;
  // Party synergies
  if (
    ["classskill", "identity", "ability"].includes(se.buffcategory) &&
    se.target === StatusEffectTarget.PARTY
  ) {
    if (
      settingsStore.settings.damageMeter.buffFilter["party"] &
      StatusEffectBuffTypeFlags.ANY
    )
      return true;
    return (
      (settingsStore.settings.damageMeter.buffFilter["party"] & se.bufftype) !==
      0
    );
  } else if (
    [
      "classskill",
      "identity",
      "ability",
      "pet",
      "cook",
      "battleitem",
      "dropsofether",
      "bracelet",
      "set",
    ].includes(se.buffcategory)
  ) {
    if (
      settingsStore.settings.damageMeter.buffFilter["self"] &
      StatusEffectBuffTypeFlags.ANY
    )
      return true;
    return (
      (settingsStore.settings.damageMeter.buffFilter["self"] & se.bufftype) !==
      0
    );
  }
  return false;
}
interface PlayerSeries {
  name: string;
  playerDataIdx: number;
  color: string;
  castGroupInfos: CastGroupInfo[];
}

interface CastGroupInfo {
  name: string;
  casts: CastInfo[];
  yAxisIndex: number;
  yAxisName: string;
}

interface CastInfo {
  from: number;
  to: number;
  icons: string[];
  names: string[];
  sourceName: string;
  targetName: string;
  buffComment: string;
  buffId: number;
}

function prepareChartData() {
  // these are the rows
  playerNameToSeriesMap.clear();
  const playerSeriesDatas: PlayerSeries[] = [];
  const yAxisNames: string[] = [];

  const groupKeyToRowIndexMap: Map<string, number> = new Map();
  const playerNames: string[] = [];

  entitiesCopy.forEach((e) => {
    playerNames.push(e.name);
    const playerDataIndex = playerNames.length - 1;
    playerNameToDataIndexMap.set(e.name, playerDataIndex);
    const playerSeries: PlayerSeries = {
      name: e.name,
      playerDataIdx: playerDataIndex,
      color: settingsStore.getClassColor(getClassName(e.classId)),
      castGroupInfos: [],
    };
    const effectGroups: Map<string, Map<number, StatusEffect>> = new Map();
    e.statusEffectsGotten.forEach((seData) => {
      const se =
        props.sessionState.damageStatistics.buffs.get(seData.id) ??
        props.sessionState.damageStatistics.debuffs.get(seData.id);
      if (!se) return;
      filterStatusEffects(se, seData.id, effectGroups);
    });

    // these are the different rows
    effectGroups.forEach((effectGroup, rowKey) => {
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
          Math.abs(
            currentGroupStart.started - instanceCastsForGroup[idx].started
          ) > 20 ||
          currentGroupStart.sourceName !==
            instanceCastsForGroup[idx].sourceName ||
          currentGroupStart.targetName !== instanceCastsForGroup[idx].targetName
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
        yAxisNames.push(rowKey);
        rowIndex = yAxisNames.length - 1;
        groupKeyToRowIndexMap.set(rowKey, rowIndex);
      }
      castGroupInfo = {
        name: rowKey + "_" + e.name,
        casts: [],
        yAxisIndex: rowIndex,
        yAxisName: rowKey,
      };
      // these are the different "columns"
      castInstanceGroups.forEach((castGroup) => {
        const buffIcons: string[] = [];
        let started = -1;
        let ended = -1;
        const effectNames: string[] = [];
        let sourceName = "";
        let targetName = "";
        let buffComment = "";
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
            const iconPath = getIconPath(buffInfo.source.icon);
            if (!buffIcons.includes(iconPath)) buffIcons.push(iconPath);
            if (!buffComment.includes(buffInfo.source.desc)) {
              if (buffComment.length > 0) buffComment += "</br>";
              buffComment += buffInfo.source.desc;
            }
          }
          if (started === -1 || started > seCast.started) {
            started = seCast.started;
          }
          if (ended === -1 || ended < seCast.started + seCast.duration) {
            ended = seCast.started + seCast.duration;
          }
          if (seCast.sourceName !== undefined) {
            if (!sourceName.includes(seCast.sourceName)) {
              if (sourceName.length > 0) sourceName += "</br>";
              sourceName += seCast.sourceName;
            }
          }
          if (seCast.targetName !== undefined) {
            if (!targetName.includes(seCast.targetName)) {
              if (targetName.length > 0) targetName += "</br>";
              targetName += seCast.targetName;
            }
          }
        });
        castGroupInfo?.casts.push({
          from: started - props.sessionState.fightStartedOn,
          to: ended - props.sessionState.fightStartedOn,
          icons: buffIcons,
          names: effectNames,
          sourceName: sourceName,
          targetName: targetName,
          buffComment: buffComment,
          buffId: castGroup[0].id,
        });
      });
      playerSeries.castGroupInfos.push(castGroupInfo);
    });
    playerSeriesDatas.push(playerSeries);
  });

  playerSeriesDatas.forEach((playerSeries: PlayerSeries) => {
    const seriesData: GraphSeriesData[] = [];
    playerSeries.castGroupInfos.forEach((castGroupInfo: CastGroupInfo) => {
      castGroupInfo.casts.forEach((cast) => {
        cast.from = Math.max(cast.from, 0);
        cast.to = Math.min(
          cast.to,
          props.sessionState.lastCombatPacket -
            props.sessionState.fightStartedOn
        );
        seriesData.push({
          name: castGroupInfo.name,
          value: [
            castGroupInfo.yAxisIndex,
            cast.from,
            cast.to,
            cast.to - cast.from,
            cast.names,
            cast.icons.join("|"),
            playerSeries.playerDataIdx,
            cast.sourceName,
            cast.targetName,
            cast.buffComment,
            cast.buffId,
            castGroupInfo.yAxisName,
          ],
        });
      });
    });
    const series: CustomSeriesOption = {
      type: "custom",
      name: playerSeries.name,
      renderItem: renderItem,
      encode: {
        x: [1, 2],
        y: [11],
      },
      itemStyle: {
        color: playerSeries.color,
      },
      data: seriesData,
    };
    playerNameToSeriesMap.set(playerSeries.name, series);
  });

  baseYAxisCategories = yAxisNames;

  const selectedPlayerNames: string[] = [];
  for (let n of playerNames) {
    if (props.sessionState.localPlayer === n) {
      selectedPlayerNames.push(n);
    }
  }
  playerNameList.value = selectedPlayerNames;
}

function createAndUpdateDisplayedData(selectedPlayerNames: string[]) {
  // filter categories and create index map from base array to filtered array
  const newCategories: string[] = [];
  baseYAxisIndexToDisplayIndexMap.clear();
  for (const [playerName, playerSeries] of playerNameToSeriesMap) {
    if (!selectedPlayerNames.includes(playerName)) continue;
    const graphData = playerSeries.data as GraphSeriesData[];
    for (const graphEntry of graphData) {
      const oldCategoryIndex = graphEntry.value[0];
      if (!baseYAxisIndexToDisplayIndexMap.has(oldCategoryIndex)) {
        const categoryName = baseYAxisCategories[oldCategoryIndex];
        baseYAxisIndexToDisplayIndexMap.set(
          oldCategoryIndex,
          newCategories.length
        );
        newCategories.push(categoryName);
      }
    }
  }
  const seriesCollection: CustomSeriesOption[] = [];
  for (const [playerName, playerSeries] of playerNameToSeriesMap) {
    if (!selectedPlayerNames.includes(playerName)) continue;
    seriesCollection.push(playerSeries);
  }
  // create map from base player position to display position
  let displayIdx = 0;
  playerDataIndexToDisplayIndexMap.clear();
  for (const [playerName] of playerNameToSeriesMap) {
    if (!selectedPlayerNames.includes(playerName)) continue;
    const playerDataIdx = playerNameToDataIndexMap.get(playerName);
    if (playerDataIdx === undefined) {
      console.error(
        "Could not get DataIdx for",
        playerName,
        "skipping player."
      );
      continue;
    }
    playerDataIndexToDisplayIndexMap.set(playerDataIdx, displayIdx++);
  }

  displayedAmount = seriesCollection.length;
  option.value = buildOption(seriesCollection);
}

function buildOption(seriesCollection: CustomSeriesOption[]): EChartsOption {
  return {
    responsive: true,
    animation: true,
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
        dataZoom: {},
        restore: {},
      },
    },
    legend: {
      show: false,
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
      left: "10%",
      right: "10%",
      bottom: "10%",
      containLabel: true,
    },
    yAxis: {
      type: "category",
    },
    xAxis: {
      min: 0,
      scale: true,
      axisLabel: {
        formatter: function (val: number) {
          return `${Math.floor(Math.max(0, val - 0) / 1000)}s`;
        },
      },
    },
    aria: {
      enabled: true,
      decal: {
        show: true,
      },
    },
    plotOptions: {
      series: {
        grouping: false,
      },
    },
    series: seriesCollection,
  };
}

interface GraphSeriesData {
  name: string;
  value: [
    number,
    number,
    number,
    number,
    string[],
    string,
    number,
    string,
    string,
    string,
    number,
    string
  ];
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
