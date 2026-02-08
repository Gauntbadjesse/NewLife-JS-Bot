/**
 * Interaction Router
 * Centralized handler for all Discord interactions (buttons, modals, select menus)
 * Eliminates duplicate requires and provides cleaner error handling
 */

const { logError } = require('./errorLogger');
const emojis = require('./emojis');

// Handler registries
const buttonHandlers = new Map();
const modalHandlers = new Map();
const selectMenuHandlers = new Map();
const autocompleteHandlers = new Map();

/**
 * Register a button handler
 * @param {string} prefix - Button customId prefix to match
 * @param {Function} handler - Handler function(interaction, client)
 */
function registerButton(prefix, handler) {
    buttonHandlers.set(prefix, handler);
}

/**
 * Register a modal handler
 * @param {string} prefix - Modal customId prefix to match
 * @param {Function} handler - Handler function(interaction, client)
 */
function registerModal(prefix, handler) {
    modalHandlers.set(prefix, handler);
}

/**
 * Register a select menu handler
 * @param {string} prefix - Select menu customId prefix to match
 * @param {Function} handler - Handler function(interaction, client)
 */
function registerSelectMenu(prefix, handler) {
    selectMenuHandlers.set(prefix, handler);
}

/**
 * Register an autocomplete handler
 * @param {string} commandName - Command name to match
 * @param {Function} handler - Handler function(interaction)
 */
function registerAutocomplete(commandName, handler) {
    autocompleteHandlers.set(commandName, handler);
}

/**
 * Find and execute matching handler
 * @param {Map} handlers - Handler registry
 * @param {string} customId - Interaction customId
 * @param {Interaction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @returns {boolean} Whether a handler was found and executed
 */
async function executeHandler(handlers, customId, interaction, client) {
    for (const [prefix, handler] of handlers) {
        if (customId.startsWith(prefix) || customId === prefix) {
            await handler(interaction, client);
            return true;
        }
    }
    return false;
}

/**
 * Handle a button interaction
 * @param {ButtonInteraction} interaction
 * @param {Client} client
 */
async function handleButton(interaction, client) {
    const customId = interaction.customId;
    
    try {
        const handled = await executeHandler(buttonHandlers, customId, interaction, client);
        
        if (!handled) {
            console.log(`[Router] No handler for button: ${customId}`);
        }
    } catch (error) {
        await logError('Button Handler', error, {
            customId,
            user: interaction.user.tag,
            userId: interaction.user.id,
        });
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `${emojis.CROSS} An error occurred processing this button.`,
                ephemeral: true,
            }).catch(() => {});
        }
    }
}

/**
 * Handle a modal submit interaction
 * @param {ModalSubmitInteraction} interaction
 * @param {Client} client
 */
async function handleModal(interaction, client) {
    const customId = interaction.customId;
    
    try {
        const handled = await executeHandler(modalHandlers, customId, interaction, client);
        
        if (!handled) {
            console.log(`[Router] No handler for modal: ${customId}`);
        }
    } catch (error) {
        await logError('Modal Handler', error, {
            customId,
            user: interaction.user.tag,
            userId: interaction.user.id,
        });
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `${emojis.CROSS} An error occurred processing this form.`,
                ephemeral: true,
            }).catch(() => {});
        }
    }
}

/**
 * Handle a select menu interaction
 * @param {StringSelectMenuInteraction} interaction
 * @param {Client} client
 */
async function handleSelectMenu(interaction, client) {
    const customId = interaction.customId;
    
    try {
        const handled = await executeHandler(selectMenuHandlers, customId, interaction, client);
        
        if (!handled) {
            console.log(`[Router] No handler for select menu: ${customId}`);
        }
    } catch (error) {
        await logError('SelectMenu Handler', error, {
            customId,
            user: interaction.user.tag,
            userId: interaction.user.id,
        });
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `${emojis.CROSS} An error occurred processing this selection.`,
                ephemeral: true,
            }).catch(() => {});
        }
    }
}

/**
 * Handle an autocomplete interaction
 * @param {AutocompleteInteraction} interaction
 */
async function handleAutocomplete(interaction) {
    const commandName = interaction.commandName;
    const handler = autocompleteHandlers.get(commandName);
    
    if (handler) {
        try {
            await handler(interaction);
        } catch (error) {
            console.error(`[Router] Autocomplete error for ${commandName}:`, error.message);
            await interaction.respond([]).catch(() => {});
        }
    }
}

