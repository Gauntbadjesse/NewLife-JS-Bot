/**
 * GuruPerformance Model
 * Tracks whitelist guru performance metrics for weekly pay calculations
 * 
 * Metrics tracked:
 * - Response time: How quickly they respond to apply tickets
 * - Greeting quality: Whether they greet applicants properly
 * - Completion rate: Successfully whitelisted vs total tickets claimed
 * - Volume: Total number of whitelists processed
 */
const mongoose = require('mongoose');

const ticketInteractionSchema = new mongoose.Schema({
    ticketId: { type: String, required: true },
    ticketChannelId: { type: String },
    applicantId: { type: String, required: true },
    applicantTag: { type: String },
    
    // Timing metrics
    ticketCreatedAt: { type: Date, required: true },
    firstResponseAt: { type: Date },          // When guru first responded
    responseTimeMs: { type: Number },          // Milliseconds to first response
    
    // Quality metrics
    didGreet: { type: Boolean, default: false },      // Detected greeting message
    greetingMessage: { type: String },                 // The greeting message sent
    
    // Outcome
    outcome: { 
        type: String, 
        enum: ['whitelisted', 'denied', 'abandoned', 'transferred', 'pending'],
        default: 'pending'
    },
    whitelistedAt: { type: Date },
    mcUsername: { type: String },
    platform: { type: String },
    
    // Feedback (optional - for future expansion)
    applicantRating: { type: Number, min: 1, max: 5 },
    notes: { type: String }
}, { _id: false });

const guruPerformanceSchema = new mongoose.Schema({
    guruId: { type: String, required: true, index: true },
    guruTag: { type: String },
    guildId: { type: String, required: true, index: true },
    
    // Week boundaries
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true },
    
    // Aggregated metrics
    totalTicketsClaimed: { type: Number, default: 0 },
    totalWhitelisted: { type: Number, default: 0 },
    totalDenied: { type: Number, default: 0 },
    totalAbandoned: { type: Number, default: 0 },
    totalTransferred: { type: Number, default: 0 },
    
    // Response time stats (in milliseconds)
    avgResponseTimeMs: { type: Number, default: 0 },
    minResponseTimeMs: { type: Number },
    maxResponseTimeMs: { type: Number },
    totalResponseTimeMs: { type: Number, default: 0 },
    responseCount: { type: Number, default: 0 },
    
    // Quality scores
    greetingRate: { type: Number, default: 0 },    // Percentage of tickets with greeting
    greetingCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },  // Whitelisted / (Claimed - Transferred)
    
    // Overall performance score (calculated)
    performanceScore: { type: Number, default: 0 }, // 0-100
    
    // Payment calculation
    recommendedDiamonds: { type: Number, default: 0 },
    diamondRangeMin: { type: Number, default: 0 },
    diamondRangeMax: { type: Number, default: 0 },
    
    // Individual ticket interactions
    interactions: [ticketInteractionSchema],
    
    // Report status
    reportSent: { type: Boolean, default: false },
    reportSentAt: { type: Date }
}, {
    timestamps: true
});

// Compound index for efficient lookups
guruPerformanceSchema.index({ guruId: 1, weekStart: 1 }, { unique: true });
guruPerformanceSchema.index({ guildId: 1, weekStart: 1 });

/**
 * Calculate and update performance metrics
 */
guruPerformanceSchema.methods.recalculateMetrics = function() {
    const validInteractions = this.interactions.filter(i => i.outcome !== 'pending');
    const completedInteractions = this.interactions.filter(i => 
        i.outcome === 'whitelisted' || i.outcome === 'denied'
    );
    
    // Response time calculations
    const responseTimes = this.interactions.filter(i => i.responseTimeMs > 0).map(i => i.responseTimeMs);
    if (responseTimes.length > 0) {
        this.totalResponseTimeMs = responseTimes.reduce((a, b) => a + b, 0);
        this.responseCount = responseTimes.length;
        this.avgResponseTimeMs = this.totalResponseTimeMs / responseTimes.length;
        this.minResponseTimeMs = Math.min(...responseTimes);
        this.maxResponseTimeMs = Math.max(...responseTimes);
    }
    
    // Greeting rate
    this.greetingCount = this.interactions.filter(i => i.didGreet).length;
    this.greetingRate = this.interactions.length > 0 
        ? (this.greetingCount / this.interactions.length) * 100 
        : 0;
    
    // Completion rate (excludes transferred tickets)
    const claimedNotTransferred = this.totalTicketsClaimed - this.totalTransferred;
    this.completionRate = claimedNotTransferred > 0
        ? (this.totalWhitelisted / claimedNotTransferred) * 100
        : 0;
    
    // Calculate performance score (0-100)
    // Weighted: Volume (30%), Response Time (30%), Greeting (20%), Completion (20%)
    const volumeScore = Math.min(this.totalWhitelisted * 5, 100); // 20+ whitelists = max
    
    // Response time score (5 min = 100, 30 min = 50, 1 hour+ = 0)
    const avgMins = this.avgResponseTimeMs / 60000;
    let responseScore = 100;
    if (avgMins > 5) responseScore = Math.max(0, 100 - ((avgMins - 5) * 2));
    
    const greetingScore = this.greetingRate;
    const completionScore = this.completionRate;
    
    this.performanceScore = Math.round(
        (volumeScore * 0.30) + 
        (responseScore * 0.30) + 
        (greetingScore * 0.20) + 
        (completionScore * 0.20)
    );
    
    // Calculate diamond range based on performance
    this.calculateDiamondRange();
};

