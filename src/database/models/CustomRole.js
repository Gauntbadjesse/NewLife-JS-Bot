/**
 * CustomRole Model
 * Stores custom role requests and approved custom roles for premium members
 */
const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
    // Discord user who owns this custom role
    userId: { type: String, required: true, unique: true },
    userTag: { type: String },
    
    // Role details
    roleId: { type: String }, // The created Discord role ID (set after approval)
    roleName: { type: String, required: true },
    roleColor: { type: String }, // Hex color e.g. "#FF5733"
    roleEmoji: { type: String }, // Unicode or custom emoji
    
    // Pending request details (for new requests or edit requests)
    pendingRequest: {
        roleName: { type: String },
        roleColor: { type: String },
        roleEmoji: { type: String },
        requestedAt: { type: Date },
        isEdit: { type: Boolean, default: false }
    },
    
    // Status
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'denied'], 
        default: 'pending' 
    },
    
    // Audit trail
    createdAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    approvedBy: { type: String }, // Discord user ID of who approved
    lastEditedAt: { type: Date },
    denialReason: { type: String }
});

// Index for quick lookups
customRoleSchema.index({ userId: 1 });
customRoleSchema.index({ roleId: 1 });
customRoleSchema.index({ status: 1 });

module.exports = mongoose.model('CustomRole', customRoleSchema);
