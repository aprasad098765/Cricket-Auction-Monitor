document.addEventListener('DOMContentLoaded', () => {
    // State
    const tournamentData = {
        pools: [] // Array of { name: 'Pool A', teams: [ { name, matches: [], stats: {...} } ], matches: [] }
    };

    // Runtime history (not persisted to avoid LS bloat/loops)
    const historyStack = [];

    // --- LOGIC ---

    // Load state
    function loadState() {
        const saved = localStorage.getItem('tournamentState');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.pools) tournamentData.pools = data.pools;
            } catch (e) {
                console.error('Failed to load tournament state', e);
            }
        }
        renderAll();
        updateUndoUI();
    }

    function saveState(pushToHistory = true) {
        // Note: For this simple app, we push history BEFORE modifying data in the action handlers
        // So here we just save to LS.
        localStorage.setItem('tournamentState', JSON.stringify(tournamentData));
        renderAll();
        // UI update for undo button
        updateUndoUI();
    }

    function pushHistory() {
        historyStack.push(JSON.stringify(tournamentData));
        if (historyStack.length > 20) historyStack.shift(); // Limit history
        updateUndoUI();
    }

    window.undo = function () {
        if (historyStack.length === 0) return;
        const previousState = historyStack.pop();
        try {
            const data = JSON.parse(previousState);
            tournamentData.pools = data.pools;
            saveState(false); // Save without pushing to history
        } catch (e) {
            console.error("Undo failed", e);
        }
        updateUndoUI();
    };

    window.deletePool = function (index) {
        if (!confirm('Delete this pool and all its matches?')) return;
        pushHistory();
        tournamentData.pools.splice(index, 1);
        saveState(false);
    };

    window.deleteTeam = function (poolIndex, teamName) {
        if (!confirm(`Delete ${teamName} and all their matches?`)) return;
        pushHistory();
        const pool = tournamentData.pools[poolIndex];

        // Remove team
        pool.teams = pool.teams.filter(t => t.name !== teamName);

        // Remove matches involving this team
        pool.matches = pool.matches.filter(m => m.t1 !== teamName && m.t2 !== teamName);

        saveState(false);
    };

    // Helper: Convert Overs to Balls (e.g., 10.4 -> 64 balls)
    // 0.1 means 1 ball.
    function oversToBalls(oversStr) {
        const overs = parseFloat(oversStr);
        const wholeOvers = Math.floor(overs);
        // Handle floating point precision issues for ball part
        const ballPart = Math.round((overs - wholeOvers) * 10);
        return (wholeOvers * 6) + ballPart;
    }

    // Helper: Convert Balls to Overs (e.g., 64 -> 10.4)
    function ballsToOvers(totalBalls) {
        const overs = Math.floor(totalBalls / 6);
        const balls = totalBalls % 6;
        return parseFloat(`${overs}.${balls}`);
    }

    // NRR Calculation
    // NRR = (Total Runs Scored / Total Overs Faced) - (Total Runs Conceded / Total Overs Bowled)
    // CRITICAL: if a team is ALL OUT, their Overs Faced = MAX OVERS (except if they won while chasing).
    // We will calculate this dynamically from the stored matches.
    function calculateStandings(poolIndex) {
        const pool = tournamentData.pools[poolIndex];
        const teamStats = {};

        // Initialize Stats
        pool.teams.forEach(t => {
            teamStats[t.name] = {
                name: t.name,
                played: 0,
                won: 0,
                lost: 0,
                tied: 0,
                points: 0,
                runsScored: 0,
                ballsFaced: 0,
                runsConceded: 0,
                ballsBowled: 0
            };
        });

        // Process Matches
        pool.matches.forEach(m => {
            const t1 = teamStats[m.t1];
            const t2 = teamStats[m.t2];
            if (!t1 || !t2) return; // Team might have been deleted?

            t1.played++;
            t2.played++;

            // maxOvers in balls
            const maxBalls = m.maxOvers * 6;

            // --- Team 1 (Bat First) ---
            t1.runsScored += m.t1Score;

            // T1 Overs Faced: If All Out (10 wkts), count as full quota.
            // Since T1 batted first, if they are all out, valid balls faced is their actual balls,
            // BUT for NRR divisor we use correct rule.
            let t1BallsFacedForNRR = oversToBalls(m.t1Overs);
            if (parseInt(m.t1Wickets) === 10) {
                t1BallsFacedForNRR = maxBalls;
            }
            t1.ballsFaced += t1BallsFacedForNRR;

            // T2 Conceded (Bowling to T1)
            t2.runsConceded += m.t1Score;
            t2.ballsBowled += t1BallsFacedForNRR; // Rule: Overs bowled = Overs faced by opponent (adjusted for all out)


            // --- Team 2 (Bat Second / Chase) ---
            t2.runsScored += m.t2Score;

            // T2 Overs Faced:
            // If T2 WON (Chased successfully), use ACTUAL balls faced.
            // If T2 LOST or TIED and was ALL OUT, use MAX balls.
            // If T2 LOST or TIED and NOT all out (ran out of overs), ACTUAL balls (which is max balls anyway).

            let t2BallsFacedForNRR = oversToBalls(m.t2Overs);

            // Determine Winner
            let winner = null;
            if (m.t1Score > m.t2Score) winner = 't1';
            else if (m.t2Score > m.t1Score) winner = 't2';
            else winner = 'tie';

            if (winner === 't2') {
                // Chased successfully: Use actual balls faced
            } else {
                // T2 lost or tied
                if (parseInt(m.t2Wickets) === 10) {
                    t2BallsFacedForNRR = maxBalls;
                }
            }

            t2.ballsFaced += t2BallsFacedForNRR;

            // T1 Conceded (Bowling to T2)
            t1.runsConceded += m.t2Score;
            t1.ballsBowled += t2BallsFacedForNRR;


            // Points
            if (winner === 't1') {
                t1.won++;
                t1.points += 2;
                t2.lost++;
            } else if (winner === 't2') {
                t2.won++;
                t2.points += 2;
                t1.lost++;
            } else {
                t1.tied++;
                t1.points += 1;
                t2.tied++;
                t2.points += 1;
            }
        });

        // Compute Final NRR
        const result = Object.values(teamStats).map(team => {
            // Avoid division by zero
            const oversFaced = team.ballsFaced > 0 ? team.ballsFaced / 6 : 0;
            const oversBowled = team.ballsBowled > 0 ? team.ballsBowled / 6 : 0;

            const runRateFor = oversFaced > 0 ? team.runsScored / oversFaced : 0;
            const runRateAgainst = oversBowled > 0 ? team.runsConceded / oversBowled : 0;

            team.nrr = runRateFor - runRateAgainst;
            return team;
        });

        // Sort: Points DESC, then NRR DESC
        result.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.nrr - a.nrr;
        });

        return result;
    }


    // --- RENDERING ---

    function renderAll() {
        renderPoolSelects();
        renderMatchesForm(); // Updates team selects
        renderStandings();
        updateVisibility();
    }

    function updateUndoUI() {
        const btn = document.getElementById('undo-btn');
        if (btn) {
            btn.disabled = historyStack.length === 0;
            btn.style.opacity = historyStack.length === 0 ? '0.5' : '1';
        }
    }

    function updateVisibility() {
        const hasPools = tournamentData.pools.length > 0;
        document.getElementById('add-team-section').style.display = hasPools ? 'block' : 'none';

        const hasTeams = tournamentData.pools.some(p => p.teams.length >= 2);
        document.getElementById('match-input-section').style.display = hasTeams ? 'block' : 'none';
    }

    function renderPoolSelects() {
        const selects = [document.getElementById('pool-select'), document.getElementById('match-pool-select')];
        selects.forEach(sel => {
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML = '';
            tournamentData.pools.forEach((pool, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = pool.name;
                sel.appendChild(opt);
            });
            if (currentVal && tournamentData.pools[currentVal]) sel.value = currentVal;
            else if (tournamentData.pools.length > 0) sel.value = 0;
        });
    }

    function renderMatchesForm() {
        const poolIndex = document.getElementById('match-pool-select').value;
        const t1Select = document.getElementById('team1-select');
        const t2Select = document.getElementById('team2-select');

        if (!t1Select || !t2Select || poolIndex === '') return;

        const pool = tournamentData.pools[poolIndex];
        if (!pool) return;

        const teams = pool.teams;
        let html = '<option value="">Select Team</option>';
        teams.forEach(t => {
            html += `<option value="${t.name}">${t.name}</option>`;
        });

        t1Select.innerHTML = html;
        t2Select.innerHTML = html;

        // Prevent same team selection
        t1Select.onchange = () => {
            Array.from(t2Select.options).forEach(opt => {
                opt.disabled = opt.value === t1Select.value && opt.value !== '';
            });
        };
        t2Select.onchange = () => {
            Array.from(t1Select.options).forEach(opt => {
                opt.disabled = opt.value === t2Select.value && opt.value !== '';
            });
        }
    }

    // Listener for match pool change to update teams
    document.getElementById('match-pool-select').addEventListener('change', renderMatchesForm);


    function renderStandings() {
        const container = document.getElementById('standings-container');
        container.innerHTML = '';

        if (tournamentData.pools.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                    <h3>No pools created yet.</h3>
                    <p>Create a pool to get started.</p>
                </div>`;
            return;
        }

        tournamentData.pools.forEach((pool, index) => {
            const standings = calculateStandings(index);

            const card = document.createElement('div');
            card.className = 'section-card';

            let rows = '';
            standings.forEach((team, rank) => {
                const nrrClass = team.nrr >= 0 ? 'nrr-positive' : 'nrr-negative';
                const nrrStr = (team.nrr > 0 ? '+' : '') + team.nrr.toFixed(3);

                rows += `
                    <tr>
                         <td style="display:flex; align-items:center; gap:0.5rem;">
                            ${rank + 1}
                            <button onclick="deleteTeam(${index}, '${team.name}')" title="Delete Team" style="background:none; border:none; color:#ef4444; cursor:pointer; opacity:0.6; padding:0;">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </td>
                        <td style="font-weight:600; color:#fff;">${team.name}</td>
                        <td>${team.played}</td>
                        <td>${team.won}</td>
                        <td>${team.lost}</td>
                        <td>${team.tied}</td>
                        <td style="font-weight:bold; color:var(--primary-accent);">${team.points}</td>
                        <td class="${nrrClass}">${nrrStr}</td>
                    </tr>
                `;
            });

            if (standings.length === 0) {
                rows = '<tr><td colspan="8" style="text-align:center;">No teams in this pool yet</td></tr>';
            }


            // Generate Match History HTML
            let matchesHtml = '';
            if (pool.matches && pool.matches.length > 0) {
                matchesHtml = `<div class="match-history"><h4 style="margin-bottom:0.5rem; color:#ccc;">Match History</h4>`;
                // Show latest first
                [...pool.matches].reverse().forEach(m => {
                    let winner = '';
                    if (m.t1Score > m.t2Score) winner = `${m.t1} won`;
                    else if (m.t2Score > m.t1Score) winner = `${m.t2} won`;
                    else winner = 'Tie';

                    matchesHtml += `
                        <div class="match-item">
                            <div>
                                <div class="match-teams">
                                    ${m.t1} <span class="match-score">(${m.t1Score}/${m.t1Wickets} in ${m.t1Overs})</span>
                                    vs 
                                    ${m.t2} <span class="match-score">(${m.t2Score}/${m.t2Wickets} in ${m.t2Overs})</span>
                                </div>
                                <div class="winner-text">${winner}</div>
                            </div>
                             <button onclick="window.deleteMatch(${index}, ${m.id})" title="Delete Match" style="background:none; border:none; color:#ef4444; cursor:pointer; opacity:0.5;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    `;
                });
                matchesHtml += '</div>';
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.5rem;">
                    <h3 style="margin:0; border:none; padding:0;">${pool.name}</h3>
                     <button onclick="deletePool(${index})" class="btn-secondary" style="padding:0.4rem; color:#ef4444; border-color:rgba(239,68,68,0.3); font-size:0.8rem;">Delete Pool</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Team</th>
                                <th>P</th>
                                <th>W</th>
                                <th>L</th>
                                <th>T</th>
                                <th>Pts</th>
                                <th>NRR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
                ${matchesHtml}
            `;
            container.appendChild(card);
        });
    }

    // Add deleteMatch to window
    window.deleteMatch = function (poolIndex, matchId) {
        if (!confirm('Delete this match result?')) return;
        pushHistory();
        const pool = tournamentData.pools[poolIndex];
        pool.matches = pool.matches.filter(m => m.id !== matchId);
        saveState(false);
    };

    // --- EVENT LISTENERS ---

    document.getElementById('create-pool-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('pool-name').value.trim();
        if (name) {
            pushHistory();
            tournamentData.pools.push({ name, teams: [], matches: [] });
            document.getElementById('pool-name').value = '';
            saveState(false);
        }
    });

    document.getElementById('add-team-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const poolIndex = document.getElementById('pool-select').value;
        const name = document.getElementById('team-name').value.trim();
        if (poolIndex !== '' && name) {
            // Check existence
            if (tournamentData.pools[poolIndex].teams.some(t => t.name === name)) {
                alert('Team exists in this pool!');
                return;
            }
            pushHistory();
            tournamentData.pools[poolIndex].teams.push({ name });
            document.getElementById('team-name').value = '';
            saveState(false);
        }
    });

    document.getElementById('match-result-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const poolIndex = document.getElementById('match-pool-select').value;
        const pool = tournamentData.pools[poolIndex];

        const t1Name = document.getElementById('team1-select').value;
        const t2Name = document.getElementById('team2-select').value;

        if (!t1Name || !t2Name) { alert('Select both teams'); return; }
        if (t1Name === t2Name) { alert('Teams must be different'); return; }

        pushHistory();

        const maxOvers = parseFloat(document.getElementById('max-overs').value);

        const match = {
            id: Date.now(),
            t1: t1Name,
            t2: t2Name,
            maxOvers: maxOvers,
            t1Score: parseInt(document.getElementById('t1-runs').value),
            t1Wickets: parseInt(document.getElementById('t1-wickets').value),
            t1Overs: parseFloat(document.getElementById('t1-overs').value),
            t2Score: parseInt(document.getElementById('t2-runs').value),
            t2Wickets: parseInt(document.getElementById('t2-wickets').value),
            t2Overs: parseFloat(document.getElementById('t2-overs').value)
        };

        pool.matches.push(match);

        // Reset form partially
        document.getElementById('t1-runs').value = '';
        document.getElementById('t1-wickets').value = '';
        document.getElementById('t1-overs').value = '';
        document.getElementById('t2-runs').value = '';
        document.getElementById('t2-wickets').value = '';
        document.getElementById('t2-overs').value = '';

        saveState(false);
        alert('Match saved!');
    });

    document.getElementById('back-home-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        window.undo();
    });

    // Init Logic
    loadState();
});
