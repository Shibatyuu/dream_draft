const appContainer = document.getElementById('main-content');

function updateGlobalUI() {
    const undoBtn = document.getElementById('undo-btn');
    const rosterBtn = document.getElementById('view-roster-btn');
    const header = document.querySelector('.app-header');

    if (GameState.phase === 'top') {
        if (header) header.style.display = 'none';
    } else {
        if (header) header.style.display = 'flex';
    }

    if (GameState.phase === 'top' || GameState.phase === 'connection' || GameState.phase === 'setup' || GameState.phase === 'final_result') {
        if (undoBtn) undoBtn.style.display = 'none';
        if (rosterBtn) rosterBtn.style.display = 'none';
    } else {
        if (undoBtn) undoBtn.style.display = (GameStateHistory.length > 0 && (!isOnline || isHost)) ? 'inline-flex' : 'none';
        if (rosterBtn) rosterBtn.style.display = 'inline-flex';
    }
}

function getStatusDot(name) {
    const online = GameState.playerStatus[name];
    const color = online ? 'var(--success-color)' : 'var(--text-secondary)';
    const shadow = online ? '0 0 8px var(--success-color)' : 'none';
    return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; box-shadow:${shadow}; margin-right:5px;" title="${online ? 'Online' : 'Offline'}"></span>`;
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
                    <div style="font-size:0.75rem; color: var(--accent-color);">${ageText}${formatSalary(draftedPlayer.salary)}</div>
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

const getTeamColor = (tName) => {
    if (tName.includes('阪神')) return { bg: '#F5C700', fg: '#000000' };
    if (tName.includes('DeNA') || tName.includes('ベイスターズ')) return { bg: '#0055A5', fg: '#ffffff' };
    if (tName.includes('巨人') || tName.includes('ジャイアンツ') || tName.includes('読売')) return { bg: '#F97709', fg: '#ffffff' };
    if (tName.includes('中日') || tName.includes('ドラゴンズ')) return { bg: '#003595', fg: '#ffffff' };
    if (tName.includes('広島') || tName.includes('カープ')) return { bg: '#FF0000', fg: '#ffffff' };
    if (tName.includes('ヤクルト') || tName.includes('スワローズ')) return { bg: '#98C145', fg: '#000000' };
    if (tName.includes('ソフトバンク') || tName.includes('ホークス')) return { bg: '#F9C700', fg: '#000000' };
    if (tName.includes('日本ハム') || tName.includes('ファイターズ')) return { bg: '#4C7B9E', fg: '#ffffff' };
    if (tName.includes('オリックス') || tName.includes('バファローズ')) return { bg: '#10284D', fg: '#ffffff' };
    if (tName.includes('楽天') || tName.includes('イーグルス')) return { bg: '#860010', fg: '#ffffff' };
    if (tName.includes('西武') || tName.includes('ライオンズ')) return { bg: '#1A3C6B', fg: '#ffffff' };
    if (tName.includes('ロッテ') || tName.includes('マリーンズ')) return { bg: '#222222', fg: '#ffffff' };
    return { bg: '#6B7280', fg: '#ffffff' };
};

const getPosColor = (pName) => {
    if (pName.includes('投')) return { bg: '#ef4444', fg: '#ffffff' };
    if (pName.includes('捕')) return { bg: '#3b82f6', fg: '#ffffff' };
    if (pName.includes('内')) return { bg: '#eab308', fg: '#ffffff' };
    if (pName.includes('外')) return { bg: '#10b981', fg: '#ffffff' };
    return { bg: '#6B7280', fg: '#ffffff' };
};

const formatSalary = (val) => {
    if (!val || val === 0) return '-';
    const formatter = new Intl.NumberFormat('ja-JP');
    if (val >= 10000) {
        const oku = Math.floor(val / 10000);
        const man = val % 10000;
        if (man === 0) return `${oku}億円`;
        return `${oku}億${formatter.format(man)}万`;
    }
    return formatter.format(val) + '万';
};

function renderTopScreen() {
    const main = document.getElementById('main-content');
    if (main) main.style.paddingTop = '0px';

    appContainer.innerHTML = `
        <div class="top-screen">
            <h1 class="top-title">ドリーム<br>ドラフト</h1>
            <div id="start-trigger" class="tap-to-start" style="margin-bottom: 3rem;">Tap to Start</div>
            <div id="mute-toggle" style="cursor:pointer; font-size:1.2rem; padding:0.5rem 1rem; border-radius:2rem; background:rgba(255,255,255,0.5); border:1px solid var(--border-color); display:flex; align-items:center; gap:0.5rem; transition:var(--transition); box-shadow:var(--pop-shadow);">
                <span id="mute-icon">${GameState.isMuted ? '🔇' : '🔊'}</span>
                <span id="mute-text">${GameState.isMuted ? '消音中' : 'サウンドON'}</span>
            </div>
        </div>
    `;

    document.getElementById('mute-toggle').onclick = (e) => {
        e.stopPropagation();
        GameState.isMuted = !GameState.isMuted;
        const icon = document.getElementById('mute-icon');
        const text = document.getElementById('mute-text');
        icon.textContent = GameState.isMuted ? '🔇' : '🔊';
        text.textContent = GameState.isMuted ? '消音中' : 'サウンドON';
        if (!GameState.isMuted) Sound.tap();
    };

    document.getElementById('start-trigger').onclick = () => {
        Sound.start();
        if (main) main.style.paddingTop = '';
        GameState.phase = 'connection';
        render();
    };
}

function renderConnectionScreen() {
    appContainer.innerHTML = `
        <div class="glass-panel" style="text-align:center; padding: 2rem; border:none; background:transparent; box-shadow:none;">
            <h2 style="margin-bottom:2rem; font-family:var(--font-sans); font-size:2.5rem; letter-spacing:2px; font-weight:900; color:var(--accent-color);">モード選択</h2>
            <div id="connection-status" class="status-message"></div>
            
            <div style="display:grid; grid-template-columns:1fr; gap:2rem; margin:2rem 0;">
                <div class="glass-panel fade-slide-up" style="padding:1.5rem; border-color:var(--accent-color); text-align:left;">
                    <h3 style="font-size:1.5rem; color:var(--accent-color); margin-bottom:0.5rem;">🛜 オンライン対戦</h3>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1.5rem;">サーバー（GAS等）を経由して、離れた友達とリアルタイムで対戦します。</p>
                    <input type="text" id="gas-url-input" class="form-control" placeholder="コマンドセンター(GAS)のURL" style="margin-bottom:1rem;">
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div style="border:1px solid var(--border-color); padding:1rem; border-radius:1rem; background:rgba(255,255,255,0.4);">
                            <h4 style="font-size:0.9rem; margin-bottom:0.5rem;">ホスト作成</h4>
                            <input type="text" id="host-name" class="form-control" placeholder="名前" style="margin-bottom:0.5rem; height:40px; font-size:0.85rem;">
                            <button id="create-room-btn" class="btn btn-primary" style="width:100%; height:40px; font-size:0.85rem;">ルーム作成</button>
                        </div>
                        <div style="border:1px solid var(--border-color); padding:1rem; border-radius:1rem; background:rgba(255,255,255,0.4);">
                            <h4 style="font-size:0.9rem; margin-bottom:0.5rem;">ゲスト参加</h4>
                            <input type="tel" id="join-room-id" class="form-control" placeholder="ルームID (数字)" style="margin-bottom:0.5rem; height:40px; font-size:0.85rem;" inputmode="numeric" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                            <input type="text" id="join-room-name" class="form-control" placeholder="名前" style="margin-bottom:0.5rem; height:40px; font-size:0.85rem;">
                            <button id="join-room-btn" class="btn btn-secondary" style="width:100%; height:40px; font-size:0.85rem;">参加する</button>
                        </div>
                    </div>
                </div>

                <div class="glass-panel fade-slide-up" style="padding:1.5rem; border-color:var(--success-color); text-align:left; animation-delay: 0.2s;">
                    <h3 style="font-size:1.5rem; color:var(--success-color); margin-bottom:0.5rem;">🏠 オフライン対戦</h3>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1.5rem;">この端末1台を回して交代で操作します。対面での対戦に最適です。</p>
                    <button id="offline-btn" class="btn btn-primary" style="width:100%; padding:1.2rem; font-size:1.4rem; background:var(--success-color); box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3);">オフラインで開始</button>
                </div>
            </div>
            
            <div class="form-group fade-slide-up" style="margin-top:2rem; animation-delay: 0.4s;">
                <label class="form-label">カスタム選手データ (任意)</label>
                <div style="background:rgba(255,255,255,0.5); padding:1rem; border-radius:1rem; border:1px solid var(--border-color);">
                    <p id="file-name-display" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.8rem;">未選択 (デフォルトの選手データを使用)</p>
                    <input type="file" id="csv-upload" accept=".csv" style="display:none;">
                    <button onclick="document.getElementById('csv-upload').click()" class="btn btn-secondary" style="width:100%;">CSVファイルを読み込む</button>
                </div>
                <div id="csv-status" class="status-message"></div>
            </div>
        </div>
    `;

    setupConnectionListeners();
}

function renderSetupScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';

    if (isOnline && !isHost) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h2 style="font-size:2.5rem; color:var(--accent-color);">ROOM: ${roomId}</h2>
                <h3>待機中...</h3>
                <h4 style="font-size:0.9rem; margin-bottom:0.8rem; text-align:left; color:var(--text-secondary);">参加者</h4>
                <div style="padding: 1rem; background:white; border-radius:1rem; border:1px solid var(--border-color); text-align:left; margin-bottom: 1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="display:flex; flex-direction:column; gap:0.4rem;">
                        ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `
                            <div style="display:flex; align-items:center; border-bottom:1px solid #f1f5f9; padding: 0.25rem 0;">
                                ${getStatusDot(n)} <span style="margin-left:0.5rem; color:var(--text-primary); font-size: 0.95rem;">${n}</span>
                            </div>`).join('')}
                    </div>
                </div>
                <!-- 凡例と説明 -->
                <div style="font-size:0.8rem; text-align:left; color:var(--text-secondary); margin-bottom:1.5rem; padding:0.5rem; border-left:3px solid var(--accent-color); background:rgba(14,165,233,0.05);">
                    <div style="display:flex; gap:1rem; margin-bottom:0.6rem;">
                        <span style="display:flex; align-items:center; gap:0.2rem;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--success-color); box-shadow:0 0 5px var(--success-color);"></span> 接続中</span>
                        <span style="display:flex; align-items:center; gap:0.2rem;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--text-secondary);"></span> 未接続</span>
                    </div>
                    <p style="margin:0; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:0.3rem; margin-bottom:0.3rem;">
                        参加者全員のマークが <span style="display:inline-block; vertical-align:middle; width:8px; height:8px; border-radius:50%; background:var(--success-color); box-shadow:0 0 5px var(--success-color);"></span> 緑色（接続中）になるまでお待ちください。
                    </p>
                    <p style="margin:0; font-weight:bold; color:var(--accent-color);">2人以上集まったら開始できます。</p>
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
                 <div style="padding:1rem; background:white; border-radius:1rem; border:1px solid var(--border-color); margin-bottom:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                     <div style="display:flex; flex-direction:column; gap:0.4rem;">
                         ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `
                             <div style="display:flex; align-items:center; border-bottom:1px solid #f1f5f9; padding: 0.25rem 0;">
                                 ${getStatusDot(n)} <span style="margin-left:0.5rem; color:var(--text-primary); font-size: 0.95rem;">${n}</span>
                             </div>`).join('')}
                     </div>
                 </div>
                 <!-- 凡例と説明 -->
                 <div style="font-size:0.8rem; text-align:left; color:var(--text-secondary); margin-bottom:1.5rem; padding:0.5rem; border-left:3px solid var(--accent-color); background:rgba(14,165,233,0.05);">
                    <div style="display:flex; gap:1rem; margin-bottom:0.5rem;">
                        <span style="display:flex; align-items:center; gap:0.2rem;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--success-color); box-shadow:0 0 5px var(--success-color);"></span> 接続中</span>
                        <span style="display:flex; align-items:center; gap:0.2rem;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--text-secondary);"></span> 未接続</span>
                    </div>
                    <p style="margin:0; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:0.3rem; margin-bottom:0.3rem;">
                        参加者全員のマークが <span style="display:inline-block; vertical-align:middle; width:8px; height:8px; border-radius:50%; background:var(--success-color); box-shadow:0 0 5px var(--success-color);"></span> 緑色（接続中）になるまでお待ちください。
                    </p>
                    <p style="margin:0; font-weight:bold; color:var(--accent-color);">2人以上集まったら開始できます。</p>
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
            for (let i = 0; i < v; i++) {
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
    document.getElementById('back-home-btn').onclick = () => { Sound.tap(); GameState.phase = 'connection'; render(); };
    document.getElementById('start-btn').onclick = async () => {
        Sound.tap();
        saveState();
        GameState.rosters = Array(GameState.numPlayers).fill(0).map(() => []);
        GameState.currentRound = 1; GameState.currentSubRound = 1;
        GameState.playersToDraftThisRound = Array.from({ length: GameState.numPlayers }, (_, i) => i);
        GameState.phase = 'draft_input';
        if (isOnline && isHost) await broadcastState();
        render();
    };
}

