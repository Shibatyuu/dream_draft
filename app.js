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
    losers: [],
    lastSeen: {} 
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
            <h3 style="color:var(--text-primary); margin-bottom: 0.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">${GameState.playerNames[i]}</h3>
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

// Helper to generate IDs
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Validate and parse CSV
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

            // Normalize data - ensure each player has a unique id, name, team, position
            // We'll guess the column names, fallback to just index mapping if needed
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

            // Initialize global tags with grouping
            const CE_ORDER = ['阪神', 'DeNA', '巨人', '中日', '広島', 'ヤクルト'];
            const PA_ORDER = ['ソフトバンク', '日本ハム', 'オリックス', '楽天', '西武', 'ロッテ'];
            const ceMap = new Map();
            const paMap = new Map();
            const otherSet = new Set();

            GameState.csvData.forEach(p => {
                const t = p.team;
                if (!t || t === '-') return;
                
                let matched = false;
                for (let kw of CE_ORDER) {
                    if (t.includes(kw) || (kw === '巨人' && (t.includes('ジャイアンツ') || t.includes('読売')))) {
                        ceMap.set(kw, t); 
                        matched = true; break;
                    }
                }
                if (!matched) {
                    for (let kw of PA_ORDER) {
                        if (t.includes(kw) || (kw === 'ソフトバンク' && (t.includes('ホークス') || t.includes('SoftBank')))) {
                            paMap.set(kw, t);
                            matched = true; break;
                        }
                    }
                }
                if (!matched) {
                    otherSet.add(t);
                }
            });
            
            GlobalTags.ceLeagueTeams = CE_ORDER.map(kw => ceMap.get(kw)).filter(Boolean);
            GlobalTags.paLeagueTeams = PA_ORDER.map(kw => paMap.get(kw)).filter(Boolean);
            GlobalTags.otherTeams = Array.from(otherSet).sort();
            GlobalTags.teams = [...GlobalTags.ceLeagueTeams, ...GlobalTags.paLeagueTeams, ...GlobalTags.otherTeams];

            statusEl.textContent = `${GameState.csvData.length}人の選手データを読み込みました。列名: (${nameCol}, ${teamCol}, ${posCol}, ${ageCol}, ${salaryCol})`;
            statusEl.className = 'status-message status-success';
            
            startBtn.disabled = false;
        }
    });
}

// Network & Connection Phase
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
            <button id="offline-btn" class="btn btn-warning-outline" style="width: 100%;">オンラインを使用せずオフラインで開始する</button>
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
        statusEl.textContent = 'ルームを作成中...(数秒かかります)';
        statusEl.className = 'status-message';
        try {
            loadEmbeddedData();
            myPlayerName = hname;
            GameState.playerNames[0] = hname;
            GameState.numPlayers = 1;
            const initState = { phase: GameState.phase, numPlayers: GameState.numPlayers, playerNames: GameState.playerNames, numRounds: GameState.numRounds };
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
            statusEl.textContent = 'サーバーへの接続に失敗しました。URLが正しいか確認してください。';
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
        if (!jId) {
            statusEl.textContent = 'ルームIDを入力してください。';
            statusEl.className = 'status-message status-error';
            return;
        }
        statusEl.textContent = 'ルームに接続中...（数秒かかります）';
        statusEl.className = 'status-message';
        try {
            // First, fetch the room state to validate if the player can join
            const checkRes = await fetch(SERVER_URL + '?path=/room&room_id=' + jId);
            if (!checkRes.ok) throw new Error("Fetch failed");
            const checkData = await checkRes.json();
            
            if (!checkData.state || Object.keys(checkData.state).length === 0) {
                statusEl.textContent = 'ルームが見つかりません。';
                statusEl.className = 'status-message status-error';
                return;
            }

            const currentState = checkData.state;
            const isOngoing = currentState.phase && currentState.phase !== 'setup' && currentState.phase !== 'connection';
            
            if (isOngoing) {
                // If game is ongoing, the name MUST be already in the participant list
                const names = currentState.playerNames || [];
                if (!names.includes(jName)) {
                    statusEl.textContent = 'ルームIDか名前が違います（進行中のゲームには未登録の名前で参加できません）';
                    statusEl.className = 'status-message status-error';
                    return;
                }
            }

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
                statusEl.textContent = 'ルームに参加できませんでした。';
                statusEl.className = 'status-message status-error';
            }
        } catch (e) {
            statusEl.textContent = 'サーバー通信エラーが発生しました。';
            statusEl.className = 'status-message status-error';
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
            if (data.actions && data.actions.length > 0) {
                let stateChanged = false;
                for(let action of data.actions) {
                    if (action.type === 'join' && GameState.phase === 'setup') {
                        if (GameState.numPlayers < 4) {
                            GameState.playerNames[GameState.numPlayers] = action.name;
                            GameState.numPlayers++;
                            stateChanged = true;
                        }
                    }

                    if (action.type === 'ping') {
                        // Heartbeat from guest
                        GameState.lastSeen[action.name] = Date.now();
                        stateChanged = true;
                    }

                    if (action.type === 'select_player' && (GameState.phase === 'draft_input' || GameState.phase === 'draft_input_intermission')) {
                        const senderIndex = GameState.playerNames.indexOf(action.name);
                        if (GameState.playersToDraftThisRound.includes(senderIndex) && !GameState.currentSelections[senderIndex]) {
                            saveState();
                            const resolvedPlayer = findPlayerById(action.playerId) || action.payload;
                            if (resolvedPlayer) {
                                GameState.currentSelections[senderIndex] = resolvedPlayer;
                                
                                // Check if all players in this sub-round have selected
                                const selectionsCount = Object.keys(GameState.currentSelections).length;
                                if (selectionsCount >= GameState.playersToDraftThisRound.length) {
                                    GameState.phase = 'draft_reveal';
                                } else {
                                    // Move currentPlayerTurnIndex to the next person who hasn't picked yet (for UI display)
                                    while (GameState.currentPlayerTurnIndex < GameState.playersToDraftThisRound.length && 
                                           GameState.currentSelections[GameState.playersToDraftThisRound[GameState.currentPlayerTurnIndex]]) {
                                        GameState.currentPlayerTurnIndex++;
                                    }
                                }
                                stateChanged = true;
                            }
                        }
                    }

                    if (action.type === 'confirm_reveal' && GameState.phase === 'draft_reveal') {
                        GameState.confirmedPlayers[action.name] = true;
                        stateChanged = true;
                    }
                    
                    // Always update lastSeen for any action
                    if (action.name) {
                        GameState.lastSeen[action.name] = Date.now();
                    }
                }
                
                // Host check for auto-advance
                if (isHost && GameState.phase === 'draft_reveal') {
                    const unconfirmed = GameState.playerNames.slice(0, GameState.numPlayers).filter(name => !GameState.confirmedPlayers[name]);
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
        } catch (e) {}
    }, 3000);
}

