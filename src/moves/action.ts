import { Move, MoveActionRoll, MoveProgressRoll } from "@datasworn/core";
import {
  stringifyYaml,
  type App,
  type Editor,
  type FuzzyMatch,
  type MarkdownView,
} from "obsidian";
import { CharacterContext, type CharacterTracker } from "../character-tracker";
import { momentumOps, movesReader, rollablesReader } from "../characters/lens";
import { type Datastore } from "../datastore";
import { ProgressIndex, ProgressTrackFileAdapter } from "../tracks/progress";
import { selectProgressTrack } from "../tracks/select";
import { randomInt } from "../utils/dice";
import { vaultProcess } from "../utils/obsidian";
import { CustomSuggestModal } from "../utils/suggest";
import { checkForMomentumBurn } from "./action-modal";
import {
  type ActionMoveDescription,
  type MoveDescription,
  type ProgressMoveDescription,
} from "./desc";
import { ActionMoveWrapper } from "./wrapper";

enum MoveKind {
  Progress = "Progress",
  Action = "Action",
  Other = "Other",
}

// interface BaseMoveSpecifier {
//   move: Move;
//   kind: MoveKind;
// }

// interface ProgressMoveSpecifier extends BaseMoveSpecifier {
//   kind: MoveKind.Progress;
//   progressTrack: string;
// }

// interface ActionMoveSpecifier extends BaseMoveSpecifier {
//   kind: MoveKind.Action;
//   stat: string;
// }

function getMoveKind(move: Move): MoveKind {
  switch (move.roll_type) {
    case "action_roll":
      return MoveKind.Action;
    case "progress_roll":
      return MoveKind.Progress;
    case "special_track":
    case "no_roll":
      return MoveKind.Other;
    default:
      throw new Error(
        `unexpected roll type ${(move as Move).roll_type} on move id ${
          (move as Move).id
        }`,
      );
  }
}
const promptForMove = async (app: App, moves: Move[]): Promise<Move> =>
  await CustomSuggestModal.select(
    app,
    moves,
    (move) => move.name,
    ({ item: move, match }: FuzzyMatch<Move>, el: HTMLElement) => {
      const moveKind = getMoveKind(move);
      el.createEl("small", {
        text: `(${moveKind}) ${move.trigger.text}`,
        cls: "forged-suggest-hint",
      });
    },
  );

function processActionMove(
  move: Move,
  stat: string,
  statVal: number,
  adds: number,
): ActionMoveDescription {
  return {
    name: move.name,
    action: randomInt(1, 6),
    stat,
    statVal,
    adds,
    challenge1: randomInt(1, 10),
    challenge2: randomInt(1, 10),
  };
}

function processProgressMove(
  move: Move,
  trackerPath: string,
  tracker: ProgressTrackFileAdapter,
): ProgressMoveDescription {
  return {
    name: move.name,
    progressTrack: `[[${trackerPath}]]`,
    progressTicks: tracker.track.progress,
    challenge1: randomInt(1, 10),
    challenge2: randomInt(1, 10),
  };
}

function moveTemplate(move: MoveDescription): string {
  return `\`\`\`move\n${stringifyYaml(move)}\n\`\`\`\n\n`;
}

export function validAdds(baseStat: number): number[] {
  const adds = [];
  for (let add = 0; 1 + baseStat + add <= 10; add++) {
    adds.push(add);
  }
  return adds;
}

export async function runMoveCommand(
  app: App,
  datastore: Datastore,
  progressIndex: ProgressIndex,
  characters: CharacterTracker,
  editor: Editor,
  view: MarkdownView,
): Promise<void> {
  if (view.file?.path == null) {
    console.error("No file for view. Why?");
    return;
  }

  if (characters.size === 0) {
    console.error("No characters found");
    return;
  }
  const [[characterPath, context]] = characters.validCharacterEntries();

  const { character, lens } = context;

  const characterMoves = movesReader(lens, datastore.index)
    .get(character)
    .expect("unexpected failure finding assets for moves");

  const allMoves = datastore.moves.concat(characterMoves);

  const move = await promptForMove(
    app,
    allMoves.sort((a, b) => a.name.localeCompare(b.name)),
  );
  switch (move.roll_type) {
    case "action_roll": {
      await handleActionRoll(context, app, move, characterPath, editor);
      break;
    }
    case "progress_roll": {
      await handleProgressRoll(app, progressIndex, move, editor);
      break;
    }
    case "no_roll":
    case "special_track":
    default:
      console.warn(
        "Teach me how to handle a move with roll type %s: %o",
        move.roll_type,
        move,
      );
  }
}

async function handleProgressRoll(
  app: App,
  progressIndex: ProgressIndex,
  move: MoveProgressRoll,
  editor: Editor,
) {
  const progressTrack = await selectProgressTrack(
    progressIndex,
    app,
    ([, prog]) =>
      prog.trackType == move.tracks.category && !prog.track.complete,
  );
  const description = processProgressMove(
    move,
    progressTrack[0],
    progressTrack[1],
  );
  // TODO: when would we mark complete? should we prompt on a hit?
  editor.replaceSelection(moveTemplate(description));
}

// TODO: refactor this so it returns the description and handle the other parts separately?
async function handleActionRoll(
  charContext: CharacterContext,
  app: App,
  move: MoveActionRoll,
  characterPath: string,
  editor: Editor,
) {
  const { lens, character } = charContext;
  const stat = await CustomSuggestModal.select(
    app,
    rollablesReader(lens).get(character),
    (m) => `${m.definition.label}: ${m.value ?? "missing (defaults to 0)"}`,
  );

  const adds = await CustomSuggestModal.select(
    app,
    validAdds(stat.value ?? 0),
    (n) => n.toString(10),
  );
  let description = processActionMove(move, stat.key, stat.value ?? 0, adds);
  const wrapper = new ActionMoveWrapper(description);
  description = await checkForMomentumBurn(
    app,
    move as MoveActionRoll,
    wrapper,
    charContext,
  );
  if (description.burn) {
    await charContext.updater(
      vaultProcess(app, characterPath),
      (character, { lens }) => momentumOps(lens).reset(character),
    );
  }
  editor.replaceSelection(moveTemplate(description));
}
