import re

with open('c:/Users/toshi/.gemini/antigravity/playground/chrono-magnetar/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Globals
code = re.sub(
    r'const GameState = \{.*?\n\s+rosters: \[\[\], \[\], \[\], \[\]\]\n\};',
    '''let isOnline = false;
let isHost = false;
let roomId = null;
let clientId = null;
let lastVersion = 0;
const SERVER_URL = 'http://127.0.0.1:8080';
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
    rosters: [[], [], [], []]
};''', code, flags=re.DOTALL)

# 2. updateGlobalUI
code = re.sub(
    r'if \(GameState\.phase === \'setup\' \|\| GameState.phase === \'final_result\'\).*?\} else \{.*?\}',
    '''if (GameState.phase === 'connection' || GameState.phase === 'setup' || GameState.phase === 'final_result') {
        if(undoBtn) undoBtn.style.display = 'none';
        if(rosterBtn) rosterBtn.style.display = 'none';
    } else {
        if(undoBtn) undoBtn.style.display = (GameStateHistory.length > 0 && (!isOnline || isHost)) ? 'inline-flex' : 'none';
        if(rosterBtn) rosterBtn.style.display = 'inline-flex';
    }''', code, flags=re.DOTALL
)

# 3. Connection and Setup Screen
# Find Setup screen and replace it.
setup_regex = r'function renderSetupScreen\(\) \{.*?\}\n\n// Draft Input Phase'

connection_and_setup = '''
// Network & Connection Phase
function renderConnectionScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel setup-screen';
    
    container.innerHTML = `
        <h2 style="text-align:center; margin-bottom: 2rem; font-family: var(--font-display); font-size: 2rem; color: var(--accent-color);">オンライン対戦</h2>
        
        <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">ホスト (部屋を作る)</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">※ホストは設定とCSVのアップロードを担当します。</p>
            <input type="text" id="host-name" class="form-control" placeholder="あなたの名前" style="margin-bottom: 1rem;">
            <button id="create-room-btn" class="btn btn-primary" style="width: 100%;">ルームを作成する</button>
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
        const hname = document.getElementById('host-name').value.trim() || 'Host';
        statusEl.textContent = 'ルームを作成中...';
        statusEl.className = 'status-message';
        try {
            myPlayerName = hname;
            GameState.playerNames[0] = hname;
            GameState.numPlayers = 1;
            const res = await fetch(SERVER_URL + '/create', {
                method: 'POST',
                body: JSON.stringify({ state: GameState })
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
            statusEl.textContent = 'サーバーへの接続に失敗しました。';
            statusEl.className = 'status-message status-error';
        }
    });

    document.getElementById('join-room-btn').addEventListener('click', async () => {
        const jId = document.getElementById('join-room-id').value.trim();
        const jName = document.getElementById('join-room-name').value.trim() || 'Guest';
        if (!jId) {
            statusEl.textContent = 'ルームIDを入力してください。';
            statusEl.className = 'status-message status-error';
            return;
        }
        statusEl.textContent = 'ルームに接続中...';
        statusEl.className = 'status-message';
        try {
            const tempCid = generateId();
            const res = await fetch(SERVER_URL + '/action', {
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
                statusEl.textContent = 'ルームが見つかりません。';
                statusEl.className = 'status-message status-error';
            }
        } catch (e) {
            statusEl.textContent = 'サーバーエラーが発生しました。';
            statusEl.className = 'status-message status-error';
        }
    });
    
    document.getElementById('offline-btn').addEventListener('click', () => {
        isOnline = false;
        GameState.phase = 'setup';
        render();
    });
}

function startHostPolling() {
    if (hostActionInterval) clearInterval(hostActionInterval);
    hostActionInterval = setInterval(async () => {
        try {
            const res = await fetch(SERVER_URL + '/poll_actions', {
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
                    if (action.type === 'select_player' && GameState.phase === 'draft_input') {
                        const currentPlayerIndex = GameState.playersToDraftThisRound[GameState.currentPlayerTurnIndex];
                        if (GameState.playerNames[currentPlayerIndex] === action.name) {
                            saveState();
                            GameState.currentSelections[currentPlayerIndex] = action.payload;
                            GameState.currentPlayerTurnIndex++;
                            
                            if (GameState.currentPlayerTurnIndex >= GameState.playersToDraftThisRound.length) {
                                GameState.phase = 'draft_reveal';
                            } else {
                                GameState.phase = 'draft_input_intermission';
                            }
                            stateChanged = true;
                        }
                    }
                }
                if (stateChanged) {
                    await broadcastState();
                    render();
                }
            }
        } catch (e) {}
    }, 500);
}

async function broadcastState() {
    if (!isHost || !isOnline) return;
    try {
        await fetch(SERVER_URL + '/update', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, client_id: clientId, state: GameState })
        });
        lastVersion++;
    } catch(e) {}
}

async function sendClientAction(actionObj) {
    if (!isOnline) return;
    try {
        await fetch(SERVER_URL + '/action', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, action: actionObj })
        });
    } catch(e) {}
}

function startClientPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(SERVER_URL + '/room?room_id=' + roomId);
            if (res.ok) {
                const data = await res.json();
                if (data.version > lastVersion) {
                    lastVersion = data.version;
                    
                    Object.assign(GameState, data.state);
                    
                    if (GameState.csvData && GameState.csvData.length > 0 && (!GlobalTags.ceLeagueTeams || GlobalTags.ceLeagueTeams.length === 0)) {
                        reconstructGlobalTags();
                    }
                    
                    render();
                }
            }
        } catch(e) {}
    }, 500);
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

function renderSetupScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel setup-screen';

    if (isOnline && !isHost) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h2 style="font-size:2.5rem; color:var(--accent-color); margin-bottom: 2rem;">ROOM: ${roomId}</h2>
                <h3 style="margin-bottom: 1rem;">待機中...</h3>
                <p style="color:var(--text-secondary); margin-bottom: 2rem;">ホストがドラフト設定を行い、開始するのをお待ちください。</p>
                <div style="padding: 1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem; text-align:left;">
                    <h4>参加メンバー</h4>
                    <ul style="margin-top:0.5rem; color:var(--text-secondary);">
                        ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `<li>${n}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        appContainer.appendChild(container);
        return;
    }
    
    container.innerHTML = `
        <h2 style="text-align:center; margin-bottom: 2rem; font-family: var(--font-display); font-size: 2rem;">${isOnline ? 'ROOM: ' + roomId : 'GAME SETUP'}</h2>
        
        ${isOnline ? `
        <div class="form-group">
            <label class="form-label">参加メンバー (${GameState.numPlayers}人)</label>
            <div style="padding: 1rem; background:rgba(0,0,0,0.2); border-radius:0.5rem; color:var(--text-secondary);">
                ${GameState.playerNames.slice(0, GameState.numPlayers).map((n, i) => `<div>${i+1}. ${n} ${i === 0 ? '(Host)' : ''}</div>`).join('')}
            </div>
            <p style="font-size:0.75rem; color:var(--accent-color); margin-top:0.5rem;">※ゲストが参加するごとに自動更新されます</p>
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
            <label class="form-label">選手データ (CSV)</label>
            <div class="file-upload-wrapper">
                <div class="file-upload-button">
                    <span id="file-name-display">CSVファイルを選択（必須）</span>
                </div>
                <input type="file" id="csv-upload" class="file-upload-input" accept=".csv">
            </div>
            <div id="csv-status" class="status-message"></div>
        </div>
        
        <div class="setup-actions">
            <button id="start-btn" class="btn btn-primary" ${GameState.availablePlayers.length === 0 ? 'disabled' : ''} style="width: 100%; font-size: 1.25rem;">ドラフトを開始する</button>
        </div>
    `;
    
    appContainer.appendChild(container);

    if (!isOnline) {
        const numPlayersSelect = document.getElementById('num-players-select');
        const playerInputsContainer = document.getElementById('player-inputs');
        
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
        renderPlayerInputs(GameState.numPlayers);

        numPlayersSelect.addEventListener('change', (e) => {
            GameState.numPlayers = parseInt(e.target.value, 10);
            renderPlayerInputs(GameState.numPlayers);
        });
    }

    document.getElementById('num-rounds-input').addEventListener('change', (e) => {
        GameState.numRounds = parseInt(e.target.value, 10) || 5;
        if (isOnline && isHost) broadcastState();
    });

    document.getElementById('csv-upload').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const statusEl = document.getElementById('csv-status');
            const startBtn = document.getElementById('start-btn');
            
            Papa.parse(e.target.files[0], {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.errors.length > 0) {
                        statusEl.textContent = 'CSVエラー'; return;
                    }
                    const data = results.data;
                    const cols = Object.keys(data[0]);
                    const nameCol = cols.find(c => c.includes('名前') || c.includes('選手') || c.toLowerCase().includes('name')) || cols[0];
                    const teamCol = cols.find(c => c.includes('球団') || c.includes('チーム') || c.toLowerCase().includes('team')) || cols[1] || '';
                    const posCol = cols.find(c => c.includes('位置') || c.includes('ポジション') || c.toLowerCase().includes('position')) || cols[2] || '';
                    const salaryCol = cols.find(c => c.includes('年俸') || c.includes('金額') || c.toLowerCase().includes('salary')) || '';
                    const ageCol = cols.find(c => c.includes('年齢') || c.includes('歳') || c.toLowerCase().includes('age')) || '';

                    GameState.csvData = data.map((row, idx) => {
                        let parsedSalary = salaryCol && row[salaryCol] ? parseInt(String(row[salaryCol]).replace(/[^0-9]/g, ''), 10) || 0 : 0;
                        let parsedAge = ageCol && row[ageCol] ? parseInt(String(row[ageCol]).replace(/[^0-9]/g, ''), 10) || 0 : 0;
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
                    
                    statusEl.textContent = `${GameState.csvData.length}人のデータを読み込み完了`;
                    statusEl.className = 'status-message status-success';
                    document.getElementById('start-btn').disabled = false;
                    
                    if (isOnline && isHost) broadcastState();
                }
            });
        }
    });

    document.getElementById('start-btn').addEventListener('click', async () => {
        saveState();
        GameState.rosters = Array(GameState.numPlayers).fill(null).map(() => []);
        GameState.currentRound = 1;
        GameState.currentSubRound = 1;
        GameState.currentSelections = {};
        
        GameState.playersToDraftThisRound = Array.from({length: GameState.numPlayers}, (_, i) => i);
        GameState.currentPlayerTurnIndex = 0;
        
        GameState.phase = 'draft_input_intermission';
        if (isOnline && isHost) await broadcastState();
        render();
    });
}

// Draft Input Phase
'''
code = re.sub(setup_regex, connection_and_setup, code, flags=re.DOTALL)

# 4. Intermission
intermission_old = r'const playerName = GameState.playerNames\[currentPlayerIndex\];\n\s+const container = document.createElement\(\'div\'\);\n\s+container.className = \'glass-panel intermission-screen\';\n\s+let roundText = `第\$\{GameState.currentRound\}巡選択希望選手`;\n\s+if \(GameState.currentSubRound > 1\) \{\n\s+roundText \+= ` \(外れ\$\{GameState.currentSubRound - 1\}回目\)`;\n\s+\}\n\s+container.innerHTML = `\n\s+<h2.*?準備OK.*?</div>\n\s*`;\n\s*appContainer.appendChild\(container\);\n\s*document.getElementById\(\'ready-btn\'\).addEventListener\(\'click\', \(\) => \{\n\s*GameState.phase = \'draft_input\';\n\s*render\(\);\n\s*\}\);'

intermission_new = '''const playerName = GameState.playerNames[currentPlayerIndex];
    const isMyTurn = !isOnline || playerName === myPlayerName;
    
    const container = document.createElement('div');
    container.className = 'glass-panel intermission-screen';
    
    let roundText = `第${GameState.currentRound}巡選択希望選手`;
    if (GameState.currentSubRound > 1) {
        roundText += ` (外れ${GameState.currentSubRound - 1}回目)`;
    }

    if (!isMyTurn) {
        container.innerHTML = `
            <h2 style="font-size: 2.5rem; margin-bottom: 1rem;"><span style="color:var(--accent-color)">${playerName}</span> さんが指名中...</h2>
            <p style="color:var(--text-secondary); margin-bottom: 2rem; font-size: 1.25rem;">${roundText}</p>
            <p style="color: var(--text-secondary);">しばらくお待ちください。</p>
        `;
        appContainer.appendChild(container);
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
    }'''
code = re.sub(intermission_old, intermission_new, code, flags=re.DOTALL)

# 5. Confirm button
confirm_btn_regex = r'confirmBtn.addEventListener\(\'click\', \(\) => \{\n\s*if \(\!selectedPlayer\) return;\n\s*saveState\(\);\n\s*GameState.currentSelections\[currentPlayerIndex\] = selectedPlayer;\n\s*GameState.currentPlayerTurnIndex\+\+;\n\s*if \(GameState.currentPlayerTurnIndex >= GameState.playersToDraftThisRound.length\) \{\n\s*GameState.phase = \'draft_reveal\';\n\s*\} else \{\n\s*GameState.phase = \'draft_input_intermission\';\n\s*\}\n\s*render\(\);\n\s*\}\);'

confirm_btn_new = '''confirmBtn.addEventListener('click', async () => {
        if (!selectedPlayer) return;
        
        if (isOnline && !isHost) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '送信中...';
            await sendClientAction({
                type: 'select_player',
                name: myPlayerName,
                payload: selectedPlayer
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
    });'''
code = re.sub(confirm_btn_regex, confirm_btn_new, code, flags=re.DOTALL)

# 6. Reveal logic guests
reveal_regex = r'const drawBtn = document.getElementById\(`draw-btn-\$\{group.playerObj.id\}`\);\n\s*const resultBox = document.getElementById\(`lottery-result-\$\{group.playerObj.id\}`\);\n\s*drawBtn.addEventListener\(\'click\', \(\) => \{'

reveal_new = '''const drawBtn = document.getElementById(`draw-btn-${group.playerObj.id}`);
            const resultBox = document.getElementById(`lottery-result-${group.playerObj.id}`);

            if (isOnline && !isHost) {
                drawBtn.style.display = 'none';
                resultBox.innerHTML = '<span style="color:var(--text-secondary); font-size:1.25rem;">抽選中...ホストからの結果をお待ちください</span>';
                return; // Guest stops here
            }

            drawBtn.addEventListener('click', () => {'''
code = re.sub(reveal_regex, reveal_new, code, flags=re.DOTALL)

# proceed btn
proceed_regex = r'function showProceedButton\(\) \{\n\s*proceedBtn.style.display = \'block\';\n\s*proceedBtn.onclick = \(\) => \{\n\s*saveState\(\);'
proceed_new = '''function showProceedButton() {
        if (isOnline && !isHost) return;
        proceedBtn.style.display = 'block';
        proceedBtn.onclick = async () => {
            saveState();'''
code = re.sub(proceed_regex, proceed_new, code, flags=re.DOTALL)

# render broadcast after proceed
proceed_btm_regex = r'GameState.phase = \'draft_input_intermission\';\n\s*\}\n\s*\}\n\s*render\(\);\n\s*\};\n\s*\}'
proceed_btm_new = '''GameState.phase = 'draft_input_intermission';
                }
            }
            if (isOnline && isHost) await broadcastState();
            render();
        };
    }'''
code = re.sub(proceed_btm_regex, proceed_btm_new, code, flags=re.DOTALL)

# Router
router_regex = r'switch \(GameState.phase\) \{\n\s*case \'setup\':'
router_new = '''switch (GameState.phase) {
        case 'connection':
            renderConnectionScreen();
            break;
        case 'setup':'''
code = re.sub(router_regex, router_new, code, flags=re.DOTALL)

with open('c:/Users/toshi/.gemini/antigravity/playground/chrono-magnetar/app.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("patched app.js")
