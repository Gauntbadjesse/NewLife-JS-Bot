/**
 * Fine Model
 */
const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    uuid: { type: String, required: true, index: true },
    caseNumber: { type: Number, index: true, default: null },
    playerName: { type: String, required: true },
    staffUuid: { type: String, default: null },
    staffName: { type: String, required: true },
    amount: { type: String, required: true },
    note: { type: String, default: null },
    createdAt: { type: Date, required: true },
    dueAt: { type: Date, default: null },
    paid: { type: Boolean, default: false },
    paidBy: { type: String, default: null },
    paidAt: { type: Date, default: null }
}, {
    collection: 'fines',
    versionKey: false
});

fineSchema.index({ playerName: 1 });
fineSchema.index({ paid: 1 });
fineSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Fine', fineSchema);
