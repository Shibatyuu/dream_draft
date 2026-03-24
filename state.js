const GameState = {
    phase: 'connection',
    numPlayers: 2,
    playerNames: ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4'],
    numRounds: 5,
    currentRound: 1,
    currentSubRound: 1,
    playersToDraftThisRound: [],
    currentPlayerTurnIndex: 0,
    currentTurn: 0,

    csvData: [],
    availablePlayers: [],

    currentSelections: {},
    rosters: [[], [], [], []],
    confirmedPlayers: {},
    lotteryResults: {},
    activeLottery: null, // { playerId, participants, startTime, isRunning }
    losers: [],
    lastSeen: {},
    playerStatus: {}, // {name: boolean} online status
    godsHandUsed: {}  // {name: boolean}
};

let GameStateHistory = [];
let activeIntervals = [];

let GlobalTags = {
    teams: [],
    positions: ['投手', '捕手', '内野手', '外野手']
};

let isOnline = false;
let isHost = false;
let roomId = null;
let clientId = null;
let lastVersion = 0;
let SERVER_URL = localStorage.getItem('NPBDraftApp_GAS_URL') || '';
let pollInterval = null;
let hostActionInterval = null;
let myPlayerName = 'Host';
let myIdx = -1;

function saveState() {
    GameStateHistory.push(JSON.stringify(GameState));
}

function undoState() {
    if (GameStateHistory.length > 0) {
        if (pollInterval) clearInterval(pollInterval);
        if (hostActionInterval) clearInterval(hostActionInterval);
        
        const prevState = JSON.parse(GameStateHistory.pop());
        Object.keys(GameState).forEach(k => delete GameState[k]);
        Object.assign(GameState, prevState);

        const modal = document.getElementById('roster-modal');
        if (modal) modal.style.display = 'none';

        render();
    }
}
