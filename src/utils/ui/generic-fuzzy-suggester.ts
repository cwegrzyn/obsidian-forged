// This file is taken from the Obsidian BRAT plugin, at
// https://github.com/TfTHacker/obsidian42-brat/blob/60c83d083ed8e65943f52a9cd061a1fb47c8e5b0/src/ui/GenericFuzzySuggester.ts
//
// It is licensed under the MIT license, as per the original source, Copyright
// (c) 2023 TfTHacker.

import IronVaultPlugin from "index";
import { FuzzySuggestModal } from "obsidian";
import type { FuzzyMatch } from "obsidian";

/**
 * Simple interface for what should be displayed and stored for suggester
 */
export interface SuggesterItem {
  // displayed to user
  display: string;
  // supplmental info for the callback
  info: (() => void) | string;
}

/**
 * Generic suggester for quick reuse
 */
export class GenericFuzzySuggester extends FuzzySuggestModal<SuggesterItem> {
  data: SuggesterItem[] = [];
  callbackFunction!: (
    item: SuggesterItem,
    evt: MouseEvent | KeyboardEvent,
  ) => void;

  constructor(plugin: IronVaultPlugin) {
    super(plugin.app);
    this.scope.register(["Shift"], "Enter", (evt) => {
      this.enterTrigger(evt);
    });
    this.scope.register(["Ctrl"], "Enter", (evt) => {
      this.enterTrigger(evt);
    });
  }

  setSuggesterData(suggesterData: SuggesterItem[]): void {
    this.data = suggesterData;
  }

  display(
    callBack: (item: SuggesterItem, evt: MouseEvent | KeyboardEvent) => void,
  ) {
    this.callbackFunction = callBack;
    this.open();
  }

  getItems(): SuggesterItem[] {
    return this.data;
  }

  getItemText(item: SuggesterItem): string {
    return item.display;
  }

  onChooseItem(): void {
    return;
  }

  renderSuggestion(item: FuzzyMatch<SuggesterItem>, el: HTMLElement): void {
    el.createEl("div", { text: item.item.display });
  }

  enterTrigger(evt: KeyboardEvent): void {
    const selectedText = document.querySelector(
      ".suggestion-item.is-selected div",
    )?.textContent;
    const item = this.data.find((i) => i.display === selectedText);
    if (item) {
      this.invokeCallback(item, evt);
      this.close();
    }
  }

  onChooseSuggestion(
    item: FuzzyMatch<SuggesterItem>,
    evt: MouseEvent | KeyboardEvent,
  ): void {
    this.invokeCallback(item.item, evt);
  }

  invokeCallback(item: SuggesterItem, evt: MouseEvent | KeyboardEvent): void {
    if (typeof this.callbackFunction === "function") {
      (
        this.callbackFunction as (
          item: SuggesterItem,
          evt: MouseEvent | KeyboardEvent,
        ) => void
      )(item, evt);
    }
  }
}
