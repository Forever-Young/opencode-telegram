import type { Context } from "grammy";
import { formatAsHtml } from "../utils.js";

// State map to track text streaming status per chat
interface TextStreamState {
    updateMessageId: number | null;
    lastUpdateTime: number;
    deleteTimeout: NodeJS.Timeout | null;
    latestText: string;
}

const streamStates = new Map<number, TextStreamState>();

export async function handleTextPart(ctx: Context, text: string): Promise<void> {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        // Get or initialize state for this chat
        let state = streamStates.get(chatId);
        if (!state) {
            state = {
                updateMessageId: null,
                lastUpdateTime: 0,
                deleteTimeout: null,
                latestText: ""
            };
            streamStates.set(chatId, state);
        }

        const now = Date.now();
        
        // Clear existing delete timeout
        if (state.deleteTimeout) {
            clearTimeout(state.deleteTimeout);
            state.deleteTimeout = null;
        }

        // Limit to last 50 lines to prevent Telegram message size issues
        const lines = text.split('\n');
        const limitedText = lines.length > 50 
            ? lines.slice(-50).join('\n')
            : text;

        // Store the latest text (formatted as HTML)
        state.latestText = formatAsHtml(limitedText);

        if (!state.updateMessageId) {
            // First message - send new message
            const sentMessage = await ctx.reply(state.latestText, { parse_mode: "HTML" });
            state.updateMessageId = sentMessage.message_id;
            state.lastUpdateTime = now; // Set time AFTER sending
        } else {
            // Throttle: Check if 2 seconds have passed since last update
            const timeSinceLastUpdate = now - state.lastUpdateTime;
            if (timeSinceLastUpdate < 2000) {
                // Skip this update (text is stored in latestText for later)
                // Set timeout to delete after 5 seconds of no new updates
                state.deleteTimeout = setTimeout(() => {
                    deleteTextMessage(chatId, ctx);
                }, 5000);
                return;
            }
            
            // Update immediately if enough time has passed
            await ctx.api.editMessageText(
                chatId,
                state.updateMessageId,
                state.latestText,
                { parse_mode: "HTML" }
            );
            state.lastUpdateTime = now; // Update time AFTER sending
        }

        // Set timeout to delete message after 5 seconds of no updates
        state.deleteTimeout = setTimeout(() => {
            deleteTextMessage(chatId, ctx);
        }, 5000);

    } catch (error) {
        console.log("Error in text part handler:", error);
    }
}

async function deleteTextMessage(chatId: number, ctx: Context): Promise<void> {
    try {
        const state = streamStates.get(chatId);
        if (state && state.updateMessageId) {
            await ctx.api.deleteMessage(chatId, state.updateMessageId);
            state.updateMessageId = null;
            state.deleteTimeout = null;
            
            // Cleanup map entry if empty
            streamStates.delete(chatId);
        }
    } catch (error) {
        console.log("Error deleting text message:", error);
    }
}