/**
 * Initialize all interaction handlers from cogs
 * Call this after loading cogs
 */
function initializeHandlers() {
    // Tickets
    try {
        const tickets = require('../cogs/tickets');
        if (tickets.handleButton) registerButton('ticket_', tickets.handleButton);
        if (tickets.handleButton) registerButton('close_', tickets.handleButton);
        if (tickets.handleButton) registerButton('reopen_', tickets.handleButton);
        if (tickets.handleButton) registerButton('claim_', tickets.handleButton);
        if (tickets.handleButton) registerButton('timed_close_', tickets.handleButton);
        if (tickets.handleButton) registerButton('cancel_close_', tickets.handleButton);
        if (tickets.handleSelectMenu) registerSelectMenu('ticket_', tickets.handleSelectMenu);
        if (tickets.handleModalSubmit) registerModal('ticket_', tickets.handleModalSubmit);
        if (tickets.handleModalSubmit) registerModal('close_reason_', tickets.handleModalSubmit);
    } catch (e) {}

    // Verification
    try {
        const verification = require('../cogs/verification');
        if (verification.handleButton) registerButton('verify_', verification.handleButton);
        if (verification.handleButton) registerButton('unverify_', verification.handleButton);
    } catch (e) {}

    // Applications
    try {
        const applications = require('../cogs/applications');
        if (applications.handleButton) registerButton('app_', applications.handleButton);
        if (applications.handleButton) registerButton('apply_', applications.handleButton);
        if (applications.handleModal) registerModal('app_', applications.handleModal);
        if (applications.handleModal) registerModal('apply_', applications.handleModal);
    } catch (e) {}

    // Giveaways
    try {
        const giveaways = require('../cogs/giveaways');
        if (giveaways.handleGiveawayButton) registerButton('giveaway_', giveaways.handleGiveawayButton);
    } catch (e) {}

    // Temp VC
    try {
        const tempVC = require('../cogs/tempVC');
        if (tempVC.handleTempVCButton) registerButton('tempvc_', tempVC.handleTempVCButton);
        if (tempVC.handleTempVCButton) registerButton('vc_', tempVC.handleTempVCButton);
    } catch (e) {}

    // Suggestions
    try {
        const suggestions = require('../cogs/suggestions');
        if (suggestions.handleButton) registerButton('suggestion_', suggestions.handleButton);
        if (suggestions.handleButton) registerButton('suggest_', suggestions.handleButton);
    } catch (e) {}

    // Custom Roles
    try {
        const customRoles = require('../cogs/customRoles');
        if (customRoles.handleButton) registerButton('customrole_', customRoles.handleButton);
        if (customRoles.handleButton) registerButton('role_', customRoles.handleButton);
    } catch (e) {}

    // Survey
    try {
        const survey = require('../cogs/survey');
        if (survey.handleSurveyButton) registerButton('survey_', survey.handleSurveyButton);
        if (survey.handleSurveySubmit) registerModal('survey_', survey.handleSurveySubmit);
    } catch (e) {}

    // Emoji Reaction Roles
    try {
        const emojiRoles = require('../cogs/emojiReactionRoles');
        if (emojiRoles.handleButton) registerButton('emoji_role_', emojiRoles.handleButton);
    } catch (e) {}

    // Infractions
    try {
        const infractions = require('../cogs/infractions');
        if (infractions.handleButton) registerButton('infraction_', infractions.handleButton);
    } catch (e) {}

    // Notes
    try {
        const notes = require('../cogs/notes');
        if (notes.handleButton) registerButton('note_', notes.handleButton);
    } catch (e) {}

    // LOA
    try {
        const loa = require('../cogs/loa');
        if (loa.handleButton) registerButton('loa_', loa.handleButton);
    } catch (e) {}

    console.log(`[Router] Initialized ${buttonHandlers.size} button, ${modalHandlers.size} modal, ${selectMenuHandlers.size} select menu handlers`);
}

module.exports = {
    registerButton,
    registerModal,
    registerSelectMenu,
    registerAutocomplete,
    handleButton,
    handleModal,
    handleSelectMenu,
    handleAutocomplete,
    initializeHandlers,
};
