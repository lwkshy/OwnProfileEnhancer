import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

let observer: MutationObserver | undefined;
let animationFrame: number | undefined;
let lastHandledTabList: HTMLElement | null = null;
let lastHandledOwnProfile: HTMLElement | null = null;
const boardTabDisplay = new Map<HTMLElement, { value: string; priority: string }>();

const settings = definePluginSettings({
    hideOwnProfileEditor: {
        type: OptionType.BOOLEAN,
        description: "Open your profile with its styles editor collapsed.",
        default: true,
        onChange: scheduleSync
    },
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
    // Click Activity once per profile open, without interrupting the user's
    // later tab choices. Resets when the profile (and its tablist) changes.
    const activityTab = findTab("Activity");
    if (!activityTab) {
        lastHandledTabList = null;
        return;
    }

    const tabList = activityTab.closest<HTMLElement>('[role="tablist"]');
    if (tabList === lastHandledTabList) return;

    lastHandledTabList = tabList;
    activityTab.click();
}

function findStylesButton(label: string): HTMLElement | undefined {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
    return candidates.find(candidate => [
        candidate.getAttribute("aria-label"),
        candidate.getAttribute("data-tooltip-content"),
        candidate.getAttribute("title")
    ].some(value => value?.trim() === label));
}

function collapseOwnProfileEditor(): void {
    if (lastHandledOwnProfile && !document.body.contains(lastHandledOwnProfile)) {
        lastHandledOwnProfile = null;
    }

    const hideStylesButton = findStylesButton("Hide Styles");
    const showStylesButton = findStylesButton("Show Styles");
    const stylesButton = hideStylesButton ?? showStylesButton;
    const profile = stylesButton?.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]');

    if (!profile || profile === lastHandledOwnProfile) return;

    // Use Discord's native legacy toggle instead of changing panel styles. This
    // keeps the normal Show Styles button available for opening it again.
    lastHandledOwnProfile = profile;
    if (settings.store.hideOwnProfileEditor) hideStylesButton?.click();
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
        collapseOwnProfileEditor();
        syncBoardVisibility();
    });
}

export default definePlugin({
    name: "ProfileActivityFirst",
    description: "Opens profiles on Activity and collapses your styles editor by default.",
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
        collapseOwnProfileEditor();
        syncBoardVisibility();
    },

    stop() {
        observer?.disconnect();
        observer = undefined;

        if (animationFrame !== undefined) {
            cancelAnimationFrame(animationFrame);
            animationFrame = undefined;
        }

        lastHandledTabList = null;
        lastHandledOwnProfile = null;
        restoreBoardTabs();
    }
});
