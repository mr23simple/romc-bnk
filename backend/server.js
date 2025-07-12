// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser'); // To parse JSON request bodies
const multer = require('multer'); // For handling file uploads (Excel)
const xlsx = require('xlsx'); // For reading Excel files

const app = express();
const port = 3000;

// Enable CORS for all routes, allowing your frontend to communicate with this backend
app.use(cors());
// Use body-parser to parse JSON bodies
app.use(bodyParser.json());
// Configure multer for file uploads (store in memory for processing)
const upload = multer({ storage: multer.memoryStorage() });

// --- In-Memory Data Storage ---
// All data will be lost when the server restarts.
let players = [];
let groups = [];
let nextPlayerId = 1;
let nextGroupId = 1;

// Define the allowed classes
const ALLOWED_CLASSES = [
    "Sorcerer", "Warlock", "Archbishop", "Shura", "Ranger", "Minstrel",
    "Wanderer", "Rune Knight", "Royal Guard", "Shadow Chaser",
    "Guillotine Cross", "Mechanic", "Genetic"
];

// --- Helper Functions ---

/**
 * Finds a player by ID.
 * @param {number} playerId
 * @returns {object|undefined} The player object or undefined if not found.
 */
function getPlayerById(playerId) {
    return players.find(p => p.id === playerId);
}

/**
 * Finds a group by ID.
 * @param {number} groupId
 * @returns {object|undefined} The group object or undefined if not found.
 */
function getGroupById(groupId) {
    return groups.find(g => g.id === groupId);
}

/**
 * Removes a player from all groups.
 * @param {number} playerId
 */
function removePlayerFromAllGroups(playerId) {
    groups.forEach(group => {
        group.members = group.members.filter(memberId => memberId !== playerId);
        // If the removed player was the leader, clear the leader
        if (group.leaderId === playerId) {
            group.leaderId = null;
        }
    });
}

// --- API Endpoints ---

app.get('/', (req, res) => {
    res.send('BNK Guild Backend (Node.js) is running!');
});

// --- Player Management Endpoints ---

app.post('/players', (req, res) => {
    const { name, class: playerClass } = req.body;

    if (!name || !playerClass) {
        return res.status(400).json({ error: 'Player name and class are required' });
    }
    if (!ALLOWED_CLASSES.includes(playerClass)) {
        return res.status(400).json({ error: `Invalid class. Allowed classes are: ${ALLOWED_CLASSES.join(', ')}` });
    }
    if (players.some(p => p.name === name)) {
        return res.status(409).json({ error: 'Player with this name already exists' });
    }

    const newPlayer = { id: nextPlayerId++, name, class: playerClass };
    players.push(newPlayer);
    res.status(201).json({ message: 'Player added successfully', player: newPlayer });
});

app.get('/players', (req, res) => {
    res.json(players);
});

app.put('/players/:id', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { name: newName, class: newClass } = req.body;

    const playerIndex = players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
        return res.status(404).json({ error: 'Player not found' });
    }

    if (!newName && !newClass) {
        return res.status(400).json({ error: 'No update data provided' });
    }
    if (newClass && !ALLOWED_CLASSES.includes(newClass)) {
        return res.status(400).json({ error: `Invalid class. Allowed classes are: ${ALLOWED_CLASSES.join(', ')}` });
    }
    if (newName && players.some(p => p.name === newName && p.id !== playerId)) {
        return res.status(409).json({ error: 'Player with this name already exists' });
    }

    if (newName) players[playerIndex].name = newName;
    if (newClass) players[playerIndex].class = newClass;

    res.json({ message: 'Player updated successfully', player: players[playerIndex] });
});

app.delete('/players/:id', (req, res) => {
    const playerId = parseInt(req.params.id);
    const playerIndex = players.findIndex(p => p.id === playerId);

    if (playerIndex === -1) {
        return res.status(404).json({ error: 'Player not found' });
    }

    // Remove player from all groups
    removePlayerFromAllGroups(playerId);

    players.splice(playerIndex, 1);
    res.json({ message: 'Player deleted successfully' });
});

app.post('/players/upload_excel', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.originalname.match(/\.(xlsx|xls)$/)) {
        return res.status(400).json({ error: 'Invalid file type. Only .xlsx and .xls are supported.' });
    }

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const addedPlayers = [];
        const errors = [];

        data.forEach((row, index) => {
            const playerName = String(row['Player Name'] || '').trim();
            const playerClass = String(row['Class'] || '').trim();

            if (!playerName || !playerClass) {
                errors.push(`Row ${index + 2}: Missing player name or class.`);
                return;
            }
            if (!ALLOWED_CLASSES.includes(playerClass)) {
                errors.push(`Row ${index + 2}: Invalid class '${playerClass}' for player '${playerName}'.`);
                return;
            }
            if (players.some(p => p.name === playerName)) {
                errors.push(`Player '${playerName}' already exists.`);
                return;
            }

            const newPlayer = { id: nextPlayerId++, name: playerName, class: playerClass };
            players.push(newPlayer);
            addedPlayers.push(newPlayer);
        });

        res.json({
            message: `Successfully processed ${addedPlayers.length} players.`,
            added_players: addedPlayers,
            errors: errors
        });

    } catch (error) {
        console.error('Error processing Excel file:', error);
        res.status(500).json({ error: `Error processing Excel file: ${error.message}` });
    }
});