/**
 * Calculate recommended diamond payment range
 * Base: 1 diamond per whitelist
 * Bonuses: Response time, greeting rate, completion rate
 */
guruPerformanceSchema.methods.calculateDiamondRange = function() {
    const basePerWhitelist = 1;
    const baseDiamonds = this.totalWhitelisted * basePerWhitelist;
    
    // Performance multiplier (0.5x to 2x based on score)
    let multiplier = 1;
    if (this.performanceScore >= 90) multiplier = 2.0;
    else if (this.performanceScore >= 80) multiplier = 1.75;
    else if (this.performanceScore >= 70) multiplier = 1.5;
    else if (this.performanceScore >= 60) multiplier = 1.25;
    else if (this.performanceScore >= 50) multiplier = 1.0;
    else if (this.performanceScore >= 40) multiplier = 0.75;
    else multiplier = 0.5;
    
    // Calculate range
    const calculated = Math.round(baseDiamonds * multiplier);
    this.diamondRangeMin = Math.max(0, calculated - Math.ceil(baseDiamonds * 0.1));
    this.diamondRangeMax = calculated + Math.ceil(baseDiamonds * 0.1);
    this.recommendedDiamonds = calculated;
};

/**
 * Add a new ticket interaction
 */
guruPerformanceSchema.methods.addInteraction = function(data) {
    this.interactions.push(data);
    this.totalTicketsClaimed = this.interactions.length;
    
    // Update counts based on outcome
    if (data.outcome === 'whitelisted') this.totalWhitelisted++;
    else if (data.outcome === 'denied') this.totalDenied++;
    else if (data.outcome === 'abandoned') this.totalAbandoned++;
    else if (data.outcome === 'transferred') this.totalTransferred++;
    
    this.recalculateMetrics();
};

/**
 * Update an existing interaction
 */
guruPerformanceSchema.methods.updateInteraction = function(ticketId, updates) {
    const interaction = this.interactions.find(i => i.ticketId === ticketId);
    if (!interaction) return false;
    
    // Track old outcome for count adjustment
    const oldOutcome = interaction.outcome;
    
    Object.assign(interaction, updates);
    
    // Adjust counts if outcome changed
    if (updates.outcome && oldOutcome !== updates.outcome) {
        if (oldOutcome === 'whitelisted') this.totalWhitelisted--;
        else if (oldOutcome === 'denied') this.totalDenied--;
        else if (oldOutcome === 'abandoned') this.totalAbandoned--;
        else if (oldOutcome === 'transferred') this.totalTransferred--;
        
        if (updates.outcome === 'whitelisted') this.totalWhitelisted++;
        else if (updates.outcome === 'denied') this.totalDenied++;
        else if (updates.outcome === 'abandoned') this.totalAbandoned++;
        else if (updates.outcome === 'transferred') this.totalTransferred++;
    }
    
    this.recalculateMetrics();
    return true;
};

// Static methods

/**
 * Get current week boundaries (Sunday to Saturday)
 */
guruPerformanceSchema.statics.getWeekBounds = function() {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday
    const diff = now.getUTCDate() - day;
    
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    
    return { weekStart, weekEnd };
};

/**
 * Get or create current week's performance record for a guru
 */
guruPerformanceSchema.statics.getOrCreateForGuru = async function(guruId, guruTag, guildId) {
    const { weekStart, weekEnd } = this.getWeekBounds();
    
    let record = await this.findOne({ guruId, weekStart });
    
    if (!record) {
        record = new this({
            guruId,
            guruTag,
            guildId,
            weekStart,
            weekEnd,
            interactions: []
        });
        await record.save();
    } else if (guruTag && record.guruTag !== guruTag) {
        record.guruTag = guruTag;
        await record.save();
    }
    
    return record;
};

/**
 * Get all guru performance records for a specific week
 */
guruPerformanceSchema.statics.getWeeklyRecords = async function(guildId, weekStart = null) {
    if (!weekStart) {
        weekStart = this.getWeekBounds().weekStart;
    }
    
    return this.find({ guildId, weekStart }).sort({ performanceScore: -1 });
};

/**
 * Get last week's records (for weekly reports)
 */
guruPerformanceSchema.statics.getLastWeekRecords = async function(guildId) {
    const { weekStart: currentWeekStart } = this.getWeekBounds();
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    
    return this.find({ guildId, weekStart: lastWeekStart }).sort({ performanceScore: -1 });
};

module.exports = mongoose.model('GuruPerformance', guruPerformanceSchema);