async function broadcastState() {
    if (!isHost || !isOnline) return;
    try {
        // Send lightweight state: exclude csvData and availablePlayers
        const lightState = {};
        for (const key of Object.keys(GameState)) {
            if (key === 'csvData') continue; // never send
            if (key === 'availablePlayers') {
                // Send only IDs of available players
                lightState.availablePlayerIds = GameState.availablePlayers.map(p => p.id);
                continue;
            }
            if (key === 'rosters') {
                // Send only IDs for rosters
                lightState.rosterIds = GameState.rosters.map(roster => roster.map(p => p ? p.id : null));
                continue;
            }
            if (key === 'currentSelections') {
                // Send only IDs for current selections
                const selIds = {};
                for (const k of Object.keys(GameState.currentSelections)) {
                    const sel = GameState.currentSelections[k];
                    selIds[k] = sel ? sel.id : null;
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
                    const serverState = data.state;
                    
                    // Ensure local embedded data is loaded
                    if (!GameState.csvData || GameState.csvData.length === 0) {
                        loadEmbeddedData();
                    }
                    
                    // Merge lightweight server state back into full local state
                    // Restore availablePlayers from IDs
                    if (serverState.availablePlayerIds) {
                        const idSet = new Set(serverState.availablePlayerIds);
                        GameState.availablePlayers = GameState.csvData.filter(p => idSet.has(p.id));
                    }
                    // Restore rosters from IDs
                    if (serverState.rosterIds) {
                        GameState.rosters = serverState.rosterIds.map(roster => roster.map(id => findPlayerById(id)));
                    }
                    // Restore currentSelections from IDs
                    if (serverState.currentSelectionIds) {
                        GameState.currentSelections = {};
                        for (const k of Object.keys(serverState.currentSelectionIds)) {
                            GameState.currentSelections[k] = findPlayerById(serverState.currentSelectionIds[k]);
                        }
                    }
                    // Copy other simple fields
                    const skipKeys = new Set(['availablePlayerIds', 'rosterIds', 'currentSelectionIds', 'csvData', 'availablePlayers', 'rosters', 'currentSelections']);
                    for (const key of Object.keys(serverState)) {
                        if (!skipKeys.has(key)) {
                            GameState[key] = serverState[key];
                        }
                    }
                    
                    if (!GlobalTags.ceLeagueTeams || GlobalTags.ceLeagueTeams.length === 0) {
                        reconstructGlobalTags();
                    }
                    render();
                }
            }
            
            // Send heartbeat if in setup
            if (isOnline && !isHost && GameState.phase === 'setup') {
                sendClientAction({ type: 'ping', name: myPlayerName });
            }
        } catch(e) {}
    }, 3000);
}

function reconstructGlobalTags() {
    const CE_ORDER = ['阪神', 'DeNA', '巨人', '中日', '広島', 'ヤクルト'];
    const PA_ORDER = ['ソフトバンク', '日本ハム', 'オリックス', '楽天', '西武', 'ロッテ'];
    const ceMap = new Map();
    const paMap = new Map();
    const otherSet = new Set();
    GameState.csvData.forEach(p => {
        const t = p.team;
        if (!t || t === '-') return;
        let matched = false;
        for (let kw of CE_ORDER) {
            if (t.includes(kw) || (kw === '巨人' && (t.includes('ジャイアンツ') || t.includes('読売')))) {
                ceMap.set(kw, t); matched = true; break;
            }
        }
        if (!matched) {
            for (let kw of PA_ORDER) {
                if (t.includes(kw) || (kw === 'ソフトバンク' && (t.includes('ホークス') || t.includes('SoftBank')))) {
                    paMap.set(kw, t); matched = true; break;
                }
            }
        }
        if (!matched) otherSet.add(t);
    });
    GlobalTags.ceLeagueTeams = CE_ORDER.map(kw => ceMap.get(kw)).filter(Boolean);
    GlobalTags.paLeagueTeams = PA_ORDER.map(kw => paMap.get(kw)).filter(Boolean);
    GlobalTags.otherTeams = Array.from(otherSet).sort();
    GlobalTags.teams = [...GlobalTags.ceLeagueTeams, ...GlobalTags.paLeagueTeams, ...GlobalTags.otherTeams];
}

