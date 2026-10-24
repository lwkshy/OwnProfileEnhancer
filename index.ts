import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

let observer: MutationObserver | undefined;
let animationFrame: number | undefined;
let editorWasHandled = false;
const boardTabDisplay = new Map<HTMLElement, { value: string; priority: string }>();

const settings = definePluginSettings({
    hideBoard: {
        type: OptionType.BOOLEAN,
        description: "Completely hide the Board tab in profiles.",
        default: false,
        onChange: scheduleSync
    }
});

function findTabs(label: string): HTMLElement[] {
    const tabs: HTMLElement[] = [];
    const explicitTabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    for (const tab of explicitTabs) {
        if (tab.innerText.trim() === label) tabs.push(tab);
    }
    if (tabs.length > 0) return tabs;

    // Fallback for Discord builds that render the tablist without role="tab".
    const tabLists = Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]'));
    for (const tabList of tabLists) {
        const candidates = Array.from(tabList.querySelectorAll<HTMLElement>('button, [tabindex], [role]'));
        for (const candidate of candidates) {
            if (candidate.innerText.trim() === label) tabs.push(candidate);
        }
    }

    return tabs;
}

function findTab(label: string): HTMLElement | undefined {
    return findTabs(label)[0];
}

function selectActivityOnOpen(): void {
    // Run only once each time a profile is open, without interrupting
    // the user's later tab choices.
    if (editorWasHandled) return;

    const activityTab = findTab("Activity");
    if (!activityTab) {
        editorWasHandled = false;
        return;
    }

    editorWasHandled = true;
    activityTab.click();
}

function restoreBoardTabs(): void {
    for (const [tab, display] of boardTabDisplay) {
        tab.style.setProperty("display", display.value, display.priority);
    }

    boardTabDisplay.clear();
}

function syncBoardVisibility(): void {
    const shouldHideBoard = settings.store.hideBoard;
    if (!shouldHideBoard) {
        restoreBoardTabs();
        return;
    }

    // Clean up stale detached tabs
    for (const [tab] of boardTabDisplay) {
        if (!document.body.contains(tab)) {
            boardTabDisplay.delete(tab);
        }
    }

    const boardTabs = findTabs("Board");
    for (const boardTab of boardTabs) {
        if (!boardTabDisplay.has(boardTab)) {
            boardTabDisplay.set(boardTab, {
                value: boardTab.style.getPropertyValue("display"),
                priority: boardTab.style.getPropertyPriority("display")
            });
        }

        if (boardTab.style.display !== "none") {
            boardTab.style.setProperty("display", "none", "important");
        }

        // If the setting is enabled while Board is selected, switch to Activity
        if (boardTab.getAttribute("aria-selected") === "true") {
            findTab("Activity")?.click();
        }
    }
}

function scheduleSync(): void {
    if (animationFrame !== undefined) return;
    animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined;
        selectActivityOnOpen();
        syncBoardVisibility();
    });
}

export default definePlugin({
    name: "ProfileActivityFirst",
    description: "Opens any profile on Activity and can hide its Board tab.",
    authors: [{ name: "lwkshy", id: 0n }],
    settings,

    start() {
        observer = new MutationObserver(scheduleSync);
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        selectActivityOnOpen();
        syncBoardVisibility();
    },

    stop() {
        observer?.disconnect();
        observer = undefined;

        if (animationFrame !== undefined) {
            cancelAnimationFrame(animationFrame);
            animationFrame = undefined;
        }

        editorWasHandled = false;
        restoreBoardTabs();
    }
});
