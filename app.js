let isOnline = false;
let isHost = false;
let roomId = null;
let clientId = null;
let lastVersion = 0;
let SERVER_URL = localStorage.getItem('NPBDraftApp_GAS_URL') || '';
let pollInterval = null;
let hostActionInterval = null;
let myPlayerName = 'Host';

const GameState = {
    phase: 'connection',
    numPlayers: 2,
    playerNames: ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4'],
    numRounds: 5,
    currentRound: 1,
    currentSubRound: 1,
    playersToDraftThisRound: [], 
    currentPlayerTurnIndex: 0,
    
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
    godsHandUsed: {}  // {name: boolean} placeholder for future feature
};

const appContainer = document.getElementById('main-content');

// State History & Intervals
let GameStateHistory = [];
let activeIntervals = [];
let GlobalTags = {
    teams: [],
    positions: ['投手', '捕手', '内野手', '外野手']
};

function saveState() {
    GameStateHistory.push(JSON.stringify(GameState));
}

function undoState() {
    if (GameStateHistory.length > 0) {
        activeIntervals.forEach(clearInterval);
        activeIntervals = [];
        const prevState = JSON.parse(GameStateHistory.pop());
        Object.keys(GameState).forEach(k => delete GameState[k]);
        Object.assign(GameState, prevState);
        
        const modal = document.getElementById('roster-modal');
        if (modal) modal.style.display = 'none';
        
        render();
    }
}

function updateGlobalUI() {
    const undoBtn = document.getElementById('undo-btn');
    const rosterBtn = document.getElementById('view-roster-btn');
    
    if (GameState.phase === 'connection' || GameState.phase === 'setup' || GameState.phase === 'final_result') {
        if(undoBtn) undoBtn.style.display = 'none';
        if(rosterBtn) rosterBtn.style.display = 'none';
    } else {
        if(undoBtn) undoBtn.style.display = (GameStateHistory.length > 0 && (!isOnline || isHost)) ? 'inline-flex' : 'none';
        if(rosterBtn) rosterBtn.style.display = 'inline-flex';
    }
}

