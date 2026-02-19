import type { Context } from "grammy";

// State map to track tool message status per chat
interface ToolState {
    messageId: number | null;
    deleteTimeout: NodeJS.Timeout | null;
}

const toolStates = new Map<number, ToolState>();

export async function handleToolPart(ctx: Context, part: any): Promise<void> {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        // Get or initialize state for this chat
        let state = toolStates.get(chatId);
        if (!state) {
            state = { messageId: null, deleteTimeout: null };
            toolStates.set(chatId, state);
        }

        // Clear existing tool delete timeout
        if (state.deleteTimeout) {
            clearTimeout(state.deleteTimeout);
            state.deleteTimeout = null;
        }

        if (!state.messageId && part.tool) {
            // Send tool name message
            const sentMessage = await ctx.reply(`🔧 ${part.tool}`);
            state.messageId = sentMessage.message_id;
        }

        // Set timeout to delete message after 2.5 seconds (half of 5 seconds)
        state.deleteTimeout = setTimeout(async () => {
            try {
                const currentState = toolStates.get(chatId);
                if (currentState && currentState.messageId) {
                    await ctx.api.deleteMessage(chatId, currentState.messageId);
                    currentState.messageId = null;
                    currentState.deleteTimeout = null;
                    
                    // Cleanup map entry if empty
                    toolStates.delete(chatId);
                }
            } catch (error) {
                console.log("Error deleting tool message:", error);
            }
        }, 2500);

    } catch (error) {
        console.log("Error in tool part handler:", error);
    }
}