function renderOfflineIntermission(nextIdx) {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';
    container.style.textAlign = 'center';
    container.style.padding = '3rem 1rem';

    container.innerHTML = `
        <h2 style="color:var(--accent-color); font-size:1.8rem;">指名完了</h2>
        <p style="margin:2rem 0; font-size:1.2rem; color:var(--text-secondary);">デバイスを <strong>${GameState.playerNames[nextIdx]}</strong> さんに渡してください。</p>
        <button id="start-my-turn-btn" class="btn btn-primary" style="width:100%; padding:1.5rem; font-size:1.5rem;">${GameState.playerNames[nextIdx]} さんの番を始める</button>
    `;
    appContainer.appendChild(container);
    document.getElementById('start-my-turn-btn').onclick = () => {
        GameState.phase = 'draft_input';
        render();
    };
}

function renderDraftInputScreen() {
    const wasFocused = document.activeElement && document.activeElement.id === 'p-search';
    const lastSearch = document.getElementById('p-search') ? document.getElementById('p-search').value : (window._lastSearch || '');
    const lastTeams = Array.from(document.querySelectorAll('.team-filter-checkbox:checked')).map(cb => cb.value).length > 0 ?
        Array.from(document.querySelectorAll('.team-filter-checkbox:checked')).map(cb => cb.value) : (window._lastTeams || []);
    const lastPos = Array.from(document.querySelectorAll('.pos-filter-checkbox:checked')).map(cb => cb.value).length > 0 ?
        Array.from(document.querySelectorAll('.pos-filter-checkbox:checked')).map(cb => cb.value) : (window._lastPos || []);
    const lastSals = Array.from(document.querySelectorAll('.salary-filter-checkbox:checked')).map(cb => cb.value).length > 0 ?
        Array.from(document.querySelectorAll('.salary-filter-checkbox:checked')).map(cb => cb.value) : (window._lastSals || []);

    appContainer.innerHTML = '';
    let myIdx = isOnline ? GameState.playerNames.indexOf(myPlayerName) : GameState.playersToDraftThisRound[GameState.currentTurn];
    const hasSelected = isOnline ? (GameState.currentSelections[myIdx] != null) : false;
    const inRound = isOnline ? GameState.playersToDraftThisRound.includes(myIdx) : (myIdx !== undefined);
    const container = document.createElement('div');
    container.className = 'glass-panel';

    let roundText = `第${GameState.currentRound}巡目 ${GameState.currentSubRound > 1 ? '(外れ' + (GameState.currentSubRound - 1) + ')' : ''}`;

    if (isOnline && (!inRound || hasSelected)) {
        const unpicked = GameState.playersToDraftThisRound.filter(idx => !GameState.currentSelections[idx]);
        const total = GameState.playersToDraftThisRound.length;
        container.innerHTML = `
            <div style="text-align:center; padding:2rem;">
                <h2>他プレイヤーが指名中...</h2>
                <p>${roundText}</p>
                <div style="margin:2rem 0;">
                    <p>指名完了: ${total - unpicked.length} / ${total}</p>
                    <div style="height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                        <div style="height:100%; width:${((total - unpicked.length) / total) * 100}%; background:var(--accent-color);"></div>
                    </div>
                </div>
                <div style="text-align:left; display:flex; flex-direction:column; gap:0.5rem; margin-top: 1rem;">
                    ${GameState.playersToDraftThisRound.map(i => `
                        <div style="background:white; padding:0.8rem 1rem; border-radius:1rem; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; box-shadow:var(--pop-shadow);">
                            <div style="display:flex; align-items:center;">${getStatusDot(GameState.playerNames[i])} <span style="font-weight:bold; color:var(--text-primary);">${GameState.playerNames[i]}</span></div>
                            <span style="font-size:1.2rem;">${GameState.currentSelections[i] ? '✅' : '⏳'}</span>
                        </div>
                    `).join('')}
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
            if (!confirm('パスさせますか？')) return;
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
            <h2>${isOnline ? myPlayerName : GameState.playerNames[GameState.currentTurn]} の指名</h2>
            <span class="badge badge-accent">${roundText}</span>
        </div>
        
        <div class="filter-controls" style="display:flex; flex-direction:column; gap:0.5rem; margin-top: 1rem; overflow-x: auto;">
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:60px; flex-shrink:0;">セ・リーグ</div>
                <div class="team-pills-container">
                    ${(GlobalTags.ceLeagueTeams || []).map(t => {
        const style = getTeamColor(t);
        const isChecked = lastTeams.includes(t) ? 'checked' : '';
        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;" ${isChecked}>
                            <span class="team-pill">${t}</span>
                        </label>`;
    }).join('')}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                 <div style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:60px; flex-shrink:0;">パ・リーグ</div>
                <div class="team-pills-container">
                    ${(GlobalTags.paLeagueTeams || []).map(t => {
        const style = getTeamColor(t);
        const isChecked = lastTeams.includes(t) ? 'checked' : '';
        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;" ${isChecked}>
                            <span class="team-pill">${t}</span>
                        </label>`;
    }).join('')}
                </div>
            </div>
            ${(GlobalTags.otherTeams || []).length > 0 ? `
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:60px; flex-shrink:0;">他チーム</div>
                <div class="team-pills-container">
                    ${GlobalTags.otherTeams.map(t => {
        const style = getTeamColor(t);
        const isChecked = lastTeams.includes(t) ? 'checked' : '';
        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${t}" class="team-filter-checkbox" style="display:none;" ${isChecked}>
                            <span class="team-pill">${t}</span>
                        </label>`;
    }).join('')}
                </div>
            </div>
            ` : ''}
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:60px; flex-shrink:0;">ポジション</div>
                <div class="team-pills-container">
                    ${GlobalTags.positions.map(p => {
        const style = getPosColor(p);
        const isChecked = lastPos.includes(p) ? 'checked' : '';
        return `<label class="team-pill-label" style="--brand-bg:${style.bg}; --brand-fg:${style.fg};">
                            <input type="checkbox" value="${p}" class="pos-filter-checkbox" style="display:none;" ${isChecked}>
                            <span class="team-pill">${p}</span>
                        </label>`;
    }).join('')}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <div style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:60px; flex-shrink:0;">年俸</div>
                <div class="team-pills-container">
                    ${[
            { label: '~5000万', range: '0-5000' },
            { label: '5000万~1億', range: '5001-10000' },
            { label: '1億~3億', range: '10001-30000' },
            { label: '3億~', range: '30001-999999' }
        ].map(opt => `<label class="team-pill-label" style="--brand-bg:var(--accent-color); --brand-fg:#fff;">
                        <input type="checkbox" value="${opt.range}" class="salary-filter-checkbox" style="display:none;" ${lastSals.includes(opt.range) ? 'checked' : ''}>
                        <span class="team-pill">${opt.label}</span>
                    </label>`).join('')}
                </div>
            </div>
        </div>

        <input type="text" id="p-search" class="form-control" placeholder="選手を探す..." style="margin:1rem 0; box-shadow:var(--pop-shadow);">
        <div id="sel-info" style="padding:1rem; background:#f1f5f9; border:1px solid var(--border-color); border-radius:1rem; margin-bottom:1rem; min-height:60px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);">
            <p style="text-align:center; color:var(--text-secondary);">選手を選択してください</p>
        </div>
        <div style="max-height:350px; overflow-y:auto; border:1px solid var(--border-color); border-radius:1rem; background:white; box-shadow:var(--pop-shadow);">
            <table class="player-table">
                <thead style="position:sticky; top:0; background:#f8fafc; z-index:10;"><tr><th style="color:var(--accent-color);">名前</th><th style="color:var(--accent-color);">球団</th><th style="color:var(--accent-color);">位置</th><th style="color:var(--accent-color);">年俸</th></tr></thead>
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
    const draw = (f = '') => {
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
        }).slice(0, 500).forEach(p => {
            const tr = document.createElement('tr'); tr.className = 'player-row';
            if (selected && selected.id === p.id) tr.classList.add('selected');
            tr.innerHTML = `<td>${p.name}</td><td>${p.team}</td><td>${p.position}</td><td style="font-size:0.8rem;">${formatSalary(p.salary)}</td>`;
            tr.onclick = () => {
                selected = p; draw(f);
                info.innerHTML = `<h3>${p.name} <span style="font-size:0.8rem;">(${p.team})</span></h3>`;
                btn.disabled = false;
            };
            list.appendChild(tr);
        });
    };
    const pSearch = document.getElementById('p-search');
    pSearch.oninput = (e) => draw(e.target.value);

    // Restore search value and initial draw
    pSearch.value = lastSearch;
    draw(lastSearch);

    pSearch.addEventListener('blur', (e) => { window._lastSearch = e.target.value; });

    if (wasFocused) {
        pSearch.focus();
        pSearch.setSelectionRange(pSearch.value.length, pSearch.value.length);
    }

    document.querySelectorAll('.team-filter-checkbox, .pos-filter-checkbox, .salary-filter-checkbox').forEach(cb => {
        cb.onchange = () => {
            window._lastTeams = Array.from(document.querySelectorAll('.team-filter-checkbox:checked')).map(c => c.value);
            window._lastPos = Array.from(document.querySelectorAll('.pos-filter-checkbox:checked')).map(c => c.value);
            window._lastSals = Array.from(document.querySelectorAll('.salary-filter-checkbox:checked')).map(c => c.value);
            draw(pSearch.value);
        };
    });

    const finalizeFn = async (p) => {
        if (isOnline) {
            await sendClientAction({
                type: 'select_player',
                name: myPlayerName,
                playerId: p.id,
                isSkip: !!p.isSkip,
                round: GameState.currentRound,
                subRound: GameState.currentSubRound
            });
            GameState.currentSelections[myIdx] = p;
            if (isHost && Object.keys(GameState.currentSelections).length >= GameState.playersToDraftThisRound.length) {
                GameState.phase = 'draft_reveal';
            }
            if (isOnline && isHost) await broadcastState();
            render();
        } else {
            // Offline turn-based logic with Intermission
            GameState.currentSelections[myIdx] = p;
            if (GameState.currentTurn < GameState.playersToDraftThisRound.length - 1) {
                GameState.currentTurn++;
                const nextIdx = GameState.playersToDraftThisRound[GameState.currentTurn];
                renderOfflineIntermission(nextIdx);
            } else {
                GameState.phase = 'draft_reveal';
                render();
            }
        }
    };

    btn.onclick = () => { Sound.tap(); finalizeFn(selected); };
    document.getElementById('skip-btn').onclick = () => { if (confirm('パスしますか？')) { Sound.tap(); finalizeFn({ id: 'skip-' + Date.now(), name: '（選択パス）', team: '-', position: '-', isSkip: true }); } };
}

function renderDraftRevealScreen() {
    appContainer.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'glass-panel';
    container.style.textAlign = 'center';

    let roundText = `第${GameState.currentRound}巡目 ${GameState.currentSubRound > 1 ? '(外れ' + (GameState.currentSubRound - 1) + ')' : ''}`;

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
            Sound.tick();
            setTimeout(render, 100);
        } else {
            const res = GameState.lotteryResults[al.playerId];
            if (res) {
                Sound.win();
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
        if (!p) return;
        const card = document.createElement('div');
        card.className = 'glass-panel reveal-card-pop'; card.style.padding = '1rem';
        card.innerHTML = `<div style="font-size:0.8rem; color:var(--text-secondary);">${GameState.playerNames[idx]}</div><div style="font-weight:bold;">${p.name}</div><div style="font-size:0.75rem;">${p.team}</div>`;
        grid.appendChild(card);
    });

    const groups = {};
    Object.keys(GameState.currentSelections).forEach(idx => {
        const p = GameState.currentSelections[idx];
        if (!p || p.isSkip) return;
        if (!groups[p.id]) groups[p.id] = { p, observers: [] };
        groups[p.id].observers.push(parseInt(idx));
    });

    const dups = Object.values(groups).filter(g => g.observers.length > 1);
    const singles = Object.values(groups).filter(g => g.observers.length === 1);
    const lBox = document.getElementById('lottery-box');

    const runRevealLogic = async () => {
        singles.forEach(g => {
            const winIdx = g.observers[0];
            GameState.rosters[winIdx][GameState.currentRound - 1] = g.p;
            GameState.availablePlayers = GameState.availablePlayers.filter(x => x.id !== g.p.id);
        });

        for (const g of dups) {
            const res = GameState.lotteryResults[g.p.id];
            const div = document.createElement('div'); div.className = 'glass-panel'; div.style.margin = '1rem 0;';
            div.innerHTML = `<h4>${g.p.name} の抽選</h4><div id="r-${g.p.id}"></div>`;
            lBox.appendChild(div);
            const rDiv = document.getElementById('r-' + g.p.id);

            if (res) {
                const name = GameState.playerNames[res.winnerIndex];
                rDiv.innerHTML = `<span style="color:var(--success-color)">交渉権獲得: ${name}</span>`;
                GameState.rosters[res.winnerIndex][GameState.currentRound - 1] = g.p;
                GameState.availablePlayers = GameState.availablePlayers.filter(x => x.id !== g.p.id);
            } else if (!isOnline || isHost) {
                const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = '抽選する';
                rDiv.appendChild(b);
                b.onclick = async () => {
                    b.style.display = 'none';
                    GameState.activeLottery = {
                        playerId: g.p.id,
                        participants: g.observers,
                        startTime: Date.now(),
                        isRunning: true
                    };
                    await broadcastState();
                    render();

                    setTimeout(async () => {
                        const winIdx = g.observers[Math.floor(Math.random() * g.observers.length)];
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
        if (!hasPendingLottery) showProceed();
    };

    const showProceed = () => {
        const box = document.getElementById('proceed-box');
        if (!isOnline) {
            const btn = document.createElement('button'); btn.className = 'btn btn-success'; btn.textContent = '次の指名へ進む';
            btn.onclick = async () => { await advanceDraft(); render(); };
            box.appendChild(btn);
            return;
        }
        const ok = GameState.confirmedPlayers[myPlayerName];
        if (!ok) {
            const btn = document.createElement('button'); btn.className = 'btn btn-success'; btn.textContent = 'OK (3秒待機)';
            box.appendChild(btn);
            const fn = async () => { if (GameState.confirmedPlayers[myPlayerName]) return; GameState.confirmedPlayers[myPlayerName] = true; if (isOnline) await sendClientAction({ type: 'confirm_reveal', name: myPlayerName }); render(); };
            btn.onclick = fn; setTimeout(fn, 3000);
        } else {
            const un = GameState.playerNames.slice(0, GameState.numPlayers).filter(n => !GameState.confirmedPlayers[n]);
            if (un.length > 0) {
                box.innerHTML = `
                    <p style="color:var(--text-secondary); margin-bottom: 1rem;">他プレイヤーの確認を待っています...</p>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; max-width:300px; margin:0 auto;">
                        ${GameState.playerNames.slice(0, GameState.numPlayers).map(n => `
                            <div style="background:white; padding:0.5rem 1rem; border-radius:1rem; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; box-shadow:var(--pop-shadow);">
                                <div style="display:flex; align-items:center; font-size:0.9rem;">${getStatusDot(n)} <span style="font-weight:bold; color:var(--text-primary);">${n}</span></div>
                                <span>${GameState.confirmedPlayers[n] ? '✅' : '⏳'}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                box.innerHTML = '<p>全員の確認が完了しました。次へ進みます...</p>';
            }
        }
    };
    runRevealLogic();
}

function renderFinalResultScreen() {
    appContainer.innerHTML = '<div class="glass-panel" style="text-align:center;"><h2>ドラフト完了！</h2>' + generateRosterHTML() + '<button class="btn btn-primary" onclick="location.reload()" style="margin-top:2rem;">最初に戻る</button></div>';
}

function render() {
    updateGlobalUI();
    const p = GameState.phase;
    if (p === 'top') renderTopScreen();
    else if (p === 'connection') renderConnectionScreen();
    else if (p === 'setup') renderSetupScreen();
    else if (p === 'draft_input') renderDraftInputScreen();
    else if (p === 'draft_reveal') renderDraftRevealScreen();
    else if (p === 'final_result') renderFinalResultScreen();
}
