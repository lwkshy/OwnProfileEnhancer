// Editor-only declarations for this standalone repository.
// Vencord supplies the real modules and richer types when the plugin is copied
// into its src/userplugins directory and built there.

declare module "@api/Settings" {
    export function definePluginSettings<T extends Record<string, unknown>>(settings: T): {
        store: {
            [K in keyof T]: T[K] extends { default: infer Value; } ? Value : unknown;
        };
    };
}

declare module "@utils/types" {
    export enum OptionType {
        BOOLEAN
    }

    interface PluginDefinition {
        name: string;
        description: string;
        authors: Array<{ name: string; id: bigint; }>;
        settings?: unknown;
        start?(): void;
        stop?(): void;
    }

    export default function definePlugin(plugin: PluginDefinition): PluginDefinition;
}
