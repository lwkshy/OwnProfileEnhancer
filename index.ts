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

function findTab(label: string): HTMLElement | undefined {
    const explicitTabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    const explicitMatch = explicitTabs.find(element => element.innerText.trim() === label);
    if (explicitMatch) return explicitMatch;

    // Fallback for Discord builds that render the tablist without role="tab".
    const tabLists = Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]'));
    for (const tabList of tabLists) {
        const candidates = Array.from(tabList.querySelectorAll<HTMLElement>('button, [tabindex], [role]'));
        const match = candidates.find(element => element.innerText.trim() === label);
        if (match) return match;
    }

    return undefined;
}

function isProfileEditorOpen(): boolean {
    // Keep this limited to Discord's profile-customization editor.
    const text = document.body?.innerText ?? "";
    return text.includes("Avatar & Decoration") && text.includes("Theme & Banner");
}

function selectActivityOnOpen(): void {
    if (!isProfileEditorOpen()) {
        editorWasHandled = false;
        return;
    }

    // Run only once each time the profile editor opens, without interrupting
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
    const shouldHideBoard = settings.store.hideBoardOnOwnProfile && isProfileEditorOpen();
    if (!shouldHideBoard) {
        restoreBoardTabs();
        return;
    }

    const boardTab = findTab("Board");
    if (!boardTab || boardTabDisplay.has(boardTab)) return;

    boardTabDisplay.set(boardTab, {
        value: boardTab.style.getPropertyValue("display"),
        priority: boardTab.style.getPropertyPriority("display")
    });
    boardTab.style.setProperty("display", "none", "important");

    // If the setting is enabled while Board is open, leave the user on a
    // visible tab rather than an otherwise empty Board pane.
    if (boardTab.getAttribute("aria-selected") === "true") {
        findTab("Activity")?.click();
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
