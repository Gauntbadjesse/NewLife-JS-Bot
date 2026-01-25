# NewLife+ Premium Membership

NewLife+ is a premium membership tier that grants exclusive perks across Discord and (optionally) Minecraft.

## Discord Perks

### 🎨 Custom Role
Premium members can create their own personalized role with:
- **Custom Name** - Choose your own role name
- **Custom Color** - Pick any hex color for your role
- **Custom Emoji** - Add an emoji prefix to your role
- **Role Position** - Your custom role appears under the NewLife+ role

**Commands:**
- `/customrole create <name> [color] [emoji]` - Request a new custom role
- `/customrole edit [name] [color] [emoji]` - Request changes to your role
- `/customrole delete` - Remove your custom role
- `/customrole view` - View your current role status

*Note: Custom roles require owner approval before being created/modified.*

---

### ⭐ Priority Support
When you create a support ticket, you receive:
- **Gold-colored ticket embed** instead of standard colors
- **⭐ Priority tag** in ticket title and status
- **"Premium Member - Priority Support" banner** in ticket description
- Staff are notified this is a priority ticket

Applies to all ticket types: General, Report, and Management tickets.

---

### 🎁 Double Giveaway Entries
When entering server giveaways:
- **2x entries** automatically applied when you click "Enter Giveaway"
- **Confirmation message** shows your premium bonus
- System ensures you can only win once per giveaway (no duplicate wins)

---

### 🎤 TempVC Soundboard Access
When you create a temporary voice channel:
- **⭐ prefix** added to your channel name
- **Soundboard permission** - Use Discord's soundboard feature
- **External sounds permission** - Use sounds from other servers
- **Gold control panel** with premium branding
- **Premium Features section** in the welcome embed

---

### 🎨 Custom Embed Colors
Bot responses can use your custom role color:
- Available via `getMemberEmbedColor()` utility
- Works with your custom role color if you have one
- Falls back to your highest colored role otherwise

---

## Staff Commands

### Granting NewLife+
```
!nlp @user
```
Grants the NewLife+ role to a user and sends them a welcome DM explaining all their new perks.

---

## Technical Details

### Role ID
```
PREMIUM_ROLE_ID = 1463405789241802895
```

### Files Modified
- `src/cogs/customRoles.js` - Custom role system
- `src/cogs/tickets.js` - Priority ticket support
- `src/cogs/giveaways.js` - Double entries
- `src/cogs/tempVC.js` - Soundboard access
- `src/cogs/general.js` - !nlp command
- `src/utils/embeds.js` - Premium embed colors
- `src/database/models/CustomRole.js` - Custom role storage

### Database Model: CustomRole
```javascript
{
    userId: String,          // Discord user ID
    userTag: String,         // Discord tag at time of request
    roleId: String,          // Created Discord role ID
    roleName: String,        // Role display name
    roleColor: String,       // Hex color (#FF5733)
    roleEmoji: String,       // Emoji prefix
    pendingRequest: {        // For new/edit requests
        roleName: String,
        roleColor: String,
        roleEmoji: String,
        requestedAt: Date,
        isEdit: Boolean
    },
    status: String,          // pending, approved, denied
    approvedAt: Date,
    approvedBy: String,
    denialReason: String
}
```

---

## Future Expansion Ideas

### Minecraft Integration
- Custom join messages
- Reserved server slots
- Tab list prefix
- Particle effects
- Extended claim blocks
- More /home locations

### Additional Discord Features
- AFK system with auto-reply
- Birthday announcements
- Profile cards
- XP boost (if leveling added)
