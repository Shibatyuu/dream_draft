// Main Entry Point for NPB Draft Game

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Data Load
    loadEmbeddedData();

    // 2. Global Header Listeners
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.onclick = () => { Sound.tap(); if (confirm('一手戻しますか？')) undoState(); };

    const rosterBtn = document.getElementById('view-roster-btn');
    if (rosterBtn) rosterBtn.onclick = () => { Sound.tap(); renderRosterModal(); };

    const closeRosterBtn = document.getElementById('close-roster-btn');
    if (closeRosterBtn) closeRosterBtn.onclick = () => { Sound.tap(); document.getElementById('roster-modal').style.display = 'none'; };

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
        Sound.tap();
        const name = document.getElementById('host-name').value.trim();
        const gasUrl = document.getElementById('gas-url-input').value.trim();
        if (!name || !gasUrl) return alert('名前とURLを入力してください');
        
        myPlayerName = name;
        isOnline = true; isHost = true;
        clientId = generateId();
        
        // Prepare initial state for server
        GameState.playerNames = [myPlayerName];
        GameState.numPlayers = 1;
        GameState.playerStatus = { [myPlayerName]: true };
        GameState.lastSeen = { [myPlayerName]: Date.now() };
        GameState.phase = 'setup';

        try {
            const res = await fetch(SERVER_URL + '?path=/create', {
                method: 'POST',
                body: JSON.stringify({ state: GameState })
            });
            const data = await res.json();
            if (data.room_id) {
                roomId = data.room_id;
                console.log(`Room created: ${roomId}`);
                startHostPolling();
                render();
            } else {
                alert('ルーム作成に失敗しました');
            }
        } catch(e) {
            console.error(e);
            alert('接続エラーが発生しました');
        }
    };

    document.getElementById('join-room-btn').onclick = async () => {
        Sound.tap();
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
        Sound.tap();
        isOnline = false; isHost = false;
        GameState.phase = 'setup';
        render();
    };
}
