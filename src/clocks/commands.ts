import IronVaultPlugin from "index";
import { appendNodesToMoveOrMechanicsBlock } from "mechanics/editor";
import {
  createClockCreationNode,
  createClockNode,
} from "mechanics/node-builders";
import { App, Editor, MarkdownView, stringifyYaml } from "obsidian";
import { IronVaultPluginSettings } from "settings";
import {
  ClockFileAdapter,
  ClockIndex,
  clockUpdater,
} from "../clocks/clock-file";
import { selectClock } from "../clocks/select-clock";
import { BLOCK_TYPE__CLOCK } from "../constants";
import { getExistingOrNewFolder, vaultProcess } from "../utils/obsidian";
import { CustomSuggestModal } from "../utils/suggest";
import { Clock } from "./clock";
import { ClockCreateModal } from "./clock-create-modal";

export async function advanceClock(
  app: App,
  settings: IronVaultPluginSettings,
  editor: Editor,
  view: MarkdownView,
  clockIndex: ClockIndex,
) {
  // TODO: clearly we should have something like this checking the indexer
  // if (!datastore.ready) {
  //   console.warn("data not ready");
  //   return;
  // }
  const [clockPath, clockInfo] = await selectClock(
    clockIndex,
    app,
    ([, clockInfo]) => clockInfo.clock.active && !clockInfo.clock.isFilled,
  );

  const ticks = await CustomSuggestModal.select(
    app,
    Array(clockInfo.clock.ticksRemaining())
      .fill(0)
      .map((_, i) => i + 1),
    (num) => num.toString(),
    undefined,
    "Select number of segments to fill.",
  );

  const newClock = await clockUpdater(
    vaultProcess(app, clockPath),
    (clockAdapter) => {
      return clockAdapter.updatingClock((clock) => clock.tick(ticks));
    },
  );

  appendNodesToMoveOrMechanicsBlock(
    editor,
    createClockNode(clockPath, clockInfo, newClock.clock),
  );
}

export async function createClock(
  plugin: IronVaultPlugin,
  editor: Editor,
): Promise<void> {
  const clockInput: {
    targetFolder: string;
    fileName: string;
    name: string;
    clock: Clock;
  } = await new Promise((onAccept, onReject) => {
    new ClockCreateModal(
      plugin.app,
      { targetFolder: plugin.settings.defaultClockFolder },
      onAccept,
      onReject,
    ).open();
  });

  const clock =
    ClockFileAdapter.newFromClock(clockInput).expect("invalid clock");

  const clockFolder = await getExistingOrNewFolder(
    plugin.app,
    clockInput.targetFolder,
  );

  // TODO: figure out the templating for this
  const file = await plugin.app.fileManager.createNewFile(
    clockFolder,
    clockInput.fileName,
    "md",
    `---\n${stringifyYaml(clock.raw)}\n---\n\n\`\`\`${BLOCK_TYPE__CLOCK}\n\`\`\`\n\n`,
  );

  appendNodesToMoveOrMechanicsBlock(
    editor,
    createClockCreationNode(clockInput.name, file.path),
  );
}
