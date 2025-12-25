/**
 * WeeklyStats Model
 * Tracks weekly statistics for whitelist add command usage
 */
const mongoose = require('mongoose');

const weeklyStatsSchema = new mongoose.Schema({
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    stats: [{
        userId: { type: String },
        username: { type: String },
        count: { type: Number, default: 0 }
    }],
    totalAdds: { type: Number, default: 0 },
    sentToOwner: { type: Boolean, default: false },
    sentAt: { type: Date }
});

weeklyStatsSchema.index({ weekStart: 1 });

module.exports = mongoose.model('WeeklyStats', weeklyStatsSchema);
