import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

let observer: MutationObserver | undefined;
let animationFrame: number | undefined;
let editorWasHandled = false;
const boardTabDisplay = new Map<HTMLElement, { value: string; priority: string }>();

const settings = definePluginSettings({
    hideBoardOnOwnProfile: {
        type: OptionType.BOOLEAN,
        description: "Completely hide the Board tab in your profile editor.",
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

function isTabOnOwnProfile(tab?: HTMLElement): boolean {
    const container = tab?.closest<HTMLElement>('[role="dialog"], [class*="userProfile"], [class*="profile"], [class*="root"]') ?? document.body;
    const containerText = container?.innerText ?? "";
    const bodyText = document.body?.innerText ?? "";

    if (
        containerText.includes("Note (only visible to you)") ||
        containerText.includes("(only visible to you)") ||
        containerText.includes("Add Connection") ||
        containerText.includes("Add pronouns")
    ) {
        return true;
    }

    if (
        bodyText.includes("Avatar & Decoration") &&
        bodyText.includes("Theme & Banner")
    ) {
        return true;
    }

    return false;
}

function isOwnProfileOpen(): boolean {
    const text = document.body?.innerText ?? "";
    return (
        (text.includes("Avatar & Decoration") && text.includes("Theme & Banner")) ||
        text.includes("Note (only visible to you)") ||
        text.includes("(only visible to you)") ||
        text.includes("Add Connection") ||
        text.includes("Add pronouns")
    );
}

function selectActivityOnOpen(): void {
    if (!isOwnProfileOpen()) {
        editorWasHandled = false;
        return;
    }

    // Run only once each time the profile opens, without interrupting
    // the user's later tab choices.
    if (editorWasHandled) return;

    const activityTab = findTab("Activity");
    if (!activityTab) return;

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
    const shouldHideBoard = settings.store.hideBoardOnOwnProfile && isOwnProfileOpen();
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
        if (!isTabOnOwnProfile(boardTab)) continue;

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
    description: "Opens your profile editor on Activity and can hide its Board tab.",
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
