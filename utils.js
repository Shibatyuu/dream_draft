function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function findPlayerById(id) {
    if (!id) return null;
    if (id.startsWith('skip-')) return { id, name: '（選択パス）', team: '-', position: '-', isSkip: true };
    return GameState.csvData.find(p => p.id === id) || null;
}

function getDuplicateGroups() {
    const groups = {};
    Object.keys(GameState.currentSelections).forEach(idx => {
        const p = GameState.currentSelections[idx];
        if(!p || p.isSkip) return;
        if(!groups[p.id]) groups[p.id] = { p, observers: [] };
        groups[p.id].observers.push(parseInt(idx));
    });
    return Object.values(groups).filter(g => g.observers.length > 1);
}

function reconstructGlobalTags() {
    const CE = ['阪神', 'DeNA', '巨人', '中日', '広島', 'ヤクルト'];
    const PA = ['ソフトバンク', '日本ハム', 'オリックス', '楽天', '西武', 'ロッテ'];
    const ceSet = new Set(), paSet = new Set(), otherSet = new Set();
    
    GameState.csvData.forEach(p => {
        const t = p.team;
        if (!t || t === '-') return;
        let matched = false;
        for (let kw of CE) { if (t.includes(kw) || (kw === '巨人' && (t.includes('ジャイアンツ') || t.includes('読売')))) { ceSet.add(t); matched = true; break; } }
        if (!matched) { for (let kw of PA) { if (t.includes(kw)) { paSet.add(t); matched = true; break; } } }
        if (!matched) otherSet.add(t);
    });

    GlobalTags.ceLeagueTeams = Array.from(ceSet).sort();
    GlobalTags.paLeagueTeams = Array.from(paSet).sort();
    GlobalTags.otherTeams = Array.from(otherSet).sort();
}

async function advanceDraft() {
    GameState.lotteryResults = {}; GameState.confirmedPlayers = {};
    const losers = [];
    GameState.playersToDraftThisRound.forEach(idx => {
        if (!GameState.rosters[idx][GameState.currentRound - 1]) losers.push(idx);
    });

    if (losers.length) {
        GameState.playersToDraftThisRound = losers; GameState.currentSubRound++;
    } else {
        GameState.currentRound++; GameState.currentSubRound = 1;
        GameState.playersToDraftThisRound = Array.from({ length: GameState.numPlayers }, (_, i) => i);
    }
    GameState.currentSelections = {};
    GameState.currentTurn = 0; // Reset for offline mode
    GameState.phase = (GameState.currentRound > GameState.numRounds) ? 'final_result' : 'draft_input';
    if (isOnline && isHost) await broadcastState();
}

function loadEmbeddedData() {
    if (typeof PlayersData !== 'undefined') {
        GameState.csvData = PlayersData;
        GameState.availablePlayers = [...PlayersData];
        reconstructGlobalTags();
    }
}

function handleCSVUpload(file) {
    const statusEl = document.getElementById('csv-status');
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
            const parsed = data.map(row => ({
                id: row.id || generateId(),
                name: row.name || row['名前'] || '',
                team: row.team || row['球団'] || '-',
                position: row.position || row['ポジション'] || '-',
                age: parseInt(row.age || row['年齢']) || 0,
                salary: parseInt(row.salary || row['年俸']) || 0
            }));

            GameState.csvData = parsed;
            GameState.availablePlayers = [...parsed];
            reconstructGlobalTags();
            statusEl.textContent = '読み込み完了: ' + parsed.length + ' 名';
            statusEl.className = 'status-message status-success';
        }
    });
}