function loadEmbeddedData() {
    if (typeof EMBEDDED_PLAYERS === 'undefined' || !EMBEDDED_PLAYERS) return;
    GameState.csvData = EMBEDDED_PLAYERS.map((p, idx) => ({
        id: p.id,
        originalId: idx,
        name: p.name,
        team: p.team || '-',
        position: p.position || '-',
        salary: p.salary || 0,
        age: p.age || 0
    }));
    GameState.availablePlayers = [...GameState.csvData];
    reconstructGlobalTags();
}

function renderSetupScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel setup-screen';

    // Auto-load embedded data if not already loaded
    if (!GameState.csvData || GameState.csvData.length === 0) {
        loadEmbeddedData();
    }

    if (isOnline && !isHost) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h2 style="font-size:2.5rem; color:var(--accent-color); margin-bottom: 2rem;">ROOM: ${roomId}</h2>
                <h3 style="margin-bottom: 1rem;">待機中...</h3>
                <p style="color:var(--text-secondary); margin-bottom: 2rem;">ホストがドラフト設定を行い、開始するのをお待ちください。</p>
                <div style="padding: 1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem; text-align:left; margin-bottom: 2rem;">
                    <h4>参加メンバー</h4>
                    <ul style="margin-top:0.5rem; color:var(--text-secondary);">
                        ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `<li>${n}</li>`).join('')}
                    </ul>
                </div>
                <button id="back-home-btn" class="btn btn-warning-outline" style="width: 100%;">← ホームに戻る</button>
            </div>
        `;
        appContainer.appendChild(container);
        
        document.getElementById('back-home-btn').addEventListener('click', () => {
            if (confirm('ホームに戻りますか？')) {
                clearInterval(pollInterval);
                GameState.phase = 'connection';
                render();
            }
        });
        return;
    }
    
    const dataLoaded = GameState.csvData && GameState.csvData.length > 0;

    container.innerHTML = `
        <h2 style="text-align:center; margin-bottom: 2rem; font-family: var(--font-display); font-size: 2rem;">${isOnline ? 'ROOM: ' + roomId : 'GAME SETUP'}</h2>
        
        ${isOnline ? `
        <div class="form-group">
            <label class="form-label">参加メンバー (${GameState.numPlayers}人)</label>
            <div style="padding: 1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem; color:var(--text-secondary);">
                ${GameState.playerNames.slice(0, GameState.numPlayers).map((n, i) => {
                    const isMe = n === myPlayerName;
                    const last = GameState.lastSeen[n] || 0;
                    const isOnlineStatus = isMe || (Date.now() - last < 10000);
                    const statusColor = isOnlineStatus ? 'var(--success-color)' : 'var(--danger-color)';
                    return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <span>${i+1}. ${n} ${i === 0 ? '(Host)' : ''}</span>
                        <span style="font-size:0.75rem; color:${statusColor};">● ${isOnlineStatus ? '手動送信可能' : '通信中...'}</span>
                    </div>`;
                }).join('')}
            </div>
            <p style="font-size:0.75rem; color:var(--accent-color); margin-top:0.5rem;">※全員が「通信中」以外になると開始できます</p>
        </div>
        ` : `
        <div class="form-group">
            <label class="form-label">参加人数 (2-4人)</label>
            <select id="num-players-select" class="form-control">
                <option value="2" selected>2人</option>
                <option value="3">3人</option>
                <option value="4">4人</option>
            </select>
        </div>
        
        <div class="form-group" id="player-names-container">
            <label class="form-label">プレイヤーネーム</label>
            <div class="player-name-inputs" id="player-inputs"></div>
        </div>
        `}

        <div class="form-group">
            <label class="form-label">指名人数 (獲得ラウンド数)</label>
            <input type="number" id="num-rounds-input" class="form-control" value="${GameState.numRounds}" min="1" max="20">
        </div>

        <div class="form-group">
            <div style="padding:0.75rem; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:0.5rem; color:var(--success-color); font-size:0.9rem;">
                ✅ 選手データ読み込み済み（${dataLoaded ? GameState.csvData.length + '人' : '未読込'}）
            </div>
        </div>
        
        <div class="setup-actions">
            ${(() => {
                const unready = GameState.playerNames.slice(1, GameState.numPlayers).filter(n => {
                    const last = GameState.lastSeen[n] || 0;
                    return (Date.now() - last >= 10000);
                });
                const canStart = unready.length === 0 && GameState.numPlayers >= 2;
                return `<button id="start-btn" class="btn btn-primary" ${!canStart || !dataLoaded ? 'disabled' : ''} style="width: 100%; font-size: 1.25rem;">
                    ${!canStart ? '通信待機中...' : 'ドラフトを開始する'}
                </button>`;
            })()}
        </div>
        <div style="margin-top: 1.5rem; text-align:center; border-top:1px solid var(--border-color); padding-top:1rem;">
            <button id="back-home-btn" class="btn btn-warning-outline" style="width: 100%;">← ホームに戻る</button>
        </div>
    `;
    
    appContainer.appendChild(container);

    if (!isOnline) {
        const numPlayersSelect = document.getElementById('num-players-select');
        const playerInputsContainer = document.getElementById('player-inputs');
        const currentNumPlayers = parseInt(numPlayersSelect.value, 10);
        
        function renderPlayerInputs(count) {
            playerInputsContainer.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                input.value = GameState.playerNames[i];
                input.placeholder = `プレイヤー${i + 1}の名前`;
                input.dataset.index = i;
                input.addEventListener('input', (e) => {
                    GameState.playerNames[i] = e.target.value || `プレイヤー${i + 1}`;
                });
                playerInputsContainer.appendChild(input);
            }
        }
        renderPlayerInputs(currentNumPlayers);
        numPlayersSelect.addEventListener('change', (e) => {
            GameState.numPlayers = parseInt(e.target.value, 10);
            renderPlayerInputs(GameState.numPlayers);
        });
    }

    document.getElementById('num-rounds-input').addEventListener('change', (e) => {
        GameState.numRounds = parseInt(e.target.value, 10) || 5;
        if (isOnline && isHost) broadcastState();
    });

    const backHomeBtn = document.getElementById('back-home-btn');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', () => {
            GameState.phase = 'connection';
            render();
        });
    }

    document.getElementById('start-btn').addEventListener('click', async () => {
        saveState();
        GameState.rosters = Array(GameState.numPlayers).fill(null).map(() => []);
        GameState.currentRound = 1;
        GameState.currentSubRound = 1;
        GameState.currentSelections = {};
        GameState.confirmedPlayers = {}; // Initialize
        GameState.playersToDraftThisRound = Array.from({length: GameState.numPlayers}, (_, i) => i);
        GameState.currentPlayerTurnIndex = 0;
        GameState.phase = 'draft_input_intermission';
        if (isOnline && isHost) await broadcastState();
        render();
    });
}

