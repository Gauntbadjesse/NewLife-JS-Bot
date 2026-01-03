/**
 * Script to create the Code of Conduct embed
 * Run with: node scripts/createCodeOfConduct.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CustomEmbed = require('../src/database/models/CustomEmbed');

async function createEmbed() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/newlife');
    console.log('Connected to MongoDB');
    
    // Delete existing if any
    await CustomEmbed.deleteOne({ name: 'codeofconduct' });
    console.log('Cleared existing embed');
    
    const embed = new CustomEmbed({
        name: 'codeofconduct',
        guildId: '1372672239245459498',
        title: 'Code of Conduct',
        description: 'The following behavioral standards apply to all interactions within the NewLife SMP community. These rules exist to ensure a safe, respectful, and enjoyable environment for every member. Violations are taken extremely seriously.',
        color: '#10b981',
        footer: 'NewLife SMP • Updated 12/17/2025',
        fields: [
            {
                name: '⚠️ Respect Required',
                value: '• **Harassment** - Any targeted behavior to intimidate or demean another player\n• **Hate Speech** - Language attacking individuals based on protected characteristics\n• **Doxxing** - Sharing private information without consent\n• **Threats** - Any direct or implied threat of harm\n• **Coordinated Abuse** - Organized efforts to target players',
                inline: false
            },
            {
                name: '🔐 Account Responsibility',
                value: '• You are responsible for all actions on your account\n• **No account sharing** - Sharing credentials is prohibited\n• **Alt accounts** must be verified through official process\n• "Hacked" claims will be investigated but don\'t absolve responsibility',
                inline: false
            },
            {
                name: '🚫 Prohibited Content',
                value: '• **No NSFW** - Sexually explicit content is absolutely prohibited\n• **No Impersonation** - Don\'t impersonate staff, players, or public figures\n• **No Advertising** - No promotion without prior staff approval\n• **No Spamming** - Chat spam, command spam, or redstone spam',
                inline: false
            },
            {
                name: '👮 Follow Staff Instructions',
                value: 'Staff instructions must be followed immediately. If you believe an instruction is unjust, comply first and file a formal appeal through proper channels.',
                inline: false
            }
        ],
        buttons: [
            {
                label: 'Full Rules',
                style: 'link',
                url: 'https://newlifesmp.com/rules'
            }
        ],
        createdBy: 'System',
        createdAt: new Date()
    });
    
    await embed.save();
    console.log('Code of Conduct embed created successfully!');
    console.log('Use /embed send codeofconduct to send it to a channel');
    
    await mongoose.disconnect();
    process.exit(0);
}

createEmbed().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
