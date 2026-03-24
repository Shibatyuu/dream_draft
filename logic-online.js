async function broadcastState() {
    if (!isOnline || !isHost) return;
    try {
        const lightState = {};
        const skip = new Set(['csvData', 'availablePlayers', 'rosters', 'currentSelections']);
        Object.keys(GameState).forEach(key => {
            if (key === 'lastSeen' || key === 'csvData') return; 
            if (key === 'currentSelections') {
                lightState.currentSelectionIds = {};
                for (const k of Object.keys(GameState.currentSelections)) {
                    lightState.currentSelectionIds[k] = GameState.currentSelections[k].id;
                }
            } else if (key === 'rosters') {
                lightState.rosterIds = GameState.rosters.map(r => r.map(p => p.id));
            } else if (key === 'availablePlayers') {
                lightState.availablePlayerIds = GameState.availablePlayers.map(p => p.id);
            } else if (!skip.has(key)) {
                lightState[key] = GameState[key];
            }
        });
        lightState.version = lastVersion + 1;

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

function startHostPolling() {
    if (hostActionInterval) clearInterval(hostActionInterval);
    hostActionInterval = setInterval(async () => {
        try {
            const res = await fetch(SERVER_URL + '?path=/poll_actions', {
                method: 'POST',
                body: JSON.stringify({ room_id: roomId, client_id: clientId })
            });
            const data = await res.json();
            let stateChanged = false;

            if (data.state) {
                const s = data.state;
                if (s.playerNames && s.playerNames.length > GameState.playerNames.length) {
                    GameState.playerNames = s.playerNames;
                    GameState.numPlayers = s.numPlayers || GameState.playerNames.length;
                    stateChanged = true;
                }
            }

            if (data.actions) {
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
                    }
                    if (action.type === 'select_player' && GameState.phase === 'draft_input') {
                        const guestName = (action.name || '').trim().toLowerCase();
                        const idx = GameState.playerNames.findIndex(n => (n || '').trim().toLowerCase() === guestName);
                        const isCorrectContext = (!action.round || action.round === GameState.currentRound) && 
                                                 (!action.subRound || action.subRound === GameState.currentSubRound);
                        if (idx !== -1 && GameState.playersToDraftThisRound.includes(idx) && !GameState.currentSelections[idx] && isCorrectContext) {
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
            }

            let autoChanged = false;
            const newStatus = {};
            GameState.playerNames.slice(0, GameState.numPlayers).forEach(n => {
                const last = GameState.lastSeen[n] || 0;
                newStatus[n] = (n === myPlayerName) || (Date.now() - last < 10000);
            });
            if (JSON.stringify(newStatus) !== JSON.stringify(GameState.playerStatus)) {
                GameState.playerStatus = newStatus;
                autoChanged = true;
            }

            if (GameState.phase === 'draft_input') {
                const pickedCount = GameState.playersToDraftThisRound.filter(idx => GameState.currentSelections[idx]).length;
                if (GameState.playersToDraftThisRound.length > 0 && pickedCount >= GameState.playersToDraftThisRound.length) {
                    GameState.phase = 'draft_reveal';
                    autoChanged = true;
                }
            }
            if (GameState.phase === 'draft_reveal') {
                const isLotteryRunning = GameState.activeLottery != null;
                if (!isLotteryRunning) {
                    const unconfirmed = GameState.playerNames.slice(0, GameState.numPlayers).filter(n => !GameState.confirmedPlayers[n]);
                    const dups = getDuplicateGroups();
                    const allLotteriesDone = dups.every(g => GameState.lotteryResults[g.p.id]);
                    if (unconfirmed.length === 0 && allLotteriesDone) {
                        advanceDraft();
                        autoChanged = true;
                    }
                }
            }

            if (stateChanged || autoChanged) {
                await broadcastState();
                render();
            }
        } catch (e) { console.error('Host polling error', e); }
    }, 3000);
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
                    if (s.playerNames) {
                        GameState.playerNames = s.playerNames;
                        GameState.numPlayers = s.numPlayers || s.playerNames.length;
                        const newIdx = GameState.playerNames.findIndex(n => (n || '').trim().toLowerCase() === myPlayerName.trim().toLowerCase());
                        if (newIdx !== -1 && newIdx !== myIdx) {
                            myIdx = newIdx;
                            console.log(`My index determined: ${myIdx} (${myPlayerName})`);
                        }
                    }
                    if (s.currentSelectionIds) {
                        const guestIdx = myIdx === -1 ? GameState.playerNames.findIndex(n => (n || '').trim().toLowerCase() === myPlayerName.trim().toLowerCase()) : myIdx;
                        const localMine = (guestIdx !== -1) ? GameState.currentSelections[guestIdx] : null;
                        
                        const isSamePhase = (s.currentRound === GameState.currentRound && 
                                             s.currentSubRound === GameState.currentSubRound &&
                                             s.phase === GameState.phase);

                        GameState.currentSelections = {};
                        for (const k of Object.keys(s.currentSelectionIds)) {
                            GameState.currentSelections[k] = findPlayerById(s.currentSelectionIds[k]);
                        }
                        if (isSamePhase && localMine && guestIdx !== -1 && !GameState.currentSelections[guestIdx]) {
                            GameState.currentSelections[guestIdx] = localMine;
                        }
                    }
                    if (s.rosterIds) {
                        GameState.rosters = s.rosterIds.map(r => r.map(id => findPlayerById(id)));
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