function generateRosterHTML() {
    let html = `<div class="roster-stats-container" style="display:flex; gap:1rem; margin-bottom:1.5rem; overflow-x:auto;">`;

    for (let i = 0; i < GameState.numPlayers; i++) {
        const playerArray = GameState.rosters[i] || [];
        let pitcherCount = 0, infielderCount = 0, outfielderCount = 0, catcherCount = 0;
        let totalSalary = 0, totalAge = 0;
        const teamsSet = new Set();
        
        playerArray.forEach(p => {
            if (!p) return;
            const pos = p.position || '';
            if (pos.includes('投')) pitcherCount++;
            else if (pos.includes('捕')) catcherCount++;
            else if (pos.includes('外')) outfielderCount++;
            else if (pos.includes('内') || pos.includes('野')) infielderCount++; 
            
            totalSalary += p.salary || 0;
            totalAge += p.age || 0;
            teamsSet.add(p.team);
        });
        
        const count = playerArray.length;
        const avgAge = count > 0 ? (totalAge / count).toFixed(1) : '0.0';
        const fielderCount = infielderCount + outfielderCount + catcherCount;
        const formatMoney = (val) => new Intl.NumberFormat('ja-JP').format(val);
        
        const isOB = (teamName) => teamName.toUpperCase().includes('OB');
        const draftedNPBTeams = new Set(Array.from(teamsSet).filter(t => !isOB(t)));
        const draftedTeamsArr = Array.from(draftedNPBTeams).sort();
        
        const validNPBTeams = [...(GlobalTags.ceLeagueTeams || []), ...(GlobalTags.paLeagueTeams || [])];
        const undraftedTeamsArr = validNPBTeams.filter(t => !draftedNPBTeams.has(t)).sort();
        
        html += `
        <div class="stat-card glass-panel" style="min-width: 280px; padding: 1rem; flex: 1; border:1px solid var(--accent-color); background: rgba(59, 130, 246, 0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                <h3 style="margin:0;">${GameState.playerNames[i]}</h3>
                ${getStatusDot(GameState.playerNames[i])}
            </div>
            <div style="font-size: 0.85rem; display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem;">
                <span style="color:var(--text-secondary)">選択数</span> <strong>${count} 人</strong>
                <span style="color:var(--text-secondary)">選択球団</span> <strong>${draftedNPBTeams.size} 球団</strong>
                <span style="color:var(--text-secondary)">年俸総額</span> <strong>${totalSalary > 0 ? formatMoney(totalSalary) : '-'}</strong>
                <span style="color:var(--text-secondary)">平均年俸</span> <strong>${count > 0 ? formatMoney((totalSalary / count).toFixed(0)) : '-'}</strong>
                <span style="color:var(--text-secondary)">平均年齢</span> <strong>${avgAge} 歳</strong>
            </div>
            <div style="font-size: 0.8rem; margin-top: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; color: var(--text-secondary);">
                投手 <strong style="color:white">${pitcherCount}</strong> | 野手 <strong style="color:white">${fielderCount}</strong><br>
                <span style="font-size: 0.75rem">(内: ${infielderCount}, 外: ${outfielderCount}, 捕: ${catcherCount})</span>
            </div>
            <div style="font-size: 0.75rem; margin-top: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; color: var(--text-secondary); max-height:80px; overflow-y:auto;">
                <strong style="color:var(--text-primary)">獲得済:</strong> ${draftedTeamsArr.length > 0 ? draftedTeamsArr.join('、') : 'なし'}<br>
                <strong style="color:var(--text-primary)">未獲得:</strong> ${undraftedTeamsArr.length > 0 ? undraftedTeamsArr.join('、') : 'なし'}
            </div>
        </div>`;
    }
    
    html += `</div>`;
    
    html += `<table class="roster-table"><thead><tr>`;
    html += `<th>ラウンド</th>`;
    for (let i = 0; i < GameState.numPlayers; i++) {
        html += `<th>${GameState.playerNames[i]}</th>`;
    }
    html += `</tr></thead><tbody>`;
    
    const maxRows = GameState.numRounds;
    for (let row = 0; row < maxRows; row++) {
        html += `<tr><td style="font-weight:bold;">${row + 1}巡目</td>`;
        for (let pIndex = 0; pIndex < GameState.numPlayers; pIndex++) {
            const playerArray = GameState.rosters[pIndex] || [];
            const draftedPlayer = playerArray[row];
            if (draftedPlayer) {
                const ageText = draftedPlayer.age ? `${draftedPlayer.age}歳 ` : '';
                const salText = draftedPlayer.salary ? new Intl.NumberFormat('ja-JP').format(draftedPlayer.salary) : '';
                html += `<td>
                    <div style="font-weight:bold; color:var(--text-primary); font-size: 1.1rem;">${draftedPlayer.name}</div>
                    <div style="font-size:0.75rem; color: var(--text-secondary);">${draftedPlayer.team} - ${draftedPlayer.position}</div>
                    <div style="font-size:0.75rem; color: var(--accent-color);">${ageText}${salText}</div>
                </td>`;
            } else {
                html += `<td class="empty-slot">-</td>`;
            }
        }
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
}

function renderRosterModal() {
    const modal = document.getElementById('roster-modal');
    const body = document.getElementById('roster-modal-body');
    if (!modal || !body) return;
    body.innerHTML = generateRosterHTML();
    modal.style.display = 'flex';
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function handleCSVUpload(file) {
    const statusEl = document.getElementById('csv-status');
    const startBtn = document.getElementById('start-btn');
    const fileNameDisplay = document.getElementById('file-name-display');
    
    fileNameDisplay.textContent = file.name;
    statusEl.textContent = '読み込み中...';
    statusEl.className = 'status-message';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length > 0) {
                statusEl.textContent = 'CSVの読み込みにエラーが発生しました。';
                statusEl.className = 'status-message status-error';
                console.error(results.errors);
                return;
            }
            
            const data = results.data;
            if (data.length === 0) {
                statusEl.textContent = 'データが空です。';
                statusEl.className = 'status-message status-error';
                return;
            }

            const cols = Object.keys(data[0]);
            const nameCol = cols.find(c => c.includes('名前') || c.includes('選手') || c.toLowerCase().includes('name')) || cols[0];
            const teamCol = cols.find(c => c.includes('球団') || c.includes('チーム') || c.toLowerCase().includes('team')) || cols[1] || '';
            const posCol = cols.find(c => c.includes('位置') || c.includes('ポジション') || c.toLowerCase().includes('position')) || cols[2] || '';
            const salaryCol = cols.find(c => c.includes('年俸') || c.includes('金額') || c.toLowerCase().includes('salary')) || '';
            const ageCol = cols.find(c => c.includes('年齢') || c.includes('歳') || c.toLowerCase().includes('age')) || '';

            GameState.csvData = data.map((row, idx) => {
                let parsedSalary = 0;
                if (salaryCol && row[salaryCol]) {
                    parsedSalary = parseInt(String(row[salaryCol]).replace(/[^0-9]/g, ''), 10) || 0;
                }
                let parsedAge = 0;
                if (ageCol && row[ageCol]) {
                    parsedAge = parseInt(String(row[ageCol]).replace(/[^0-9]/g, ''), 10) || 0;
                }

                return {
                    id: row.id || generateId(),
                    originalId: idx,
                    name: row[nameCol] || 'Unknown',
                    team: teamCol ? (row[teamCol] || '-') : '-',
                    position: posCol ? (row[posCol] || '-') : '-',
                    salary: parsedSalary,
                    age: parsedAge,
                    rawData: row
                };
            });

            GameState.availablePlayers = [...GameState.csvData];
            reconstructGlobalTags();

            statusEl.textContent = `${GameState.csvData.length}人の選手データを読み込みました。`;
            statusEl.className = 'status-message status-success';
            startBtn.disabled = false;
        }
    });
}

function renderConnectionScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel setup-screen';
    
    container.innerHTML = `
        <h2 style="text-align:center; margin-bottom: 2rem; font-family: var(--font-display); font-size: 2rem; color: var(--accent-color);">グローバル通信対戦</h2>
        
        <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
            <label class="form-label" style="font-size: 0.9rem; color: var(--warning-color);">共有サーバーURL (Google Apps Script)</label>
            <input type="text" id="gas-url-input" class="form-control" placeholder="https://script.google.com/macros/s/.../exec" value="${SERVER_URL}" style="margin-bottom: 1.5rem; font-size: 0.8rem; background: rgba(0,0,0,0.5);">
            
            <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">ホスト (部屋を作る)</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">※ホストは設定とCSVデータのアップロードを担当します。</p>
            <input type="text" id="host-name" class="form-control" placeholder="あなたの名前" style="margin-bottom: 1rem;">
            <button id="create-room-btn" class="btn btn-primary" style="width: 100%;">新しくルームを作る</button>
        </div>
        
        <div>
            <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">ゲスト (部屋に入る)</h3>
            <input type="text" id="join-room-id" class="form-control" placeholder="5桁のルームID" style="margin-bottom: 0.75rem;" maxlength="5">
            <input type="text" id="join-room-name" class="form-control" placeholder="あなたの名前" style="margin-bottom: 1rem;">
            <button id="join-room-btn" class="btn btn-secondary" style="width: 100%;">ルームに参加する</button>
        </div>
        
        <div id="connection-status" class="status-message" style="margin-top: 1rem;"></div>
        
        <div style="margin-top: 2rem; text-align:center; border-top:1px solid var(--border-color); padding-top:1rem;">
            <button id="offline-btn" class="btn btn-warning-outline" style="width: 100%;">オフラインで開始する</button>
        </div>
    `;
    
    appContainer.appendChild(container);

    const statusEl = document.getElementById('connection-status');

    document.getElementById('create-room-btn').addEventListener('click', async () => {
        const gasUrl = document.getElementById('gas-url-input').value.trim();
        if(!gasUrl) { alert("サーバーURLを入力してください"); return; }
        SERVER_URL = gasUrl;
        localStorage.setItem('NPBDraftApp_GAS_URL', SERVER_URL);

        const hname = document.getElementById('host-name').value.trim() || 'Host';
        statusEl.textContent = 'ルームを作成中...';
        statusEl.className = 'status-message';
        try {
            loadEmbeddedData();
            myPlayerName = hname;
            GameState.playerNames[0] = hname;
            GameState.numPlayers = 1;
            const initState = { phase: 'setup', numPlayers: 1, playerNames: [hname], numRounds: GameState.numRounds };
            const res = await fetch(SERVER_URL + '?path=/create', {
                method: 'POST',
                body: JSON.stringify({ state: initState })
            });
            const data = await res.json();
            
            isOnline = true;
            isHost = true;
            roomId = data.room_id;
            clientId = data.client_id;
            
            GameState.phase = 'setup';
            await broadcastState();
            startHostPolling();
            render();
        } catch (e) {
            statusEl.textContent = '接続に失敗しました。URLを確認してください。';
            statusEl.className = 'status-message status-error';
        }
    });

    document.getElementById('join-room-btn').addEventListener('click', async () => {
        const gasUrl = document.getElementById('gas-url-input').value.trim();
        if(!gasUrl) { alert("サーバーURLを入力してください"); return; }
        SERVER_URL = gasUrl;
        localStorage.setItem('NPBDraftApp_GAS_URL', SERVER_URL);

        const jId = document.getElementById('join-room-id').value.trim();
        const jName = document.getElementById('join-room-name').value.trim() || 'Guest';
        if (!jId) { alert("ルームIDを入力してください"); return; }

        statusEl.textContent = '参加中...';
        try {
            const res = await fetch(SERVER_URL + '?path=/action', {
                method: 'POST',
                body: JSON.stringify({
                    room_id: jId,
                    action: { type: 'join', name: jName }
                })
            });
            const data = await res.json();
            if (data.success) {
                myPlayerName = jName;
                isOnline = true;
                isHost = false;
                roomId = jId;
                startClientPolling();
            } else {
                statusEl.textContent = 'ルームに参加できません。';
            }
        } catch (e) {
            statusEl.textContent = 'エラーが発生しました。';
        }
    });

    document.getElementById('offline-btn').addEventListener('click', () => {
        isOnline = false;
        loadEmbeddedData();
        GameState.phase = 'setup';
        render();
    });
}

function startHostPolling() {
    if (hostActionInterval) clearInterval(hostActionInterval);
    hostActionInterval = setInterval(async () => {
        try {
            const res = await fetch(SERVER_URL + '?path=/poll_actions', {
                method: 'POST',
                body: JSON.stringify({ room_id: roomId, client_id: clientId })
            });
            const data = await res.json();
            if (data.actions) {
                let stateChanged = false;
                for(let action of data.actions) {
                    if (action.type === 'join' && GameState.phase === 'setup') {
                        if (GameState.numPlayers < 4 && !GameState.playerNames.includes(action.name)) {
                            GameState.playerNames[GameState.numPlayers] = action.name;
                            GameState.numPlayers++;
                            stateChanged = true;
                        }
                    }
                    if (action.type === 'ping') {
                        GameState.lastSeen[action.name] = Date.now();
                        stateChanged = true;
                    }
                    if (action.type === 'select_player' && GameState.phase === 'draft_input') {
                        const idx = GameState.playerNames.indexOf(action.name);
                        if (GameState.playersToDraftThisRound.includes(idx) && !GameState.currentSelections[idx]) {
                            const p = findPlayerById(action.playerId) || (action.isSkip ? { id: action.playerId, name: '（選択パス）', team: '-', position: '-', isSkip: true } : null);
                            if (p) {
                                GameState.currentSelections[idx] = p;
                                stateChanged = true;
                            }
                        }
                    }
                    if (action.type === 'confirm_reveal' && GameState.phase === 'draft_reveal') {
                        GameState.confirmedPlayers[action.name] = true;
                        stateChanged = true;
                    }
                }

                // Check for online status
                GameState.playerStatus = {};
                GameState.playerNames.slice(0, GameState.numPlayers).forEach(n => {
                    const last = GameState.lastSeen[n] || 0;
                    GameState.playerStatus[n] = (n === myPlayerName) || (Date.now() - last < 10000);
                });

                // Auto-advance if everyone picking
                if (GameState.phase === 'draft_input') {
                    const pickedCount = Object.keys(GameState.currentSelections).length;
                    if (pickedCount >= GameState.playersToDraftThisRound.length && GameState.playersToDraftThisRound.length > 0) {
                        GameState.phase = 'draft_reveal';
                        stateChanged = true;
                    }
                }

                // Auto-advance if everyone confirmed
                if (GameState.phase === 'draft_reveal') {
                    const unconfirmed = GameState.playerNames.slice(0, GameState.numPlayers).filter(n => !GameState.confirmedPlayers[n]);
                    if (unconfirmed.length === 0) {
                        advanceDraft();
                        stateChanged = true;
                    }
                }

                if (stateChanged) {
                    await broadcastState();
                    render();
                }
            }
        } catch (e) {
            console.error('Host polling error', e);
        }
    }, 3000);
}