// Draft Input Phase
function renderDraftInputIntermission() {
    appContainer.innerHTML = '';
    const currentPlayerIndex = GameState.playersToDraftThisRound[GameState.currentPlayerTurnIndex];
    const playerName = GameState.playerNames[currentPlayerIndex];
    
    const isMyTurn = !isOnline || playerName === myPlayerName;
    
    const container = document.createElement('div');
    container.className = 'glass-panel intermission-screen';
    
    let roundText = `第${GameState.currentRound}巡選択希望選手`;
    if (GameState.currentSubRound > 1) {
        roundText += ` (外れ${GameState.currentSubRound - 1}回目)`;
    }

    if (!isMyTurn) {
        container.innerHTML = `
            <h2 style="font-size: 2.5rem; margin-bottom: 1rem;"><span style="color:var(--accent-color)">他プレイヤー</span> が指名中...</h2>
            <p style="color:var(--text-secondary); margin-bottom: 2rem; font-size: 1.25rem;">${roundText}</p>
            <div style="padding: 1rem; border:1px solid var(--border-color); border-radius:1rem; background:rgba(255,255,255,0.05); margin-bottom: 2rem;">
                <h4 style="margin-bottom:0.5rem;">指名状況:</h4>
                <ul style="list-style:none; padding:0;">
                    ${GameState.playersToDraftThisRound.map(i => {
                        const hasSelected = !!GameState.currentSelections[i];
                        return `<li style="margin-bottom:0.5rem; color:${hasSelected ? 'var(--success-color)' : 'var(--text-secondary)'}">
                            ${hasSelected ? '✓' : '...'} ${GameState.playerNames[i]}
                        </li>`;
                    }).join('')}
                </ul>
            </div>
            ${isHost ? `
            <div style="margin-top:2rem; padding-top:2rem; border-top:1px solid var(--border-color);">
                <p style="font-size:0.9rem; color:var(--warning-color); margin-bottom:1rem;">（ホスト専用：プレイヤーが不在の場合は強制的にスキップさせることができます）</p>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; justify-content:center;">
                    ${GameState.playersToDraftThisRound.filter(i => !GameState.currentSelections[i]).map(i => `
                        <button class="btn btn-warning-outline skip-btn-manual" data-index="${i}">
                             ${GameState.playerNames[i]} をパスさせる
                        </button>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;
        appContainer.appendChild(container);
        
        if (isHost) {
            document.querySelectorAll('.skip-btn-manual').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = parseInt(e.target.dataset.index, 10);
                    const name = GameState.playerNames[idx];
                    if (confirm(`${name} さんをスキップ（パス）させますか？`)) {
                        saveState();
                        GameState.currentSelections[idx] = { 
                            id: 'skip-' + Date.now(), 
                            name: '（選択パス）', 
                            team: '（なし）', 
                            position: '（なし）', 
                            isSkip: true 
                        };
                        
                        const selectionsCount = Object.keys(GameState.currentSelections).length;
                        if (selectionsCount >= GameState.playersToDraftThisRound.length) {
                            GameState.phase = 'draft_reveal';
                        }
                        
                        await broadcastState();
                        render();
                    }
                });
            });
        }
    } else {
        container.innerHTML = `
            <h2 style="font-size: 2.5rem; margin-bottom: 1rem;">次は <span style="color:var(--accent-color)">${playerName}</span> さんの番です</h2>
            <p style="color:var(--text-secondary); margin-bottom: 2rem; font-size: 1.25rem;">${roundText}</p>
            <p style="margin-bottom: 3rem; color: var(--danger-color); font-weight: bold;">※他のプレイヤーは画面を見ないでください</p>
            <button id="ready-btn" class="btn btn-primary" style="font-size: 1.5rem; padding: 1rem 3rem;">準備OK (指名を開始)</button>
        `;
        appContainer.appendChild(container);

        document.getElementById('ready-btn').addEventListener('click', () => {
            GameState.phase = 'draft_input';
            render();
        });
    }
}

function renderDraftInputScreen() {
    appContainer.innerHTML = '';
    const currentPlayerIndex = GameState.playersToDraftThisRound[GameState.currentPlayerTurnIndex];
    const playerName = GameState.playerNames[currentPlayerIndex];
    
    let selectedPlayer = null;

    const container = document.createElement('div');
    container.className = 'glass-panel draft-screen';
    
    let roundText = `第${GameState.currentRound}巡選択希望選手`;
    if (GameState.currentSubRound > 1) {
        roundText += ` (外れ${GameState.currentSubRound - 1})`;
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

    const salaryOptions = [
        {value: '5000', label: '5000万以上'}, 
        {value: '10000', label: '1億以上'}, 
        {value: '20000', label: '2億以上'}
    ];

    container.innerHTML = `
        <div class="draft-header">
            <h2>${playerName} の指名</h2>
            <p style="color:var(--text-secondary);">${roundText}</p>
        </div>
        
        <div class="filter-controls" style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom: 0.5rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 0.5rem; border: 1px solid var(--border-color);">
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); width:80px;">セ・リーグ:</div>
                <div class="team-pills-container">
                    ${(GlobalTags.ceLeagueTeams || []).map(t => {
                        const style = getTeamColor(t);
                        return `
                        <label class="team-pill-label" style="--brand-bg: ${style.bg}; --brand-fg: ${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); width:80px;">パ・リーグ:</div>
                <div class="team-pills-container">
                    ${(GlobalTags.paLeagueTeams || []).map(t => {
                        const style = getTeamColor(t);
                        return `
                        <label class="team-pill-label" style="--brand-bg: ${style.bg}; --brand-fg: ${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>
                        `;
                    }).join('')}
                </div>
            </div>

            ${(GlobalTags.otherTeams || []).length > 0 ? `
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); width:80px;">その他:</div>
                <div class="team-pills-container">
                    ${GlobalTags.otherTeams.map(t => {
                        const style = getTeamColor(t);
                        return `
                        <label class="team-pill-label" style="--brand-bg: ${style.bg}; --brand-fg: ${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;">
                            <span class="team-pill">${t}</span>
                        </label>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}
            
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-top: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary); width:80px;">ポジション:</div>
                <div class="team-pills-container">
                    ${GlobalTags.positions.map(p => {
                        const style = getPosColor(p);
                        return `
                        <label class="team-pill-label" style="--brand-bg: ${style.bg}; --brand-fg: ${style.fg};">
                            <input type="checkbox" value="${p}" class="pos-filter-checkbox" style="display:none;">
                            <span class="team-pill">${p}</span>
                        </label>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); width:80px;">年俸:</div>
                <div class="team-pills-container">
                    ${salaryOptions.map(opt => `
                        <label class="team-pill-label" style="--brand-bg: var(--accent-color); --brand-fg: #ffffff;">
                            <input type="checkbox" value="${opt.value}" class="salary-filter-checkbox" style="display:none;">
                            <span class="team-pill">${opt.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="search-bar">
            <input type="text" id="player-search" class="form-control" placeholder="選手名・球団で検索">
        </div>
        
        <div class="player-list-container">
            <table class="player-table">
                <thead>
                    <tr>
                        <th>名前</th>
                        <th>球団</th>
                        <th>ポジション</th>
                        <th>年齢</th>
                        <th>年俸</th>
                    </tr>
                </thead>
                <tbody id="player-list-body">
                </tbody>
            </table>
        </div>
        
        <div id="selected-info-area"></div>
        
        <div class="setup-actions">
            <button id="confirm-btn" class="btn btn-primary" disabled style="width: 100%; font-size: 1.25rem;">指名を確定して画面を隠す</button>
        </div>
    `;
    
    appContainer.appendChild(container);
    
    const tbody = document.getElementById('player-list-body');
    const searchInput = document.getElementById('player-search');
    const selectedInfoArea = document.getElementById('selected-info-area');
    const confirmBtn = document.getElementById('confirm-btn');

    let activeFilterStr = '';

    function renderPlayers() {
        tbody.innerHTML = '';
        const lowerFilter = activeFilterStr.toLowerCase();
        
        const activeTeamChecks = Array.from(document.querySelectorAll('.team-filter-checkbox:checked'));
        const fTeams = activeTeamChecks.map(cb => cb.value);
        
        const activePosChecks = Array.from(document.querySelectorAll('.pos-filter-checkbox:checked'));
        const fPosArr = activePosChecks.map(cb => cb.value);
        
        const activeSalChecks = Array.from(document.querySelectorAll('.salary-filter-checkbox:checked'));
        const minSalary = activeSalChecks.length > 0 ? Math.min(...activeSalChecks.map(cb => parseInt(cb.value, 10))) : null;

        const filtered = GameState.availablePlayers.filter(p => {
            if (fTeams.length > 0 && !fTeams.includes(p.team)) return false;
            if (fPosArr.length > 0 && !fPosArr.some(filterPos => p.position.includes(filterPos))) return false;
            
            // Salary is 'n円以上' -> greater or equal
            if (minSalary && p.salary < minSalary) return false;

            if (lowerFilter) {
                return p.name.toLowerCase().includes(lowerFilter) || 
                       p.team.toLowerCase().includes(lowerFilter) ||
                       p.position.toLowerCase().includes(lowerFilter);
            }
            return true;
        });

        filtered.forEach(player => {
            const tr = document.createElement('tr');
            tr.className = 'player-row';
            if (selectedPlayer && selectedPlayer.id === player.id) {
                tr.classList.add('selected');
            }
            
            const ageText = player.age ? player.age : '-';
            const salText = player.salary ? new Intl.NumberFormat('ja-JP').format(player.salary) : '-';

            tr.innerHTML = `
                <td><strong>${player.name}</strong></td>
                <td>${player.team}</td>
                <td>${player.position}</td>
                <td>${ageText}</td>
                <td>${salText}</td>
            `;
            
            tr.addEventListener('click', () => {
                selectedPlayer = player;
                renderPlayers(); 
                
                selectedInfoArea.innerHTML = `
                    <div class="selected-player-info">
                        <h3>選択中の選手</h3>
                        <p style="font-size:1.5rem; font-weight:bold;">${player.name} <span style="font-size:1rem; font-weight:normal; color:var(--text-secondary)">(${player.team} - ${player.position})</span></p>
                    </div>
                `;
                confirmBtn.disabled = false;
            });
            
            tbody.appendChild(tr);
        });
    }

    renderPlayers();

    searchInput.addEventListener('input', (e) => {
        activeFilterStr = e.target.value;
        renderPlayers();
    });

    document.querySelectorAll('.team-filter-checkbox').forEach(cb => {
        cb.addEventListener('change', renderPlayers);
    });
    document.querySelectorAll('.pos-filter-checkbox').forEach(cb => {
        cb.addEventListener('change', renderPlayers);
    });
    document.querySelectorAll('.salary-filter-checkbox').forEach(cb => {
        cb.addEventListener('change', renderPlayers);
    });

    confirmBtn.addEventListener('click', async () => {
        if (!selectedPlayer) return;
        
        if (isOnline && !isHost) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '送信中...';
            // Send action to host
            await sendClientAction({
                type: 'select_player',
                name: myPlayerName,
                playerId: selectedPlayer.id
            });
            appContainer.innerHTML = '<h2 style="text-align:center; padding:3rem;">指名を送信しました。ホストの処理待ち...</h2>';
        } else {
            saveState();
            
            GameState.currentSelections[currentPlayerIndex] = selectedPlayer;
            GameState.currentPlayerTurnIndex++;
            
            if (GameState.currentPlayerTurnIndex >= GameState.playersToDraftThisRound.length) {
                GameState.phase = 'draft_reveal';
            } else {
                GameState.phase = 'draft_input_intermission';
            }
            
            if (isOnline && isHost) await broadcastState();
            render();
        }
    });
}

// Draft Reveal & Lottery Phase
function renderDraftRevealScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';
    container.style.textAlign = 'center';

    // Initialize lotteryResults if not present
    if (!GameState.lotteryResults) GameState.lotteryResults = {};

    let roundText = `第${GameState.currentRound}巡選択希望選手`;
    if (GameState.currentSubRound > 1) {
        roundText += ` (外れ${GameState.currentSubRound - 1})`;
    }

    let html = `
        <div class="draft-header">
            <h2>指名結果発表</h2>
            <p style="color:var(--text-secondary);">${roundText}</p>
        </div>
        <div class="reveal-grid" id="reveal-grid"></div>
        <div id="lottery-area" class="lottery-area"></div>
        <div id="proceed-area" class="setup-actions" style="margin-top:2rem;"></div>
    `;

    container.innerHTML = html;
    appContainer.appendChild(container);

    const revealGrid = document.getElementById('reveal-grid');
    const lotteryArea = document.getElementById('lottery-area');
    const proceedBtn = document.getElementById('proceed-btn');

    // Group selections by player targeted
    const targetGroups = {}; 
    for (const pIndex of GameState.playersToDraftThisRound) {
        const selectedPlayer = GameState.currentSelections[pIndex];
        if (!selectedPlayer) continue;
        if (!targetGroups[selectedPlayer.id]) {
            targetGroups[selectedPlayer.id] = { playerObj: selectedPlayer, nominatorIndices: [] };
        }
        targetGroups[selectedPlayer.id].nominatorIndices.push(pIndex);
    }

    // Render cards initially face down or immediately up
    GameState.playersToDraftThisRound.forEach(pIndex => {
        const selectedPlayer = GameState.currentSelections[pIndex];
        if (!selectedPlayer) return;
        const card = document.createElement('div');
        card.className = 'reveal-card reveal-card-pop';
        if (selectedPlayer.isSkip) {
            card.style.opacity = '0.6';
            card.style.borderStyle = 'dashed';
            card.innerHTML = `
                <div class="nominator-name">${GameState.playerNames[pIndex]}</div>
                <div class="nominated-player-name" style="color:var(--text-secondary)">${selectedPlayer.name}</div>
                <div class="nominated-player-team">PASS</div>
            `;
        } else {
            card.innerHTML = `
                <div class="nominator-name">${GameState.playerNames[pIndex]}</div>
                <div class="nominated-player-name">${selectedPlayer.name}</div>
                <div class="nominated-player-team">${selectedPlayer.team} - ${selectedPlayer.position}</div>
            `;
        }
        revealGrid.appendChild(card);
    });

    const duplicates = Object.values(targetGroups).filter(group => group.nominatorIndices.length > 1);
    const singles = Object.values(targetGroups).filter(group => group.nominatorIndices.length === 1);

    GameState.losers = []; 

    async function processDraft() {
        singles.forEach(group => {
            const winnerIndex = group.nominatorIndices[0];
            // CRITICAL FIX: Use index-based assignment to prevent shifting
            GameState.rosters[winnerIndex][GameState.currentRound - 1] = group.playerObj;
            
            if (!group.playerObj.isSkip) {
                GameState.availablePlayers = GameState.availablePlayers.filter(p => p.id !== group.playerObj.id);
            }
        });

        if (duplicates.length === 0) {
            lotteryArea.innerHTML = `<h3 style="color:var(--success-color); margin-top: 2rem;">重複はありませんでした！</h3>`;
            showProceedButton();
            return;
        }

        lotteryArea.innerHTML = `<h3 style="color:var(--warning-color); margin-top: 2rem; margin-bottom: 1rem;">重複が発生しました！抽選を行います。</h3>`;
        
        for (const group of duplicates) {
            await runLotteryForGroup(group);
        }

        // Safety Alignment: Ensure EVERY player in this round has a slot filled
        // Use currentRound - 1 to ensure we are filling the correct horizontal row
        GameState.playersToDraftThisRound.forEach(pIdx => {
             if (!GameState.rosters[pIdx][GameState.currentRound - 1]) {
                 GameState.rosters[pIdx][GameState.currentRound - 1] = { name: '（未指名）', isSkip: true, team: '-', position: '-' };
             }
        });

        showProceedButton();
    }

    function runLotteryForGroup(group) {
        return new Promise((resolve) => {
            const lotteryBox = document.createElement('div');
            lotteryBox.className = 'lottery-box glass-panel';
            lotteryBox.style.marginTop = '1rem';
            lotteryBox.style.padding = '1.5rem';
            lotteryBox.style.background = 'rgba(245, 158, 11, 0.1)';
            lotteryBox.style.border = '1px solid var(--warning-color)';
            
            const participantsText = group.nominatorIndices.map(i => GameState.playerNames[i]).join('、');
            const existingResult = GameState.lotteryResults[group.playerObj.id];
            
            lotteryBox.innerHTML = `
                <h4 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${group.playerObj.name} の抽選</h4>
                <p style="margin-bottom: 1rem; color: var(--text-secondary);">競合: ${participantsText}</p>
                <div id="lottery-result-${group.playerObj.id}" style="font-size: 2rem; font-weight: bold; min-height: 3rem;"></div>
                ${(!isOnline || isHost) && !existingResult ? '<button id="draw-btn-' + group.playerObj.id + '" class="btn btn-primary">抽選スタート</button>' : ''}
            `;
            
            lotteryArea.appendChild(lotteryBox);
            const resultBox = document.getElementById('lottery-result-' + group.playerObj.id);

            // If result already exists (guest re-rendered after host broadcast)
            if (existingResult) {
                const winnerName = GameState.playerNames[existingResult.winnerIndex];
                resultBox.innerHTML = '<span style="color:var(--success-color)">交渉権獲得: ' + winnerName + '</span>';
                
                // CRITICAL FIX: Use index-based assignment
                GameState.rosters[existingResult.winnerIndex][GameState.currentRound - 1] = group.playerObj;
                
                if (!group.playerObj.isSkip) {
                    GameState.availablePlayers = GameState.availablePlayers.filter(p => p.id !== group.playerObj.id);
                }
                group.nominatorIndices.forEach(idx => {
                    if (idx !== existingResult.winnerIndex) GameState.losers.push(idx);
                });
                resolve();
                return;
            }

            // Guest: show waiting message, don't resolve (will re-render on next poll)
            if (isOnline && !isHost) {
                resultBox.innerHTML = '<span style="color:var(--text-secondary); font-size:1.25rem;">ホストが抽選中...しばらくお待ちください 🎲</span>';
                return;
            }

            // Host: show draw button
            const drawBtn = document.getElementById('draw-btn-' + group.playerObj.id);
            drawBtn.addEventListener('click', () => {
                drawBtn.style.display = 'none';
                
                let ticks = 0;
                const interval = setInterval(async () => {
                    const randomNominator = group.nominatorIndices[Math.floor(Math.random() * group.nominatorIndices.length)];
                    resultBox.textContent = GameState.playerNames[randomNominator];
                    ticks++;
                    
                    if (ticks > 20) {
                        clearInterval(interval);
                        const winnerIndex = group.nominatorIndices[Math.floor(Math.random() * group.nominatorIndices.length)];
                        
                        resultBox.innerHTML = '<span style="color:var(--success-color)">交渉権獲得: ' + GameState.playerNames[winnerIndex] + '</span>';
                        resultBox.classList.add('lottery-winner-anim');
                        
                        // CRITICAL FIX: Use index-based assignment
                        GameState.rosters[winnerIndex][GameState.currentRound - 1] = group.playerObj;
                        
                        if (!group.playerObj.isSkip) {
                            GameState.availablePlayers = GameState.availablePlayers.filter(p => p.id !== group.playerObj.id);
                        }
                        
                        // Save lottery result so guests can see it
                        GameState.lotteryResults[group.playerObj.id] = { winnerIndex: winnerIndex };
                        
                        group.nominatorIndices.forEach(idx => {
                            if (idx !== winnerIndex) GameState.losers.push(idx);
                        });
                        
                        // Broadcast after each lottery so guests see results
                        if (isOnline && isHost) await broadcastState();
                        
                        setTimeout(resolve, 1000);
                    }
                }, 100);
                activeIntervals.push(interval);
            });
        });
    }
    setTimeout(processDraft, 1000);
}

async function advanceDraft() {
    saveState();
    GameState.lotteryResults = {};
    GameState.confirmedPlayers = {};
    
    if (GameState.losers.length > 0) {
        GameState.playersToDraftThisRound = [...GameState.losers];
        GameState.losers = [];
        GameState.currentSubRound++;
        GameState.currentPlayerTurnIndex = 0;
        GameState.currentSelections = {};
        GameState.phase = 'draft_input_intermission';
    } else {
        GameState.currentRound++;
        GameState.currentSubRound = 1;
        GameState.playersToDraftThisRound = Array.from({length: GameState.numPlayers}, (_, i) => i);
        GameState.currentPlayerTurnIndex = 0;
        GameState.currentSelections = {};
        
        if (GameState.currentRound > GameState.numRounds) {
            GameState.phase = 'final_result';
        } else {
            GameState.phase = 'draft_input_intermission';
        }
    }
    if (isOnline && isHost) await broadcastState();
    render();
}

function showProceedButton() {
    const revealArea = document.getElementById('proceed-area');
    if (!revealArea) return;
    revealArea.innerHTML = '';
    revealArea.style.textAlign = 'center';

    const isConfirmed = GameState.confirmedPlayers[myPlayerName] === true;

    if (!isConfirmed) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-success';
        confirmBtn.textContent = '内容を確認 (OK)';
        confirmBtn.style.fontSize = '1.25rem';
        confirmBtn.style.padding = '1rem 3rem';
        revealArea.appendChild(confirmBtn);

        const timerText = document.createElement('p');
        timerText.style.marginTop = '0.5rem';
        timerText.style.color = 'var(--text-secondary)';
        timerText.textContent = '3秒後に自動的に次へ進みます...';
        revealArea.appendChild(timerText);

        const doConfirm = () => {
            if (GameState.confirmedPlayers[myPlayerName]) return;
            if (isOnline) {
                sendClientAction({ type: 'confirm_reveal', name: myPlayerName });
            }
            GameState.confirmedPlayers[myPlayerName] = true;
            
            // If offline or if host, trigger checks immediately
            if (!isOnline || isHost) {
                const unconfirmed = GameState.playerNames.slice(0, GameState.numPlayers).filter(name => !GameState.confirmedPlayers[name]);
                if (unconfirmed.length === 0) {
                    advanceDraft();
                }
            }
            render();
        };

        confirmBtn.onclick = doConfirm;
        setTimeout(doConfirm, 3000);
    } else {
        const unconfirmed = GameState.playerNames.slice(0, GameState.numPlayers).filter(name => !GameState.confirmedPlayers[name]);
        if (unconfirmed.length > 0) {
            revealArea.innerHTML = `
                <p style="color:var(--success-color); font-size:1.2rem; margin-bottom:0.5rem;">✓ 確認済み</p>
                <p style="color:var(--warning-color); font-size:0.9rem;">他のプレイヤーの確認を待っています: ${unconfirmed.join('、')}</p>
            `;
        } else {
            revealArea.innerHTML = `<p style="color:var(--success-color); font-size:1.2rem;">✓ 全員確認済み。進行中...</p>`;
        }
    }
}

    // Final Result Phase
function renderFinalResultScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';
    container.style.maxWidth = '100%';
    
    let html = `
        <div class="draft-header" style="text-align:center; margin-bottom: 2rem;">
            <h2 style="font-size: 2.5rem; color: var(--accent-color);">ドラフト完了！</h2>
            <p style="color:var(--text-secondary); font-size: 1.25rem;">各チームの最終的な獲得選手</p>
        </div>
    `;
    
    html += generateRosterHTML();
    
    html += `
        <div class="setup-actions" style="margin-top: 3rem; text-align:center;">
            <button class="btn btn-primary" onclick="location.reload()" style="font-size: 1.25rem; padding: 1rem 3rem;">新しくやり直す</button>
        </div>
    `;
    
    container.innerHTML = html;
    appContainer.appendChild(container);
}

// Router
function render() {
    updateGlobalUI();
    switch (GameState.phase) {
        case 'connection':
            renderConnectionScreen();
            break;
        case 'setup':
            renderSetupScreen();
            break;
        case 'draft_input_intermission':
            renderDraftInputIntermission();
            break;
        case 'draft_input':
            renderDraftInputScreen();
            break;
        case 'draft_reveal':
            renderDraftRevealScreen();
            break;
        case 'final_result':
            renderFinalResultScreen();
            break;
        default:
            appContainer.innerHTML = '<h2>Unknown Phase</h2>';
    }
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (confirm('一つ前の操作に戻りますか？')) {
                undoState();
            }
        });
    }

    const rosterBtn = document.getElementById('view-roster-btn');
    if (rosterBtn) {
        rosterBtn.addEventListener('click', () => {
            renderRosterModal();
        });
    }

    const closeRosterBtn = document.getElementById('close-roster-btn');
    if (closeRosterBtn) {
        closeRosterBtn.addEventListener('click', () => {
            document.getElementById('roster-modal').style.display = 'none';
        });
    }

    window.addEventListener('beforeunload', (e) => {
        if (GameState.phase !== 'connection' && GameState.phase !== 'final_result') {
            e.preventDefault();
            e.returnValue = 'ゲーム進行中ですが、本当に終了しますか？';
        }
    });

    // Mobile stability: re-render or re-force poll when coming back to the tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // When user returns to tab, refresh UI
            render();
        }
    });

    render();
});
