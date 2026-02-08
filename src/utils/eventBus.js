/**
 * Event Bus
 * Internal event emitter for decoupled cog-to-cog communication
 * Replaces direct require() calls between cogs
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Allow many cog listeners
    }

    /**
     * Emit an event with error handling
     * @param {string} event - Event name
     * @param  {...any} args - Event arguments
     */
    safeEmit(event, ...args) {
        try {
            this.emit(event, ...args);
        } catch (error) {
            console.error(`[EventBus] Error in event "${event}":`, error);
        }
    }

    /**
     * Subscribe to an event with error handling wrapper
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    safeOn(event, handler) {
        this.on(event, async (...args) => {
            try {
                await handler(...args);
            } catch (error) {
                console.error(`[EventBus] Error handling "${event}":`, error);
            }
        });
    }

    /**
     * Remove all listeners and clean up
     */
    cleanup() {
        this.removeAllListeners();
    }
}

// Singleton instance
const bus = new EventBus();

// Event names constants for type safety
const Events = {
    // Ticket events
    TICKET_CREATED: 'ticket:created',
    TICKET_CLOSED: 'ticket:closed',
    TICKET_CLAIMED: 'ticket:claimed',
    TICKET_GURU_MESSAGE: 'ticket:guruMessage',
    
    // Moderation events
    BAN_ISSUED: 'moderation:ban',
    KICK_ISSUED: 'moderation:kick',
    WARN_ISSUED: 'moderation:warn',
    MUTE_ISSUED: 'moderation:mute',
    
    // Whitelist events
    WHITELIST_ADDED: 'whitelist:added',
    WHITELIST_REMOVED: 'whitelist:removed',
    
    // Application events
    APPLICATION_SUBMITTED: 'application:submitted',
    APPLICATION_APPROVED: 'application:approved',
    APPLICATION_DENIED: 'application:denied',
    
    // Staff events
    STAFF_ONLINE: 'staff:online',
    STAFF_OFFLINE: 'staff:offline',
    
    // Account linking
    ACCOUNT_LINKED: 'account:linked',
    ACCOUNT_UNLINKED: 'account:unlinked',
    
    // Server events
    SERVER_RESTART: 'server:restart',
    PLAYER_JOIN: 'player:join',
    PLAYER_LEAVE: 'player:leave'
};

module.exports = {
    bus,
    Events,
    // Convenience methods
    emit: (event, ...args) => bus.safeEmit(event, ...args),
    on: (event, handler) => bus.safeOn(event, handler),
    once: (event, handler) => bus.once(event, handler),
    off: (event, handler) => bus.off(event, handler),
    cleanup: () => bus.cleanup()
};
