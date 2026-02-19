import type { Context } from "grammy";

// State map to track reasoning message status per chat
interface ReasoningState {
    messageId: number | null;
    deleteTimeout: NodeJS.Timeout | null;
}

const reasoningStates = new Map<number, ReasoningState>();

export async function handleReasoningPart(ctx: Context): Promise<void> {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        // Get or initialize state for this chat
        let state = reasoningStates.get(chatId);
        if (!state) {
            state = { messageId: null, deleteTimeout: null };
            reasoningStates.set(chatId, state);
        }

        // Clear existing reasoning delete timeout
        if (state.deleteTimeout) {
            clearTimeout(state.deleteTimeout);
            state.deleteTimeout = null;
        }

        if (!state.messageId) {
            // Send reasoning message
            const sentMessage = await ctx.reply("Reasoning...");
            state.messageId = sentMessage.message_id;
        }

        // Set timeout to delete message after 5 seconds
        state.deleteTimeout = setTimeout(async () => {
            try {
                const currentState = reasoningStates.get(chatId);
                if (currentState && currentState.messageId) {
                    await ctx.api.deleteMessage(chatId, currentState.messageId);
                    currentState.messageId = null;
                    currentState.deleteTimeout = null;
                    
                    // Cleanup map entry if empty
                    reasoningStates.delete(chatId);
                }
            } catch (error) {
                console.log("Error deleting reasoning message:", error);
            }
        }, 5000);

    } catch (error) {
        console.log("Error in reasoning part handler:", error);
    }
}