async function broadcastState() {
    if (!isHost || !isOnline) return;
    try {
        const lightState = {};
        for (const key of Object.keys(GameState)) {
            if (key === 'lastSeen' || key === 'csvData') continue; 
            if (key === 'availablePlayers') {
                lightState.availablePlayerIds = GameState.availablePlayers.map(p => p.id);
                continue;
            }
            if (key === 'rosters') {
                lightState.rosterIds = GameState.rosters.map(roster => roster.map(p => p ? p.id : null));
                continue;
            }
            if (key === 'currentSelections') {
                const selIds = {};
                for (const k of Object.keys(GameState.currentSelections)) {
                    selIds[k] = GameState.currentSelections[k] ? GameState.currentSelections[k].id : null;
                }
                lightState.currentSelectionIds = selIds;
                continue;
            }
            lightState[key] = GameState[key];
        }
        await fetch(SERVER_URL + '?path=/update', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, client_id: clientId, state: lightState })
        });
        lastVersion++;
    } catch(e) { console.error('broadcastState error', e); }
}

async function sendClientAction(actionObj) {
    if (!isOnline) return;
    try {
        await fetch(SERVER_URL + '?path=/action', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, action: actionObj })
        });
    } catch(e) {}
}

function findPlayerById(id) {
    if (!id) return null;
    if (id.startsWith('skip-')) return { id, name: '（選択パス）', team: '-', position: '-', isSkip: true };
    return GameState.csvData.find(p => p.id === id) || null;
}

function startClientPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(SERVER_URL + '?path=/room&room_id=' + roomId);
            if (res.ok) {
                const data = await res.json();
                if (data.version > lastVersion) {
                    lastVersion = data.version;
                    const s = data.state;
                    if (!GameState.csvData.length) loadEmbeddedData();
                    
                    if (s.availablePlayerIds) {
                        const set = new Set(s.availablePlayerIds);
                        GameState.availablePlayers = GameState.csvData.filter(p => set.has(p.id));
                    }
                    if (s.rosterIds) {
                        GameState.rosters = s.rosterIds.map(r => r.map(id => findPlayerById(id)));
                    }
                    if (s.currentSelectionIds) {
                        const myIdx = GameState.playerNames.indexOf(myPlayerName);
                        const localMine = GameState.currentSelections[myIdx];
                        
                        // Only protect if round/subRound hasn't changed
                        const isSamePhase = (s.currentRound === GameState.currentRound && 
                                             s.currentSubRound === GameState.currentSubRound &&
                                             s.phase === GameState.phase);

                        GameState.currentSelections = {};
                        for (const k of Object.keys(s.currentSelectionIds)) {
                            GameState.currentSelections[k] = findPlayerById(s.currentSelectionIds[k]);
                        }
                        // Protect local selection within the same sub-round context
                        if (isSamePhase && localMine && !GameState.currentSelections[myIdx]) {
                            GameState.currentSelections[myIdx] = localMine;
                        }
                    }
                    const skip = new Set(['availablePlayerIds', 'rosterIds', 'currentSelectionIds', 'csvData', 'availablePlayers', 'rosters', 'currentSelections']);
                    for (const key of Object.keys(s)) {
                        if (!skip.has(key)) GameState[key] = s[key];
                    }
                    render();
                }
            }
            if (isOnline && !isHost) sendClientAction({ type: 'ping', name: myPlayerName });
        } catch(e) {}
    }, 3000);
}

function reconstructGlobalTags() {
    const CE = ['阪神', 'DeNA', '巨人', '中日', '広島', 'ヤクルト'];
    const PA = ['ソフトバンク', '日本ハム', 'オリックス', '楽天', '西武', 'ロッテ'];
    const ceMap = new Map(), paMap = new Map(), otherSet = new Set();
    GameState.csvData.forEach(p => {
        const t = p.team;
        if (!t || t === '-') return;
        let matched = false;
        for (let kw of CE) {
            if (t.includes(kw) || (kw === '巨人' && (t.includes('ジャイアンツ') || t.includes('読売')))) {
                ceMap.set(kw, t); matched = true; break;
            }
        }
        if (!matched) {
            for (let kw of PA) {
                if (t.includes(kw) || (kw === 'ソフトバンク' && (t.includes('ホークス') || t.includes('SoftBank')))) {
                    paMap.set(kw, t); matched = true; break;
                }
            }
        }
        if (!matched) otherSet.add(t);
    });
    GlobalTags.ceLeagueTeams = CE.map(kw => ceMap.get(kw)).filter(Boolean);
    GlobalTags.paLeagueTeams = PA.map(kw => paMap.get(kw)).filter(Boolean);
    GlobalTags.otherTeams = Array.from(otherSet).sort();
}

function loadEmbeddedData() {
    if (typeof EMBEDDED_PLAYERS === 'undefined' || !EMBEDDED_PLAYERS) return;
    GameState.csvData = EMBEDDED_PLAYERS.map((p, idx) => ({
        id: p.id, originalId: idx, name: p.name, team: p.team || '-', position: p.position || '-', salary: p.salary || 0, age: p.age || 0
    }));
    GameState.availablePlayers = [...GameState.csvData];
    reconstructGlobalTags();
}

function getStatusDot(name) {
    const ok = GameState.playerStatus[name] !== false;
    return `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${ok ? 'var(--success-color)' : 'var(--danger-color)'}; margin:0 4px;"></span>`;
}

function renderSetupScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel setup-screen';

    if (!GameState.csvData.length) loadEmbeddedData();

    if (isOnline && !isHost) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h2 style="font-size:2.5rem; color:var(--accent-color);">ROOM: ${roomId}</h2>
                <h3>待機中...</h3>
                <div style="padding: 1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem; text-align:left; margin: 2rem 0;">
                    <h4>参加者</h4>
                    <ul style="color:var(--text-secondary);">
                        ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `<li>${getStatusDot(n)} ${n}</li>`).join('')}
                    </ul>
                </div>
                <button id="back-home-btn" class="btn btn-warning-outline" style="width: 100%;">戻る</button>
            </div>
        `;
        appContainer.appendChild(container);
        document.getElementById('back-home-btn').onclick = () => { GameState.phase = 'connection'; render(); };
        return;
    }
    
    container.innerHTML = `
        <h2 style="text-align:center; margin-bottom: 2rem;">${isOnline ? 'ROOM: ' + roomId : 'SETUP'}</h2>
        <div class="form-group">
            <label class="form-label">${isOnline ? '参加者' : '人数'}</label>
            ${isOnline ? `
                 <div style="padding:1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem;">
                     ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `<div>${getStatusDot(n)} ${n}</div>`).join('')}
                 </div>
            ` : `
                <select id="num-players-select" class="form-control">
                    <option value="2">2人</option><option value="3">3人</option><option value="4">4人</option>
                </select>
                <div id="player-inputs" style="margin-top:1rem;"></div>
            `}
        </div>
        <div class="form-group">
            <label class="form-label">指名人数</label>
            <input type="number" id="num-rounds-input" class="form-control" value="${GameState.numRounds}">
        </div>
        <div class="setup-actions">
            <button id="start-btn" class="btn btn-primary" style="width: 100%;" ${GameState.numPlayers < 2 ? 'disabled' : ''}>開始</button>
        </div>
        <button id="back-home-btn" class="btn btn-warning-outline" style="width: 100%; margin-top:1rem;">戻る</button>
    `;
    appContainer.appendChild(container);

    if (!isOnline) {
        const sel = document.getElementById('num-players-select');
        const cont = document.getElementById('player-inputs');
        const updateInputs = (v) => {
            cont.innerHTML = '';
            for(let i=0; i<v; i++) {
                const inp = document.createElement('input');
                inp.className = 'form-control'; inp.value = GameState.playerNames[i];
                inp.oninput = (e) => GameState.playerNames[i] = e.target.value;
                cont.appendChild(inp);
            }
        };
        sel.onchange = (e) => { GameState.numPlayers = parseInt(e.target.value); updateInputs(GameState.numPlayers); };
        updateInputs(GameState.numPlayers);
    }

    document.getElementById('num-rounds-input').onchange = (e) => { GameState.numRounds = parseInt(e.target.value) || 5; };
    document.getElementById('back-home-btn').onclick = () => { GameState.phase = 'connection'; render(); };
    document.getElementById('start-btn').onclick = async () => {
        saveState();
        GameState.rosters = Array(GameState.numPlayers).fill(0).map(()=>[]);
        GameState.currentRound = 1; GameState.currentSubRound = 1;
        GameState.playersToDraftThisRound = Array.from({length: GameState.numPlayers}, (_, i) => i);
        GameState.phase = 'draft_input';
        if (isOnline && isHost) await broadcastState();
        render();
    };
}

function renderDraftInputIntermission() {
    GameState.phase = 'draft_input';
    render();
}

const getTeamColor = (tName) => {
    if(tName.includes('阪神')) return {bg: '#F5C700', fg: '#000000'}; 
    if(tName.includes('DeNA') || tName.includes('ベイスターズ')) return {bg: '#0055A5', fg: '#ffffff'}; 
    if(tName.includes('巨人') || tName.includes('ジャイアンツ') || tName.includes('読売')) return {bg: '#F97709', fg: '#ffffff'}; 
    if(tName.includes('中日') || tName.includes('ドラゴンズ')) return {bg: '#003595', fg: '#ffffff'}; 
    if(tName.includes('広島') || tName.includes('カープ')) return {bg: '#FF0000', fg: '#ffffff'}; 
    if(tName.includes('ヤクルト') || tName.includes('スワローズ')) return {bg: '#98C145', fg: '#000000'}; 
    if(tName.includes('ソフトバンク') || tName.includes('ホークス')) return {bg: '#F9C700', fg: '#000000'}; 
    if(tName.includes('日本ハム') || tName.includes('ファイターズ')) return {bg: '#4C7B9E', fg: '#ffffff'}; 
    if(tName.includes('オリックス') || tName.includes('バファローズ')) return {bg: '#10284D', fg: '#ffffff'}; 
    if(tName.includes('楽天') || tName.includes('イーグルス')) return {bg: '#860010', fg: '#ffffff'}; 
    if(tName.includes('西武') || tName.includes('ライオンズ')) return {bg: '#1A3C6B', fg: '#ffffff'}; 
    if(tName.includes('ロッテ') || tName.includes('マリーンズ')) return {bg: '#222222', fg: '#ffffff'}; 
    return {bg: '#6B7280', fg: '#ffffff'}; 
};

const getPosColor = (pName) => {
    if(pName.includes('投')) return {bg: '#ef4444', fg: '#ffffff'}; 
    if(pName.includes('捕')) return {bg: '#3b82f6', fg: '#ffffff'}; 
    if(pName.includes('内')) return {bg: '#eab308', fg: '#000000'}; 
    if(pName.includes('外')) return {bg: '#10b981', fg: '#ffffff'}; 
    return {bg: '#6B7280', fg: '#ffffff'};
};

function renderDraftInputScreen() {
    appContainer.innerHTML = '';
    const myIdx = GameState.playerNames.indexOf(myPlayerName);
    const hasSelected = GameState.currentSelections[myIdx] != null;
    const inRound = GameState.playersToDraftThisRound.includes(myIdx);
    const container = document.createElement('div');
    container.className = 'glass-panel';

    let roundText = `第${GameState.currentRound}巡目 ${GameState.currentSubRound > 1 ? '(外れ' + (GameState.currentSubRound-1) + ')' : ''}`;

    if (!inRound || hasSelected) {
        const unpicked = GameState.playersToDraftThisRound.filter(idx => !GameState.currentSelections[idx]);
        const total = GameState.playersToDraftThisRound.length;
        container.innerHTML = `
            <div style="text-align:center; padding:2rem;">
                <h2>他プレイヤーが指名中...</h2>
                <p>${roundText}</p>
                <div style="margin:2rem 0;">
                    <p>指名完了: ${total - unpicked.length} / ${total}</p>
                    <div style="height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                        <div style="height:100%; width:${( (total-unpicked.length)/total ) * 100}%; background:var(--accent-color);"></div>
                    </div>
                </div>
                <div style="text-align:left;">
                    ${GameState.playersToDraftThisRound.map(i => `<div>${getStatusDot(GameState.playerNames[i])} ${GameState.playerNames[i]} ${GameState.currentSelections[i] ? '✅' : '...'}</div>`).join('')}
                </div>
                ${isHost && unpicked.length > 0 ? `
                    <div style="margin-top:2rem; border-top:1px solid var(--border-color); padding-top:1rem;">
                        <p style="font-size:0.8rem; color:var(--warning-color);">（ホスト機能: 不在者のパス）</p>
                        ${unpicked.map(i => `<button class="btn btn-warning-outline" onclick="manualSkip(${i})" style="margin:0.2rem;">${GameState.playerNames[i]}をパス</button>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        appContainer.appendChild(container);
        window.manualSkip = async (idx) => {
            if(!confirm('パスさせますか？')) return;
            GameState.currentSelections[idx] = { id: 'skip-' + Date.now(), name: '（選択パス）', team: '-', position: '-', isSkip: true };
            if (Object.keys(GameState.currentSelections).length >= GameState.playersToDraftThisRound.length) GameState.phase = 'draft_reveal';
            await broadcastState(); render();
        };
        return;
    }

    // Selection UI
    let selected = null;
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>${myPlayerName} の指名</h2>
            <span class="badge badge-accent">${roundText}</span>
        </div>
        
        <div class="filter-controls" style="display:flex; flex-direction:column; gap:0.5rem; margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 0.5rem; border: 1px solid var(--border-color); overflow-x: auto;">
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-secondary); width:60px; flex-shrink:0;">セ:</div>
                <div class="team-pills-container">
                    ${(GlobalTags.ceLeagueTeams || []).map(t => {
                        const style = getTeamColor(t);
                        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>`;
                    }).join('')}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-secondary); width:60px; flex-shrink:0;">パ:</div>
                <div class="team-pills-container">
                    ${(GlobalTags.paLeagueTeams || []).map(t => {
                        const style = getTeamColor(t);
                        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>`;
                    }).join('')}
                </div>
            </div>
            ${(GlobalTags.otherTeams || []).length > 0 ? `
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-secondary); width:60px; flex-shrink:0;">他:</div>
                <div class="team-pills-container">
                    ${GlobalTags.otherTeams.map(t => {
                        const style = getTeamColor(t);
                        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>`;
                    }).join('')}
                </div>
            </div>
            ` : ''}
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-secondary); width:60px; flex-shrink:0;">位置:</div>
                <div class="team-pills-container">
                    ${GlobalTags.positions.map(p => {
                        const style = getPosColor(p);
                        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${p}" class="pos-filter-checkbox" style="display:none;">
                            <span class="team-pill">${p}</span>
                        </label>`;
                    }).join('')}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-secondary); width:60px; flex-shrink:0;">年俸:</div>
                <div class="team-pills-container">
                    ${[
                        {label:'~5000万', range:'0-5000'},
                        {label:'5000万~1億', range:'5001-10000'},
                        {label:'1億~3億', range:'10001-30000'},
                        {label:'3億~', range:'30001-999999'}
                    ].map(opt => `<label class="team-pill-label" style="--brand-bg:var(--accent-color); --brand-fg:#fff;">
                        <input type="checkbox" value="${opt.range}" class="salary-filter-checkbox" style="display:none;">
                        <span class="team-pill">${opt.label}</span>
                    </label>`).join('')}
                </div>
            </div>
        </div>

        <input type="text" id="p-search" class="form-control" placeholder="検索..." style="margin:1rem 0;">
        <div id="sel-info" style="padding:1rem; background:rgba(0,0,0,0.2); border:1px dashed var(--border-color); border-radius:1rem; margin-bottom:1rem; min-height:60px;">
            <p style="text-align:center; color:var(--text-secondary);">選手を選択してください</p>
        </div>
        <div style="max-height:350px; overflow-y:auto; border:1px solid var(--border-color); border-radius:0.5rem;">
            <table class="player-table">
                <thead style="position:sticky; top:0; background:var(--bg-card);"><tr><th>名前</th><th>球団</th><th>位置</th><th>年俸</th></tr></thead>
                <tbody id="p-list"></tbody>
            </table>
        </div>
        <div style="margin-top:1.5rem; display:flex; gap:1rem;">
            <button id="conf-btn" class="btn btn-primary" disabled style="flex:2;">指名を確定する</button>
            <button id="skip-btn" class="btn btn-warning-outline" style="flex:1;">パスする</button>
        </div>
    `;
    appContainer.appendChild(container);

    const list = document.getElementById('p-list'), info = document.getElementById('sel-info'), btn = document.getElementById('conf-btn');
    const draw = (f='') => {
        list.innerHTML = '';
        const lowerFilter = f.toLowerCase();
        
        const fTeams = Array.from(document.querySelectorAll('.team-filter-checkbox:checked')).map(cb => cb.value);
        const fPosArr = Array.from(document.querySelectorAll('.pos-filter-checkbox:checked')).map(cb => cb.value);
        const fSalaries = Array.from(document.querySelectorAll('.salary-filter-checkbox:checked')).map(cb => cb.value);

        GameState.availablePlayers.filter(p => {
            if (fTeams.length > 0 && !fTeams.includes(p.team)) return false;
            if (fPosArr.length > 0 && !fPosArr.some(filterPos => p.position.includes(filterPos))) return false;
            
            if (fSalaries.length > 0) {
                const match = fSalaries.some(rangeStr => {
                    const [min, max] = rangeStr.split('-').map(Number);
                    return p.salary >= min && p.salary <= max;
                });
                if (!match) return false;
            }
            
            if (lowerFilter) {
                return p.name.toLowerCase().includes(lowerFilter) || 
                       p.team.toLowerCase().includes(lowerFilter) ||
                       p.position.toLowerCase().includes(lowerFilter);
            }
            return true;
        }).slice(0,50).forEach(p => {
            const tr = document.createElement('tr'); tr.className = 'player-row';
            if(selected && selected.id === p.id) tr.classList.add('selected');
            tr.innerHTML = `<td>${p.name}</td><td>${p.team}</td><td>${p.position}</td><td style="font-size:0.8rem;">${p.salary}万</td>`;
            tr.onclick = () => {
                selected = p; draw(f);
                info.innerHTML = `<h3>${p.name} <span style="font-size:0.8rem;">(${p.team})</span></h3>`;
                btn.disabled = false;
            };
            list.appendChild(tr);
        });
    };
    draw();
    document.getElementById('p-search').oninput = (e) => draw(e.target.value);
    document.querySelectorAll('.team-filter-checkbox, .pos-filter-checkbox, .salary-filter-checkbox').forEach(cb => {
        cb.onchange = () => draw(document.getElementById('p-search').value);
    });
    const finalize = async (p) => {
        if(isOnline) await sendClientAction({ type: 'select_player', name: myPlayerName, playerId: p.id, isSkip: !!p.isSkip });
        GameState.currentSelections[myIdx] = p;
        if(isHost && Object.keys(GameState.currentSelections).length >= GameState.playersToDraftThisRound.length) GameState.phase = 'draft_reveal';
        if(isOnline && isHost) await broadcastState();
        render();
    };
    btn.onclick = () => finalize(selected);
    document.getElementById('skip-btn').onclick = () => { if(confirm('パスしますか？')) finalize({id:'skip-'+Date.now(), name:'（選択パス）', team:'-', position:'-', isSkip:true}); };
}

function renderDraftRevealScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';
    container.style.textAlign = 'center';

    let roundText = `第${GameState.currentRound}巡目 ${GameState.currentSubRound > 1 ? '(外れ' + (GameState.currentSubRound-1) + ')' : ''}`;

    // 1. Lottery View (Dedicated)
    if (GameState.activeLottery) {
        const al = GameState.activeLottery;
        const playerObj = findPlayerById(al.playerId);
        const elapsed = Date.now() - al.startTime;
        const isFinished = elapsed >= 3000 || GameState.lotteryResults[al.playerId];

        container.innerHTML = `
            <div style="padding:2rem;">
                <h2 style="color:var(--warning-color); font-size:2rem; margin-bottom:1rem;">抽選中...</h2>
                <div class="glass-panel" style="background:rgba(245, 158, 11, 0.1); border:1px solid var(--warning-color); padding:2rem;">
                    <h3 style="font-size:2.5rem; margin-bottom:1rem;">${playerObj ? playerObj.name : '選手'}</h3>
                    <p style="color:var(--text-secondary); margin-bottom:2rem;">競合: ${al.participants.map(i => GameState.playerNames[i]).join(', ')}</p>
                    <div id="lottery-display" style="font-size:3rem; font-weight:bold; min-height:4rem; color:var(--accent-color);">
                        ${GameState.playerNames[al.participants[Math.floor((Date.now() / 100) % al.participants.length)]]}
                    </div>
                </div>
            </div>
        `;
        appContainer.appendChild(container);

        if (!isFinished) {
            setTimeout(render, 100);
        } else {
            const res = GameState.lotteryResults[al.playerId];
            if (res) {
                const winnerName = GameState.playerNames[res.winnerIndex];
                document.getElementById('lottery-display').innerHTML = `<span class="lottery-winner-anim" style="color:var(--success-color)">交渉権獲得: ${winnerName}</span>`;
            }
        }
        return;
    }

    // 2. Standard Reveal Grid
    container.innerHTML = `
        <h2 style="color:var(--accent-color);">${roundText} 結果発表</h2>
        <div class="reveal-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:1rem; margin:2rem 0;"></div>
        <div id="lottery-box"></div>
        <div id="proceed-box" style="margin-top:2rem;"></div>
    `;
    appContainer.appendChild(container);

    const grid = container.querySelector('.reveal-grid');
    GameState.playersToDraftThisRound.forEach(idx => {
        const p = GameState.currentSelections[idx];
        if(!p) return;
        const card = document.createElement('div');
        card.className = 'glass-panel reveal-card-pop'; card.style.padding = '1rem';
        card.innerHTML = `<div style="font-size:0.8rem; color:var(--text-secondary);">${GameState.playerNames[idx]}</div><div style="font-weight:bold;">${p.name}</div><div style="font-size:0.75rem;">${p.team}</div>`;
        grid.appendChild(card);
    });

    const groups = {};
    Object.keys(GameState.currentSelections).forEach(idx => {
        const p = GameState.currentSelections[idx];
        if(!p || p.isSkip) return;
        if(!groups[p.id]) groups[p.id] = { p, observers: [] };
        groups[p.id].observers.push(parseInt(idx));
    });

    const dups = Object.values(groups).filter(g => g.observers.length > 1);
    const singles = Object.values(groups).filter(g => g.observers.length === 1);
    const lBox = document.getElementById('lottery-box');

    const run = async () => {
        singles.forEach(g => {
            const winIdx = g.observers[0];
            GameState.rosters[winIdx][GameState.currentRound-1] = g.p;
            GameState.availablePlayers = GameState.availablePlayers.filter(x => x.id !== g.p.id);
        });
        
        for(const g of dups) {
            const res = GameState.lotteryResults[g.p.id];
            const div = document.createElement('div'); div.className = 'glass-panel'; div.style.margin = '1rem 0;';
            div.innerHTML = `<h4>${g.p.name} の抽選</h4><div id="r-${g.p.id}"></div>`;
            lBox.appendChild(div);
            const rDiv = document.getElementById('r-' + g.p.id);

            if(res) {
                const name = GameState.playerNames[res.winnerIndex];
                rDiv.innerHTML = `<span style="color:var(--success-color)">交渉権獲得: ${name}</span>`;
                GameState.rosters[res.winnerIndex][GameState.currentRound-1] = g.p;
                GameState.availablePlayers = GameState.availablePlayers.filter(x => x.id !== g.p.id);
            } else if(isHost) {
                const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = '抽選する';
                rDiv.appendChild(b);
                b.onclick = async () => {
                    b.style.display = 'none';
                    // Start synced lottery
                    GameState.activeLottery = { 
                        playerId: g.p.id, 
                        participants: g.observers, 
                        startTime: Date.now(), 
                        isRunning: true 
                    };
                    await broadcastState();
                    render();

                    // Wait for animation
                    setTimeout(async () => {
                        const winIdx = g.observers[Math.floor(Math.random()*g.observers.length)];
                        GameState.lotteryResults[g.p.id] = { winnerIndex: winIdx };
                        GameState.activeLottery = null;
                        await broadcastState(); 
                        render();
                    }, 4000);
                };
            } else {
                rDiv.innerHTML = 'ホストの抽選待ち...';
            }
        }
        
        const hasPendingLottery = dups.some(g => !GameState.lotteryResults[g.p.id]);
        if(!hasPendingLottery) showProceed();
    };

    const showProceed = () => {
        const box = document.getElementById('proceed-box');
        const ok = GameState.confirmedPlayers[myPlayerName];
        if(!ok) {
            const btn = document.createElement('button'); btn.className = 'btn btn-success'; btn.textContent = 'OK (3秒待機)';
            box.appendChild(btn);
            const fn = async () => { if(GameState.confirmedPlayers[myPlayerName]) return; GameState.confirmedPlayers[myPlayerName]=true; if(isOnline) await sendClientAction({type:'confirm_reveal', name:myPlayerName}); render(); };
            btn.onclick = fn; setTimeout(fn, 3000);
        } else {
            const un = GameState.playerNames.slice(0, GameState.numPlayers).filter(n => !GameState.confirmedPlayers[n]);
            box.innerHTML = un.length ? `<p>他プレイヤー待機中: ${un.join(', ')}</p>` : '<p>次へ進みます...</p>';
        }
    };
    run();
}

async function advanceDraft() {
    GameState.lotteryResults = {}; GameState.confirmedPlayers = {};
    const losers = [];
    GameState.playersToDraftThisRound.forEach(idx => {
        if(!GameState.rosters[idx][GameState.currentRound-1]) losers.push(idx);
    });

    if(losers.length) {
        GameState.playersToDraftThisRound = losers; GameState.currentSubRound++;
    } else {
        GameState.currentRound++; GameState.currentSubRound = 1;
        GameState.playersToDraftThisRound = Array.from({length: GameState.numPlayers}, (_, i) => i);
    }
    GameState.currentSelections = {};
    GameState.phase = (GameState.currentRound > GameState.numRounds) ? 'final_result' : 'draft_input';
    if(isOnline && isHost) await broadcastState();
}

function renderFinalResultScreen() {
    appContainer.innerHTML = '<div class="glass-panel" style="text-align:center;"><h2>ドラフト完了！</h2>' + generateRosterHTML() + '<button class="btn btn-primary" onclick="location.reload()" style="margin-top:2rem;">最初に戻る</button></div>';
}

function render() {
    updateGlobalUI();
    const p = GameState.phase;
    if(p==='connection') renderConnectionScreen();
    else if(p==='setup') renderSetupScreen();
    else if(p==='draft_input') renderDraftInputScreen();
    else if(p==='draft_reveal') renderDraftRevealScreen();
    else if(p==='final_result') renderFinalResultScreen();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('undo-btn').onclick = () => { if(confirm('戻しますか？')) undoState(); };
    document.getElementById('view-roster-btn').onclick = renderRosterModal;
    document.getElementById('close-roster-btn').onclick = () => { document.getElementById('roster-modal').style.display='none'; };
    window.addEventListener('beforeunload', (e) => { if(GameState.phase!=='connection'&&GameState.phase!=='final_result') { e.preventDefault(); e.returnValue='終了しますか？'; }});
    render();
});