// --- Group Management Endpoints ---

app.post('/groups', (req, res) => {
    const { name, leaderId } = req.body; // leaderId is optional

    if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
    }
    if (groups.some(g => g.name === name)) {
        return res.status(409).json({ error: 'Group with this name already exists' });
    }

    // Validate leaderId if provided
    if (leaderId !== undefined && leaderId !== null) {
        const leaderExists = getPlayerById(leaderId);
        if (!leaderExists) {
            return res.status(404).json({ error: 'Leader player not found' });
        }
    }

    const newGroup = {
        id: nextGroupId++,
        name,
        leaderId: leaderId || null, // Store leaderId, can be null
        members: [] // Store member IDs
    };
    groups.push(newGroup);
    res.status(201).json({ message: 'Group created successfully', group: newGroup });
});

app.get('/groups', (req, res) => {
    // Return groups with full player objects for members and leader
    const groupsWithDetails = groups.map(group => {
        const detailedMembers = group.members
            .map(memberId => getPlayerById(memberId))
            .filter(Boolean); // Filter out undefined if a player was deleted

        const detailedLeader = group.leaderId ? getPlayerById(group.leaderId) : null;

        return {
            ...group,
            members: detailedMembers,
            leader: detailedLeader
        };
    });
    res.json(groupsWithDetails);
});

app.put('/groups/:id', (req, res) => {
    const groupId = parseInt(req.params.id);
    const { name: newName, leaderId: newLeaderId } = req.body;

    const groupIndex = groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
        return res.status(404).json({ error: 'Group not found' });
    }

    if (!newName && newLeaderId === undefined) {
        return res.status(400).json({ error: 'No update data provided' });
    }
    if (newName && groups.some(g => g.name === newName && g.id !== groupId)) {
        return res.status(409).json({ error: 'Group with this name already exists' });
    }

    // Validate newLeaderId if provided
    if (newLeaderId !== undefined && newLeaderId !== null) {
        const leaderExists = getPlayerById(newLeaderId);
        if (!leaderExists) {
            return res.status(404).json({ error: 'Leader player not found' });
        }
        // Check if the potential leader is actually a member of this group
        if (!groups[groupIndex].members.includes(newLeaderId)) {
            return res.status(400).json({ error: 'Assigned leader must be a member of this group' });
        }
    }

    if (newName) groups[groupIndex].name = newName;
    if (newLeaderId !== undefined) groups[groupIndex].leaderId = newLeaderId;

    res.json({ message: 'Group updated successfully', group: groups[groupIndex] });
});

app.delete('/groups/:id', (req, res) => {
    const groupId = parseInt(req.params.id);
    const groupIndex = groups.findIndex(g => g.id === groupId);

    if (groupIndex === -1) {
        return res.status(404).json({ error: 'Group not found' });
    }

    groups.splice(groupIndex, 1);
    res.json({ message: 'Group deleted successfully' });
});

app.post('/groups/:groupId/add_player/:playerId', (req, res) => {
    const groupId = parseInt(req.params.groupId);
    const playerId = parseInt(req.params.playerId);

    const group = getGroupById(groupId);
    const player = getPlayerById(playerId);

    if (!group) {
        return res.status(404).json({ error: 'Group not found' });
    }
    if (!player) {
        return res.status(404).json({ error: 'Player not found' });
    }
    if (group.members.includes(playerId)) {
        return res.status(409).json({ error: 'Player is already in this group' });
    }

    group.members.push(playerId);
    res.json({ message: 'Player added to group successfully', group });
});

app.delete('/groups/:groupId/remove_player/:playerId', (req, res) => {
    const groupId = parseInt(req.params.groupId);
    const playerId = parseInt(req.params.playerId);

    const group = getGroupById(groupId);
    if (!group) {
        return res.status(404).json({ error: 'Group not found' });
    }

    const memberIndex = group.members.indexOf(playerId);
    if (memberIndex === -1) {
        return res.status(404).json({ error: 'Player not found in this group' });
    }

    group.members.splice(memberIndex, 1);

    // If the removed player was the leader, set leaderId to null
    if (group.leaderId === playerId) {
        group.leaderId = null;
    }

    res.json({ message: 'Player removed from group successfully', group });
});

// --- Class Distribution Endpoint ---

app.get('/class_distribution', (req, res) => {
    const distribution = {};
    ALLOWED_CLASSES.forEach(cls => {
        distribution[cls] = 0; // Initialize all allowed classes to 0
    });

    players.forEach(player => {
        if (distribution[player.class] !== undefined) {
            distribution[player.class]++;
        }
    });

    // Convert to an array of objects for easier frontend consumption
    const result = Object.keys(distribution).map(cls => ({
        class: cls,
        count: distribution[cls]
    }));

    res.json(result);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
