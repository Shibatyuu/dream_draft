// Main Entry Point for NPB Draft Game

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Data Load
    loadEmbeddedData();

    // 2. Global Header Listeners
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.onclick = () => { if (confirm('一手戻しますか？')) undoState(); };

    const rosterBtn = document.getElementById('view-roster-btn');
    if (rosterBtn) rosterBtn.onclick = renderRosterModal;

    const closeRosterBtn = document.getElementById('close-roster-btn');
    if (closeRosterBtn) closeRosterBtn.onclick = () => { document.getElementById('roster-modal').style.display = 'none'; };

    // 3. Initial Render
    render();
});

function setupConnectionListeners() {
    const gasInput = document.getElementById('gas-url-input');
    if (gasInput) {
        gasInput.value = SERVER_URL;
        gasInput.onchange = (e) => {
            SERVER_URL = e.target.value;
            localStorage.setItem('NPBDraftApp_GAS_URL', SERVER_URL);
        };
    }

    const csvUpload = document.getElementById('csv-upload');
    if (csvUpload) {
        csvUpload.onchange = (e) => {
            if (e.target.files.length > 0) handleCSVUpload(e.target.files[0]);
        };
    }

    document.getElementById('create-room-btn').onclick = async () => {
        const name = document.getElementById('host-name').value.trim();
        if (!name || !SERVER_URL) return alert('名前とURLを入力してください');
        myPlayerName = name;
        isOnline = true; isHost = true;
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
        clientId = generateId();
        
        GameState.playerNames = [myPlayerName];
        GameState.numPlayers = 1;
        GameState.playerStatus = { [myPlayerName]: true };
        GameState.lastSeen = { [myPlayerName]: Date.now() };
        GameState.phase = 'setup';
        
        startHostPolling();
        render();
    };

    document.getElementById('join-room-btn').onclick = async () => {
        const rid = document.getElementById('join-room-id').value.trim();
        const name = document.getElementById('join-room-name').value.trim();
        if (!rid || !name || !SERVER_URL) return alert('全て入力してください');
        
        myPlayerName = name;
        isOnline = true; isHost = false;
        roomId = rid;
        clientId = generateId();
        
        await sendClientAction({ type: 'join', name: myPlayerName });
        GameState.phase = 'setup';
        startClientPolling();
        render();
    };

    document.getElementById('offline-btn').onclick = () => {
        isOnline = false; isHost = false;
        GameState.phase = 'setup';
        render();
    };
}
