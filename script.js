document.addEventListener('DOMContentLoaded', () => {
    // State
    const auctionData = {
        id: null, // Database ID
        tournamentName: '',
        numTeams: 0,
        totalPlayers: 0,
        numOvers: 0,
        playersPerTeam: 0,
        playerPool: [], // All players in the auction

        // Round Logic State
        currentRound: 1,
        poolForRound: [], // Players available for THIS round
        shownInRound: [], // Players shown in THIS round
        unsoldPlayers: [], // Players marked unsold across rounds
        isComplete: false, // Flag to track auction completion


        currentPlayer: null, // Currently spotlighted player
        totalCredits: 0,
        basePrice: 0,
        teams: [] // Array of { name, budget, players: [] }
    };

    // --- PERSISTENCE ---

    // AI Analysis (Localhost Python Server)
    async function updateAnalysis() {
        try {
            // Only analyze if we have teams
            if (!auctionData.teams || auctionData.teams.length === 0) return;

            const payload = {
                teams: auctionData.teams,
                totalCredits: auctionData.totalCredits,
                playersPerTeam: auctionData.playersPerTeam,
                basePrice: auctionData.basePrice
            };

            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length === auctionData.teams.length) {
                    data.results.forEach((res, index) => {
                        if (auctionData.teams[index]) {
                            auctionData.teams[index].analysis = res;
                        }
                    });

                    // Save the analysis results so Public View sees them
                    saveState(true);

                    // Re-render if on dashboard
                    if (document.getElementById('teams-grid')) renderDashboard();
                }
            }
        } catch (e) {
            console.log("AI Server offline, using local fallbacks.");
        }
    }

    // Debounce save to avoid hammering the server
    let saveTimeout;
    function saveState(skipAnalysis = false) {
        // 1. Local Persistence (Immediate)
        const state = {
            auctionData: auctionData,
            timestamp: Date.now()
        };
        localStorage.setItem('auctionState', JSON.stringify(state));

        if (!skipAnalysis) {
            updateAnalysis();
        }

        // 2. Database Persistence (Debounced)
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                // Prepare payload - send entire auctionData
                // We don't wrapping it in another object to match what app.py expects or handle it there
                // app.py expects { ...auctionData... } or { auctionData: ... }
                // Let's send the flat auctionData object, which contains 'id' if set

                const response = await fetch('/api/tournaments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(auctionData)
                });

                if (response.ok) {
                    const res = await response.json();
                    if (res.id && auctionData.id !== res.id) {
                        auctionData.id = res.id;
                        // Save again locally to store the new ID
                        state.auctionData.id = res.id;
                        localStorage.setItem('auctionState', JSON.stringify(state));
                        console.log("Synced with DB. New ID:", res.id);
                    } else {
                        console.log("Synced with DB.");
                    }
                }
            } catch (e) {
                console.warn("DB Save failed (offline?):", e);
            }
        }, 1000); // 1 second debounce
    }

    function loadState() {
        const savedState = localStorage.getItem('auctionState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                Object.assign(auctionData, state.auctionData);
                // Ensure ID is carried over if present
                if (state.auctionData.id) auctionData.id = state.auctionData.id;
                if (!auctionData.shownPlayers) auctionData.shownPlayers = [];
            } catch (e) {
                console.error('Failed to load state', e);
            }
        }
    }

    // Load state immediately
    loadState();

    // **SYNC LOGIC for Public View**
    // Listen for changes in other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'auctionState') {
            loadState();
            // If on public view, re-render
            const publicGrid = document.getElementById('public-teams-grid');
            if (publicGrid) {
                renderPublicView();
            }
        }
    });


    // --- PAGE SPECIFIC LOGIC ---

    const createTournamentBtn = document.getElementById('create-tournament-btn');
    if (createTournamentBtn) {
        createTournamentBtn.addEventListener('click', () => {
            // Clear current state for new tournament
            localStorage.removeItem('auctionState');
            // Hardboooting a fresh state object might be safer than relying on reload
            // But reload is simplest way to clear memory
            window.location.href = 'tournament_name.html';
        });

        // Init Tournament List
        fetchTournaments();
    }

    async function fetchTournaments() {
        const listContainer = document.getElementById('saved-tournaments-list');
        if (!listContainer) return;

        try {
            const response = await fetch('/api/tournaments');
            if (response.ok) {
                const tournaments = await response.json();
                renderTournamentList(tournaments, listContainer);
            } else {
                listContainer.innerHTML = '<p style="color:red">Failed to load tournaments.</p>';
            }
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = `
                <div style="text-align:center; padding: 2rem;">
                    <p style="color: #ef4444; font-weight: bold; margin-bottom: 0.5rem;">Could not connect to server.</p>
                    <p style="color: #aaa; font-size: 0.9rem;">Is the Python backend running?</p>
                </div>
            `;
        }
    }

    function renderTournamentList(tournaments, container) {
        container.innerHTML = '';
        if (tournaments.length === 0) {
            container.innerHTML = '<p>No saved tournaments found.</p>';
            return;
        }

        tournaments.forEach(t => {
            const date = new Date(t.updated_at).toLocaleDateString();
            const item = document.createElement('div');
            item.className = 'tournament-item';

            // Simple inline styles for list items
            Object.assign(item.style, {
                background: 'rgba(255,255,255,0.05)',
                padding: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid transparent',
                transition: 'all 0.2s'
            });

            item.innerHTML = `
                <div>
                   <div style="font-weight:bold; font-size:1.1rem;">${t.name}</div>
                   <div style="font-size:0.8rem; color:#aaa;">Last saved: ${date}</div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:0.8rem; color:#555;">#${t.id}</span>
                    <button class="btn-delete-tournament" data-id="${t.id}" style="
                        background: none; 
                        border: none; 
                        color: #666; 
                        cursor: pointer; 
                        padding: 4px; 
                        border-radius: 4px;
                        transition: all 0.2s;
                    " title="Delete Tournament">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            `;

            item.addEventListener('mouseenter', () => item.style.borderColor = 'var(--primary-accent)');
            item.addEventListener('mouseleave', () => item.style.borderColor = 'transparent');

            // Check target to avoid triggering load when clicking delete
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-tournament')) {
                    loadTournamentFromDB(t.id);
                }
            });

            const deleteBtn = item.querySelector('.btn-delete-tournament');
            deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.color = '#ef4444'; deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)'; });
            deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.color = '#666'; deleteBtn.style.background = 'none'; });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${t.name}"?`)) {
                    deleteTournament(t.id);
                }
            });

            container.appendChild(item);
        });
    }

    async function deleteTournament(id) {
        try {
            const response = await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Show Undo Toast
                showUndoToast(id);
                fetchTournaments(); // Refresh list to remove it
            } else {
                alert('Failed to delete.');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting tournament.');
        }
    }

    function showUndoToast(id) {
        // Remove existing toast if any
        const existing = document.getElementById('undo-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'undo-toast';
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#333',
            color: '#fff',
            padding: '1rem 2rem',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: '9999',
            animation: 'slideUp 0.3s ease-out'
        });

        toast.innerHTML = `
            <span>Tournament deleted.</span>
            <button id="undo-btn" style="
                background: var(--primary-accent); 
                border: none; 
                color: #000; 
                padding: 0.5rem 1rem; 
                border-radius: 4px; 
                cursor: pointer; 
                font-weight: bold;
            ">Undo</button>
            <button id="close-toast-btn" style="
                background: none; 
                border: none; 
                color: #aaa; 
                cursor: pointer; 
                font-size: 1.2rem;
            ">&times;</button>
        `;

        document.body.appendChild(toast);

        let timeout = setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 5000);

        document.getElementById('undo-btn').addEventListener('click', async () => {
            clearTimeout(timeout);
            await restoreTournament(id);
            toast.remove();
        });

        document.getElementById('close-toast-btn').addEventListener('click', () => {
            clearTimeout(timeout);
            toast.remove();
        });
    }

    async function restoreTournament(id) {
        try {
            const response = await fetch(`/api/tournaments/${id}/restore`, { method: 'POST' });
            if (response.ok) {
                fetchTournaments(); // Refresh list to show it again
            } else {
                alert('Failed to restore.');
            }
        } catch (e) {
            console.error(e);
            alert('Error restoring tournament.');
        }
    }

    async function loadTournamentFromDB(id) {
        try {
            const response = await fetch(`/api/tournaments/${id}`);
            if (response.ok) {
                const data = await response.json();

                // Load into localStorage
                const state = {
                    auctionData: data,
                    timestamp: Date.now()
                };
                localStorage.setItem('auctionState', JSON.stringify(state));

                // Redirect based on state
                // If teams exist, go to dashboard. Else setup.
                if (data.teams && data.teams.length > 0) {
                    window.location.href = 'dashboard.html';
                } else if (data.playerPool && data.playerPool.length > 0) {
                    window.location.href = 'setup.html';
                } else {
                    window.location.href = 'player_registration.html';
                }
            }
        } catch (e) {
            alert('Error loading tournament');
            console.error(e);
        }
    }

    // 2. TOURNAMENT NAME
    const tournamentNameForm = document.getElementById('tournament-name-form');
    if (tournamentNameForm) {
        const nameInput = document.getElementById('tournament-name-input');
        const numTeamsInput = document.getElementById('num-teams-input');
        const playersInput = document.getElementById('total-players-input');
        const oversInput = document.getElementById('num-overs-input');

        if (auctionData.tournamentName) nameInput.value = auctionData.tournamentName;
        if (auctionData.numTeams) numTeamsInput.value = auctionData.numTeams;
        if (auctionData.totalPlayers) playersInput.value = auctionData.totalPlayers;
        if (auctionData.numOvers) oversInput.value = auctionData.numOvers;

        tournamentNameForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = nameInput.value;
            const numTeams = parseInt(numTeamsInput.value);
            const totalPlayers = parseInt(playersInput.value);
            const numOvers = parseInt(oversInput.value);

            if (name && totalPlayers > 0 && numTeams >= 2) {
                auctionData.tournamentName = name;
                auctionData.numTeams = numTeams;
                auctionData.totalPlayers = totalPlayers;
                auctionData.numOvers = numOvers;
                if (!auctionData.playerPool || auctionData.playerPool.length !== totalPlayers) {
                    auctionData.playerPool = new Array(totalPlayers).fill('');
                }
                saveState();
                window.location.href = 'player_registration.html';
            }
        });

        document.getElementById('tournament-back-btn')?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // 2.5 PLAYER REGISTRATION
    const playerRegistrationForm = document.getElementById('player-registration-form');
    // ... (rest logic same as previous, just ensuring context)
    if (playerRegistrationForm) {
        const playerInputsContainer = document.getElementById('player-inputs-container');
        const autoFillBtn = document.getElementById('auto-fill-players-btn');

        if (!auctionData.totalPlayers) {
            alert('Please set total players first.');
            window.location.href = 'tournament_name.html';
        } else {
            generatePlayerInputs(auctionData.totalPlayers, playerInputsContainer);
        }

        playerRegistrationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputs = playerInputsContainer.querySelectorAll('input');
            const pool = [];
            inputs.forEach(input => {
                pool.push(input.value.trim() || input.placeholder);
            });
            auctionData.playerPool = pool;
            auctionData.playerPool = pool;

            // Reset Round State on new registration
            auctionData.currentRound = 1;
            auctionData.poolForRound = [...pool];
            auctionData.shownInRound = [];
            auctionData.unsoldPlayers = [];

            auctionData.currentPlayer = null;
            saveState();
            window.location.href = 'setup.html';
        });

        document.getElementById('registration-back-btn')?.addEventListener('click', () => {
            window.location.href = 'tournament_name.html';
        });

        if (autoFillBtn) {
            autoFillBtn.addEventListener('click', () => {
                const inputs = playerInputsContainer.querySelectorAll('input');
                inputs.forEach((input, index) => {
                    input.value = `Player ${index + 1}`;
                });
            });
        }
    }

    // 3. SETUP
    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
        const hasIconCheckbox = document.getElementById('has-icon-players');
        const iconCountGroup = document.getElementById('icon-players-count-group');
        const iconCountInput = document.getElementById('num-icon-players');

        // Init UI from state
        // if (auctionData.numTeams) document.getElementById('num-teams').value = auctionData.numTeams; // Removed
        if (auctionData.totalCredits) document.getElementById('total-credits').value = auctionData.totalCredits;
        if (auctionData.basePrice) document.getElementById('base-price').value = auctionData.basePrice;

        if (auctionData.hasIconPlayers) {
            hasIconCheckbox.checked = true;
            iconCountGroup.style.display = 'block';
            if (auctionData.numIconPlayers) iconCountInput.value = auctionData.numIconPlayers;
        }

        hasIconCheckbox.addEventListener('change', (e) => {
            iconCountGroup.style.display = e.target.checked ? 'block' : 'none';
        });

        setupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // const numTeams = parseInt(document.getElementById('num-teams').value); // Moved to tournament_name.html
            auctionData.totalCredits = parseInt(document.getElementById('total-credits').value);
            auctionData.basePrice = parseInt(document.getElementById('base-price').value);

            // auctionData.numTeams = numTeams; // Already set

            auctionData.hasIconPlayers = hasIconCheckbox.checked;
            auctionData.numIconPlayers = hasIconCheckbox.checked ? parseInt(iconCountInput.value) : 0;

            if (auctionData.numTeams < 2) { alert('Minimum 2 teams required'); return; }
            if (!auctionData.totalPlayers) { alert('Total players missing. Go back.'); return; }

            // Ensure Icon Players don't exceed Total Players? 
            // Actually, Icon players are usually EXTRA or part of the pool. 
            // If they are part of pool, we should deduct them? 
            // Current request says "Icon player is a player that will be already in the team".
            // So they are pre-assigned. 

            const basePerTeam = Math.ceil(auctionData.totalPlayers / auctionData.numTeams);
            auctionData.playersPerTeam = basePerTeam + (auctionData.numIconPlayers || 0);
            saveState();
            window.location.href = 'team_naming.html';
        });
        document.getElementById('setup-back-btn')?.addEventListener('click', () => {
            window.location.href = 'player_registration.html';
        });
    }

    // 4. TEAM NAMING
    const teamNamingForm = document.getElementById('team-naming-form');
    if (teamNamingForm) {
        const teamInputsContainer = document.getElementById('team-inputs-container');
        if (!auctionData.numTeams) {
            alert('Please configure setup first.');
            window.location.href = 'setup.html';
        } else {
            generateTeamInputs(auctionData.numTeams, teamInputsContainer);
            if (auctionData.teams && auctionData.teams.length === auctionData.numTeams) {
                const teamBlocks = teamInputsContainer.querySelectorAll('.team-input-block');
                teamBlocks.forEach((block, index) => {
                    if (auctionData.teams[index]) {
                        const nameInput = block.querySelector('.team-name-input');
                        const managerInput = block.querySelector('.team-manager-input');
                        if (nameInput) nameInput.value = auctionData.teams[index].name;
                        if (managerInput) managerInput.value = auctionData.teams[index].manager || '';

                        // Icon Pre-fill could be added here if we persisted partial state more granularly
                        // For now, if they come back, they might lose icon inputs if not careful, 
                        // but standard flow is linear.
                    }
                });
            }
        }

        teamNamingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const teamBlocks = Array.from(teamInputsContainer.querySelectorAll('.team-input-block'));

            // Map inputs to data structure
            const newTeamsData = teamBlocks.map(block => {
                const nameInput = block.querySelector('.team-name-input');
                const managerInput = block.querySelector('.team-manager-input');

                const teamName = nameInput.value;
                const managerName = managerInput.value || '';

                let iconPlayers = [];
                if (auctionData.hasIconPlayers) {
                    const iconNames = block.querySelectorAll('.icon-player-name');

                    iconNames.forEach((inp) => {
                        if (inp.value.trim()) {
                            iconPlayers.push({
                                name: inp.value.trim(),
                                price: 0, // Icon players are free/priceless
                                isIcon: true
                            });
                        }
                    });
                }

                return { name: teamName, manager: managerName, iconPlayers };
            });

            // Initialize or Update Teams
            // behavior: If teams exist, update names/managers/icons. simpler to rebuild if structure changed.
            // But we want to preserve allocated players if any? 
            // At this stage (Team Naming), usually no auction players are assigned yet.

            auctionData.teams = newTeamsData.map(data => ({
                name: data.name,
                manager: data.manager,
                budget: auctionData.totalCredits, // No deduction for icon players
                players: [...data.iconPlayers] // Pre-fill with icons
            }));

            // Add Icon players to Allocation/Sold lists so they don't appear in pool?
            // "Icon player is a player that will be already in the team"
            // So they are NOT in the pool.

            saveState();
            window.location.href = 'dashboard.html';
        });
        document.getElementById('naming-back-btn')?.addEventListener('click', () => {
            window.location.href = 'setup.html';
        });
    }

    // 5. DASHBOARD
    const dashboardView = document.getElementById('dashboard-view');
    // Check if it's the main dashboard (has edit controls)
    if (dashboardView && document.getElementById('reset-btn')) {
        if (!auctionData.teams || auctionData.teams.length === 0) {
            alert('No teams found. Please restart.');
            window.location.href = 'index.html';
        } else {
            renderDashboard();
            renderDashboard();
            updateSpotlightUI();

            // Re-init poolForRound if missing (legacy recovery or refresh)
            if (!auctionData.poolForRound || auctionData.poolForRound.length === 0) {
                const soldCount = auctionData.teams.reduce((acc, t) => acc + t.players.length, 0);
                const unsoldCount = auctionData.unsoldPlayers ? auctionData.unsoldPlayers.length : 0;

                // If raw start (no sold, no unsold), copy full pool
                if (soldCount === 0 && unsoldCount === 0 && auctionData.currentRound === 1) {
                    auctionData.poolForRound = [...auctionData.playerPool];
                }
            }
        }

        document.getElementById('dashboard-back-btn')?.addEventListener('click', () => {
            window.location.href = 'team_naming.html';
        });

        document.getElementById('reset-btn')?.addEventListener('click', () => {
            if (confirm('Reset auction?')) {
                localStorage.removeItem('auctionState');
                window.location.href = 'index.html';
            }
        });

        // Open Public View
        document.getElementById('public-view-btn')?.addEventListener('click', () => {
            window.open('public_teams.html', '_blank');
        });

        // Copy Public Link
        document.getElementById('copy-link-btn')?.addEventListener('click', () => {
            const url = new URL('public_teams.html', window.location.href).href;

            // Fallback for clipboard API if needed, but modern browsers support this
            navigator.clipboard.writeText(url).then(() => {
                alert('Link copied! \n\nNOTE: Since this app runs locally in your browser, this link is for use on THIS DEVICE only. It will not work on other computers unless they share the same screen content.');
            }).catch(err => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy link. access restricted?');
            });
        });

        setupPlayerDatalist();

        document.getElementById('shuffle-btn')?.addEventListener('click', () => {
            shufflePlayer();
        });

        document.getElementById('mark-unsold-btn')?.addEventListener('click', () => {
            if (auctionData.currentPlayer) {
                if (confirm(`Mark ${auctionData.currentPlayer} as Unsold?`)) {
                    markUnsold();
                }
            }
        });

        // Round Modal Buttons
        document.getElementById('bid-unsold-btn')?.addEventListener('click', () => {
            startNextRound();
        });

        document.getElementById('complete-auction-btn')?.addEventListener('click', () => {
            alert('Auction Completed manually.');
            setAuctionCompleteUI();
            auctionData.isComplete = true;
            saveState();
        });
    }

    // 6. PUBLIC VIEW (public_teams.html)
    const publicGrid = document.getElementById('public-teams-grid');
    if (publicGrid) {
        if (auctionData.tournamentName) {
            document.getElementById('tournament-title-display').textContent = auctionData.tournamentName;
        }
        renderPublicView();
    }

    // 7. SUMMARY PAGE (auction_summary.html)
    const summaryGrid = document.getElementById('summary-grid');
    if (summaryGrid) {
        if (auctionData.tournamentName) {
            document.getElementById('tournament-title').textContent = auctionData.tournamentName;
        }
        renderSummaryPage();
    }


    // --- HELPERS ---

    function generatePlayerInputs(count, container) {
        container.innerHTML = '';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
        container.style.gap = '1rem';
        container.style.maxHeight = '60vh';
        container.style.overflowY = 'auto';
        container.style.paddingRight = '0.5rem';

        for (let i = 0; i < count; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Player ${i + 1}`;
            input.required = true;
            input.style.marginBottom = '0';
            if (auctionData.playerPool && auctionData.playerPool[i]) {
                input.value = auctionData.playerPool[i];
            }
            container.appendChild(input);
        }
    }

    function generateTeamInputs(count, container) {
        container.innerHTML = '';
        const hasIcons = auctionData.hasIconPlayers;
        const numIcons = auctionData.numIconPlayers || 0;

        for (let i = 1; i <= count; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'team-input-block';
            wrapper.style.marginBottom = '1.5rem';
            wrapper.style.padding = '1.5rem';
            wrapper.style.background = 'rgba(255,255,255,0.03)';
            wrapper.style.borderRadius = '16px';
            wrapper.style.border = '1px solid rgba(255,255,255,0.05)';
            // wrapper.style.animation = `fadeIn 0.5s ease backwards ${i * 0.1}s`;

            const title = document.createElement('h3');
            title.textContent = `Team ${i} Details`;
            title.style.marginBottom = '1rem';
            title.style.color = '#fff';
            wrapper.appendChild(title);

            const group1 = document.createElement('div');
            group1.className = 'input-group';
            const label1 = document.createElement('label');
            label1.textContent = `Team ${i} Name`;
            const input1 = document.createElement('input');
            input1.type = 'text';
            input1.required = true;
            input1.value = `Team ${i}`;
            input1.classList.add('team-name-input');
            group1.appendChild(label1);
            group1.appendChild(input1);
            wrapper.appendChild(group1);

            const group2 = document.createElement('div');
            group2.className = 'input-group';
            const label2 = document.createElement('label');
            label2.textContent = `Manager Name (Optional)`;
            const input2 = document.createElement('input');
            input2.type = 'text';
            input2.classList.add('team-manager-input');
            group2.appendChild(label2);
            group2.appendChild(input2);
            wrapper.appendChild(group2);

            // Icon Players Inputs
            if (hasIcons && numIcons > 0) {
                const iconSection = document.createElement('div');
                iconSection.style.marginTop = '1rem';
                iconSection.style.padding = '1rem';
                iconSection.style.background = 'rgba(56, 189, 248, 0.05)';
                iconSection.style.borderRadius = '8px';
                iconSection.style.border = '1px solid rgba(56, 189, 248, 0.1)';

                const iconTitle = document.createElement('h4');
                iconTitle.textContent = 'Icon Players';
                iconTitle.style.marginBottom = '0.5rem';
                iconTitle.style.color = 'var(--primary-accent)';
                iconSection.appendChild(iconTitle);

                for (let j = 1; j <= numIcons; j++) {
                    const row = document.createElement('div');
                    row.style.display = 'grid';
                    row.style.gridTemplateColumns = '1fr';
                    row.style.gap = '1rem';
                    row.style.marginBottom = '0.5rem';

                    const nameInput = document.createElement('input');
                    nameInput.type = 'text';
                    nameInput.placeholder = `Icon Player ${j} Name`;
                    nameInput.classList.add('icon-player-name');
                    nameInput.required = true;
                    nameInput.style.width = '100%';

                    row.appendChild(nameInput);
                    iconSection.appendChild(row);
                }
                wrapper.appendChild(iconSection);
            }

            container.appendChild(wrapper);
        }
    }

    // --- CORE AUCTION LOGIC ---

    function shufflePlayer() {
        const soldPlayers = new Set();
        auctionData.teams.forEach(t => t.players.forEach(p => soldPlayers.add(p.name)));

        // Candidates are: Players in THIS ROUND'S pool who are NOT shown yet AND NOT sold
        // (Sold check is safety, though roundPool shouldn't have sold players ideally)
        const candidates = auctionData.poolForRound.filter(p =>
            !auctionData.shownInRound.includes(p) && !soldPlayers.has(p)
        );

        if (candidates.length === 0) {
            // End of Round Detected
            document.getElementById('current-player-display').textContent = 'Round Complete';
            document.getElementById('shuffle-status').textContent = 'Waiting for decision...';

            const unsoldCount = auctionData.unsoldPlayers.length;
            document.getElementById('unsold-count-badge').textContent = unsoldCount;
            document.getElementById('round-complete-msg').textContent = `Round ${auctionData.currentRound} Complete. ${unsoldCount} Unsold Players.`;

            // Check if Game Over (No unsold players left to bid on)
            // Check if Game Over (No unsold players left to bid on)
            if (unsoldCount === 0) {
                alert('Auction Complete! All players sold.');
                auctionData.isComplete = true;
                saveState();
                setAuctionCompleteUI();
                return;
            }

            openModal(document.getElementById('round-complete-modal'));
            return;
        }

        const randomIndex = Math.floor(Math.random() * candidates.length);
        const selectedPlayer = candidates[randomIndex];

        auctionData.currentPlayer = selectedPlayer;
        auctionData.shownInRound.push(selectedPlayer);

        saveState();
        updateSpotlightUI();
    }

    function markUnsold() {
        if (!auctionData.currentPlayer) return;

        auctionData.unsoldPlayers.push(auctionData.currentPlayer);
        auctionData.currentPlayer = null;

        saveState();
        updateSpotlightUI();

        // Auto-trigger check for end of round? No, let user click "Bring Next Player"
        // But UI should look empty
    }

    function startNextRound() {
        if (auctionData.unsoldPlayers.length === 0) {
            alert("No players in unsold list!");
            return;
        }

        auctionData.currentRound++;
        auctionData.poolForRound = [...auctionData.unsoldPlayers];
        auctionData.unsoldPlayers = []; // Reset unsold list for new round accumulation? 
        // YES. If they go unsold AGAIN, they get added back here.
        auctionData.shownInRound = [];
        auctionData.currentPlayer = null;

        closeModal(document.getElementById('round-complete-modal'));
        saveState();
        updateSpotlightUI();
        alert(`Starting Round ${auctionData.currentRound}`);
    }

    function updateSpotlightUI() {
        const display = document.getElementById('current-player-display');
        const status = document.getElementById('shuffle-status');
        const markUnsoldBtn = document.getElementById('mark-unsold-btn');

        if (display && auctionData.currentPlayer) {
            display.textContent = auctionData.currentPlayer;

            const total = auctionData.poolForRound.length;
            const shown = auctionData.shownInRound.length;

            if (status) status.textContent = `Round ${auctionData.currentRound}: ${shown} / ${total} players`;
            if (markUnsoldBtn) markUnsoldBtn.disabled = false;

        } else if (display) {
            display.textContent = "Ready to Start";
            if (status) status.textContent = `Round ${auctionData.currentRound}`;
            if (markUnsoldBtn) markUnsoldBtn.disabled = true;
        }
    }

    function setAuctionCompleteUI() {
        document.getElementById('current-player-display').textContent = 'Auction Complete';
        // Hide the controls container
        const shuffleBtn = document.getElementById('shuffle-btn');
        if (shuffleBtn) {
            const container = shuffleBtn.parentElement;
            if (container && container.tagName === 'DIV') {
                container.style.display = 'none';
            } else {
                shuffleBtn.style.display = 'none';
                document.getElementById('mark-unsold-btn').style.display = 'none';
            }
        }
        document.getElementById('shuffle-status').textContent = 'No more players.';
    }

    function analyzeTeamStrategy(team) {
        // 1. Prefer Backend Result (if available)
        if (team.analysis) return team.analysis;

        // 2. Local Fallback Logic
        const totalBudget = auctionData.totalCredits;
        const totalSlots = auctionData.playersPerTeam;
        const basePrice = auctionData.basePrice || 0;

        const spentPct = (totalBudget - team.budget) / totalBudget;
        const slotsFilled = team.players.length;
        const slotsPct = slotsFilled / totalSlots;
        const remainingSlots = totalSlots - slotsFilled;
        const avgBudgetPerSlot = remainingSlots > 0 ? Math.floor(team.budget / remainingSlots) : 0;

        // Default Analysis
        let status = { label: 'Balanced', color: 'var(--text-secondary)', icon: '⚖️' };

        // 1. Completion Check
        if (remainingSlots === 0) {
            status = { label: 'Complete', color: '#10b981', icon: '✅' };
            return { status, avgBudget: 0, remainingSlots };
        }

        // 2. Risk Calculation (Most Critical)
        // If money left per slot is dangerously close to base price (e.g., < 1.2x base pric)
        const riskThreshold = basePrice > 0 ? basePrice * 1.5 : (totalBudget / totalSlots) * 0.2;
        if (avgBudgetPerSlot < riskThreshold) {
            status = { label: 'High Risk', color: '#ef4444', icon: '⚠️' };
            return { status, avgBudget: avgBudgetPerSlot, remainingSlots };
        }

        // 3. Strategy Type (Relative Spending vs Filling)
        // Diff > 0 means spending FASTER than filling (Aggressive)
        // Diff < 0 means filling FASTER than spending (Conservative)
        const diff = spentPct - slotsPct;

        if (diff > 0.20) {
            status = { label: 'Aggressive', color: '#f59e0b', icon: '🔥' }; // Spent a lot for few players
        } else if (diff < -0.15) {
            status = { label: 'Saver', color: '#3b82f6', icon: '💎' }; // Got many players for cheap
            // Special case: Conservative but safe
        } else if (spentPct < 0.2 && slotsPct > 0.4) {
            status = { label: 'Smart Buy', color: '#10b981', icon: '🧠' };
        }

        return { status, avgBudget: avgBudgetPerSlot, remainingSlots };
    }

    function renderDashboard() {
        const teamsGrid = document.getElementById('teams-grid');
        if (!teamsGrid) return;
        teamsGrid.innerHTML = '';

        auctionData.teams.forEach((team, index) => {
            const budgetPercent = (team.budget / auctionData.totalCredits) * 100;
            const analysis = analyzeTeamStrategy(team);

            const card = document.createElement('div');
            card.className = 'team-card';
            card.innerHTML = `
                <div class="team-header" style="display: block;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                        <div class="team-name" style="word-break: break-word; line-height: 1.2; margin-right: 1rem;">${team.name}</div>
                        <div class="player-count" style="flex-shrink: 0; white-space: nowrap; margin-top: 5px;">${team.players.length} / ${auctionData.playersPerTeam}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="manager-name" style="margin:0; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Manager: ${team.manager || 'None'}</div>
                        
                        <span style="
                            font-size: 0.75rem; 
                            background: rgba(255,255,255,0.05); 
                            padding: 4px 10px; 
                            border-radius: 20px;
                            color: ${analysis.status.color};
                            border: 1px solid ${analysis.status.color};
                            white-space: nowrap;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                        " title="Strategy Analysis">
                            <span style="font-size: 1rem;">${analysis.status.icon}</span>
                            <span style="font-weight: 500;">${analysis.status.label}</span>
                        </span>
                    </div>
                </div>
                
                <div class="budget-info">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.2rem; color: #aaa;">
                         <span>Remaining Credits</span>
                         <span title="Max average bid for remaining players">Avg: ~${analysis.avgBudget.toLocaleString()} / player</span>
                    </div>
                    <div class="budget-value">${team.budget.toLocaleString()}</div>
                    <div class="budget-bar">
                        <div class="budget-progress" style="width: ${budgetPercent}%"></div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-secondary btn-sm btn-undo" onclick="app.undoLastAction(${index})">Undo</button>
                    <button class="btn-secondary btn-sm" onclick="app.viewPlayers(${index})">View</button>
                    <button class="btn-primary btn-sm btn-add" onclick="app.openAddPlayerModal(${index})">+ Add Player</button>
                </div>
            `;
            teamsGrid.appendChild(card);
        });
    }

    function renderPublicView() {
        const grid = document.getElementById('public-teams-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!auctionData.teams || auctionData.teams.length === 0) {
            grid.innerHTML = '<p class="text-center">No teams available.</p>';
            return;
        }

        auctionData.teams.forEach((team) => {
            const budgetPercent = (team.budget / auctionData.totalCredits) * 100;
            const analysis = analyzeTeamStrategy(team);

            const card = document.createElement('div');
            card.className = 'team-card'; // Reuse styled class

            let playersHtml = '';
            if (team.players.length === 0) {
                playersHtml = '<div style="padding:1rem; color:#aaa; font-style:italic;">No players yet</div>';
            } else {
                playersHtml = '<div class="player-list-public">';
                team.players.forEach(p => {
                    playersHtml += `
                        <div class="player-row">
                            <span style="font-weight:600; color:#fff;">${p.name}</span>
                            <span style="color:var(--primary-accent);">${p.price.toLocaleString()}</span>
                        </div>
                     `;
                });
                playersHtml += '</div>';
            }

            // Combine Header (with Analysis) + Players List
            card.innerHTML = `
                <div class="team-header" style="display: block; margin-bottom:1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                        <div class="team-name" style="font-size: 1.1rem; word-break: break-word; line-height: 1.2; margin-right: 1rem;">${team.name}</div>
                        <div style="flex-shrink: 0; white-space: nowrap; font-size:0.9rem; font-weight:bold; margin-top: 2px;">${team.players.length} / ${auctionData.playersPerTeam}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="manager-name" style="margin:0; font-size:0.85rem; color:#aaa; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Manager: ${team.manager || 'None'}</div>
                        
                        <span style="
                            font-size: 0.7rem; 
                            background: rgba(255,255,255,0.05); 
                            padding: 2px 8px; 
                            border-radius: 12px;
                            color: ${analysis.status.color};
                            border: 1px solid ${analysis.status.color};
                            white-space: nowrap;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                        " title="Strategy Analysis">
                            <span>${analysis.status.icon}</span>
                            <span>${analysis.status.label}</span>
                        </span>
                    </div>
                </div>
                <div class="budget-info" style="margin-bottom:1rem;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.2rem; color: #aaa;">
                         <span>Remaining Credits</span>
                         <span title="Max average bid for remaining players">Avg: ~${analysis.avgBudget.toLocaleString()} / player</span>
                    </div>
                    <div class="budget-value" style="font-size:1.2rem;">${team.budget.toLocaleString()}</div>
                    <div class="budget-bar">
                        <div class="budget-progress" style="width: ${budgetPercent}%"></div>
                    </div>
                </div>

                ${playersHtml}
            `;
            grid.appendChild(card);
        });
    }

    function renderSummaryPage() {
        const grid = document.getElementById('summary-grid');
        if (!grid) return;

        // Use the same logic as renderPublicView but with specific styling classes if needed
        // Or reuse rendering logic? Let's implement specific for the new page structure

        if (!auctionData.teams || auctionData.teams.length === 0) {
            grid.innerHTML = '<p class="text-center">No teams available.</p>';
            return;
        }

        auctionData.teams.forEach((team) => {
            // Recalculate or use saved analysis
            // const analysis = team.analysis || analyzeTeamStrategy(team); 
            // Reuse analysis function for consistency
            const analysis = analyzeTeamStrategy(team);

            const card = document.createElement('div');
            card.className = 'team-card-summary';

            let playersHtml = '';
            if (team.players.length === 0) {
                playersHtml = '<div style="padding:1rem; color:#aaa; font-style:italic;">No players</div>';
            } else {
                playersHtml = '<div class="player-list-s">';
                team.players.forEach(p => {
                    const isIcon = p.isIcon;
                    const priceDisplay = isIcon ? '<span class="icon-badge">ICON</span>' : p.price.toLocaleString();
                    const nameStyle = isIcon ? 'color: var(--primary-accent); font-weight: bold;' : '';
                    const iconPrefix = isIcon ? '⭐ ' : '';

                    playersHtml += `
                    <div class="player-item">
                        <span style="${nameStyle}">${iconPrefix}${p.name}</span>
                        <span class="player-price">${priceDisplay}</span>
                    </div>
                `;
                });
                playersHtml += '</div>';
            }

            card.innerHTML = `
                <div class="team-header-s">
                    <div class="team-name-s">${team.name}</div>
                    <div class="manager-name-s">Manager: ${team.manager || 'None'}</div>
                </div>
                 <!-- Optional: Show Stats in summary too? User asked for Team List, Players, Manager Name. -->
                 <!-- Keeping it clean as requested. -->
                 
                ${playersHtml}
            `;
            grid.appendChild(card);
        });
    }

    // Modal Logic & Actions
    const addPlayerModal = document.getElementById('add-player-modal');
    const viewPlayersModal = document.getElementById('view-players-modal');
    const playersListContainer = document.getElementById('players-list');
    const addPlayerForm = document.getElementById('add-player-form');

    function openModal(modal) { if (modal) modal.classList.add('open'); }
    function closeModal(modal) { if (modal) modal.classList.remove('open'); }

    function setupPlayerDatalist() {
        let datalist = document.getElementById('player-pool-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'player-pool-list';
            document.body.appendChild(datalist);
            const playerInput = document.getElementById('player-name');
            if (playerInput) playerInput.setAttribute('list', 'player-pool-list');
        }

        const soldPlayers = new Set();
        auctionData.teams.forEach(t => t.players.forEach(p => soldPlayers.add(p.name)));

        datalist.innerHTML = '';
        if (auctionData.playerPool) {
            auctionData.playerPool.forEach(pName => {
                if (!soldPlayers.has(pName)) {
                    const option = document.createElement('option');
                    option.value = pName;
                    datalist.appendChild(option);
                }
            });
        }
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal')));
    });

    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) closeModal(event.target);
    };

    if (addPlayerForm) {
        addPlayerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const index = parseInt(document.getElementById('current-team-index').value);
            const name = document.getElementById('player-name').value;
            const price = parseInt(document.getElementById('player-price').value);
            const team = auctionData.teams[index];

            if (team.players.length >= auctionData.playersPerTeam) { alert('Team is full!'); return; }
            if (price > team.budget) { alert('Insufficient credits!'); return; }
            if (auctionData.basePrice && price < auctionData.basePrice) { alert('Below Base Price!'); return; }

            // Minimum Budget Reservation Rule
            if (auctionData.basePrice) {
                const remainingSlots = auctionData.playersPerTeam - team.players.length;
                // slots to reserve money for is (remaining - 1 current one)
                const reserveNeeded = (remainingSlots - 1) * auctionData.basePrice;
                const budgetAfter = team.budget - price;

                if (budgetAfter < reserveNeeded) {
                    alert(`Invalid Bid! You must keep at least ${reserveNeeded} credits for the remaining ${remainingSlots - 1} players.`);
                    return;
                }
            }

            team.players.push({ name, price });
            team.budget -= price;
            if (auctionData.currentPlayer === name) {
                auctionData.currentPlayer = null;
                updateSpotlightUI();
            }
            saveState();
            closeModal(addPlayerModal);
            renderDashboard();
            setupPlayerDatalist();

            // --- CHECK FOR LAST PLAYER ---
            const allTeamsFull = auctionData.teams.every(t => t.players.length >= auctionData.playersPerTeam);

            if (allTeamsFull) {
                // Determine if we should ask.
                // "When all teams are full... automatically show that auction is completed"
                setTimeout(() => {
                    alert("All teams are full! The auction is complete.");
                    auctionData.isComplete = true;
                    saveState();
                    window.location.href = 'auction_summary.html';
                }, 200);
            }
        });
    }

    // Exported App Actions
    window.app = {
        openAddPlayerModal: (teamIndex) => {
            setupPlayerDatalist();
            document.getElementById('current-team-index').value = teamIndex;
            const nameInput = document.getElementById('player-name');
            nameInput.value = auctionData.currentPlayer ? auctionData.currentPlayer : '';
            document.getElementById('player-price').value = '';
            document.getElementById('player-price').placeholder = `Min ${auctionData.basePrice || 0}`;
            openModal(addPlayerModal);
            nameInput.focus();
        },
        undoLastAction: (teamIndex) => {
            const team = auctionData.teams[teamIndex];
            if (team.players.length === 0) { alert('No players to remove!'); return; }
            if (confirm(`Remove last player from ${team.name}?`)) {
                const lastPlayer = team.players.pop();
                team.budget += lastPlayer.price;

                // --- NEW UNDO LOGIC ---
                const pName = lastPlayer.name;

                // 1. Remove from "Shown" list so shuffle can pick them again
                if (auctionData.shownInRound) {
                    auctionData.shownInRound = auctionData.shownInRound.filter(p => p !== pName);
                }

                // 2. Ensure they are in the current POOL (if not already)
                if (auctionData.poolForRound && !auctionData.poolForRound.includes(pName)) {
                    auctionData.poolForRound.push(pName);
                }

                // 3. Remove from unsold if they were there (just safety)
                if (auctionData.unsoldPlayers) {
                    auctionData.unsoldPlayers = auctionData.unsoldPlayers.filter(p => p !== pName);
                }

                // 4. Reset Auction Complete Status
                if (auctionData.isComplete) {
                    auctionData.isComplete = false;
                    // Re-show controls
                    const shuffleBtn = document.getElementById('shuffle-btn');
                    if (shuffleBtn) {
                        const container = shuffleBtn.parentElement;
                        if (container && container.tagName === 'DIV') {
                            container.style.display = 'flex';
                        } else {
                            shuffleBtn.style.display = 'inline-block';
                            document.getElementById('mark-unsold-btn').style.display = 'inline-block';
                        }
                    }
                    document.getElementById('shuffle-status').textContent = 'Auction re-opened via Undo.';
                }

                saveState();
                renderDashboard();
                setupPlayerDatalist();
            }
        },
        viewPlayers: (teamIndex) => {
            const team = auctionData.teams[teamIndex];
            playersListContainer.innerHTML = '';
            if (team.players.length === 0) {
                playersListContainer.innerHTML = '<p style="color:#aaa;">No players yet.</p>';
            } else {
                team.players.forEach(p => {
                    const row = document.createElement('div');
                    row.className = 'player-item';
                    row.innerHTML = `<span>${p.name}</span> <span class="player-price">${p.price.toLocaleString()}</span>`;
                    playersListContainer.appendChild(row);
                });
            }
            openModal(viewPlayersModal);
        }
    };

    // --- MANAGE POOL LOGIC ---
    const editPoolModal = document.getElementById('edit-pool-modal');
    const poolListContainer = document.getElementById('pool-management-list');
    const addNewPlayerForm = document.getElementById('add-new-player-form');

    document.getElementById('edit-pool-btn')?.addEventListener('click', () => {
        renderManagePoolList();
        openModal(editPoolModal);
    });

    if (addNewPlayerForm) {
        addNewPlayerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('new-player-name');
            const name = input.value.trim();

            if (name) {
                // Check Capacity
                if (auctionData.playerPool.length >= auctionData.totalPlayers) {
                    alert(`Pool is Full! (${auctionData.playerPool.length}/${auctionData.totalPlayers})\n\nCannot add new player. Please remove a player first.`);
                    return;
                }

                if (auctionData.playerPool.includes(name)) {
                    alert('Player already exists!');
                    return;
                }
                auctionData.playerPool.push(name);
                // auctionData.totalPlayers++; // DO NOT increment capacity

                input.value = '';
                saveState();
                renderManagePoolList();
                setupPlayerDatalist();
                updateSpotlightUI(); // Just in case counts changed
            }
        });
    }

    function renderManagePoolList() {
        if (!poolListContainer) return;

        // Identify sold players for locking
        const soldPlayers = new Set();
        auctionData.teams.forEach(t => t.players.forEach(p => soldPlayers.add(p.name)));

        poolListContainer.innerHTML = '';

        // Capacity Header
        const stats = document.createElement('div');
        stats.style.padding = '0.5rem';
        stats.style.marginBottom = '1rem';
        stats.style.background = 'rgba(255,255,255,0.05)';
        stats.style.borderRadius = '8px';
        stats.style.display = 'flex';
        stats.style.justifyContent = 'space-between';

        const isFull = auctionData.playerPool.length >= auctionData.totalPlayers;
        stats.innerHTML = `
            <span>Total Players: <strong>${auctionData.playerPool.length} / ${auctionData.totalPlayers}</strong></span>
            <span style="color: ${isFull ? '#ef4444' : '#10b981'}; font-weight:600;">
                ${isFull ? 'POOL FULL' : 'OPEN SLOTS'}
            </span>
        `;
        poolListContainer.appendChild(stats);

        if (auctionData.playerPool.length === 0) {
            const p = document.createElement('p');
            p.style.color = '#aaa';
            p.style.textAlign = 'center';
            p.textContent = 'No players in pool.';
            poolListContainer.appendChild(p);
            return;
        }

        // Sort: Unsold first, then Sold (Locked)
        const sortedPool = [...auctionData.playerPool].sort((a, b) => {
            const aSold = soldPlayers.has(a);
            const bSold = soldPlayers.has(b);
            if (aSold === bSold) return a.localeCompare(b);
            return aSold ? 1 : -1;
        });

        sortedPool.forEach(player => {
            const isSold = soldPlayers.has(player);

            const row = document.createElement('div');
            row.className = 'player-item'; // Reuse existing class
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';

            row.innerHTML = `
                <span style="${isSold ? 'color: var(--text-secondary); text-decoration: line-through;' : ''}">
                    ${player} ${isSold ? '(Sold)' : ''}
                </span>
            `;

            if (!isSold) {
                const delBtn = document.createElement('button');
                delBtn.textContent = 'Remove';
                delBtn.className = 'btn-secondary btn-sm';
                delBtn.style.padding = '0.2rem 0.5rem';
                delBtn.style.fontSize = '0.8rem';
                delBtn.style.color = '#ef4444';
                delBtn.style.borderColor = 'rgba(239,68,68,0.3)';
                delBtn.onclick = () => {
                    removePlayerFromPool(player);
                };
                row.appendChild(delBtn);
            } else {
                const lockIcon = document.createElement('span');
                lockIcon.innerHTML = '🔒';
                lockIcon.title = 'Cannot remove sold player';
                lockIcon.style.opacity = '0.5';
                row.appendChild(lockIcon);
            }

            poolListContainer.appendChild(row);
        });
    }

    function removePlayerFromPool(playerName) {
        if (!confirm(`Permanently remove "${playerName}" from the pool?`)) return;

        // Validation: Double check not sold
        const soldPlayers = new Set();
        auctionData.teams.forEach(t => t.players.forEach(p => soldPlayers.add(p.name)));
        if (soldPlayers.has(playerName)) {
            alert('Cannot remove a player who is already sold!');
            return;
        }

        const index = auctionData.playerPool.indexOf(playerName);
        if (index > -1) {
            auctionData.playerPool.splice(index, 1);
            // auctionData.totalPlayers--; // DO NOT decrement capacity

            // If this player was in the shown list, remove them
            if (auctionData.shownPlayers) {
                const shownIdx = auctionData.shownPlayers.indexOf(playerName);
                if (shownIdx > -1) auctionData.shownPlayers.splice(shownIdx, 1);
            }

            // If this player was the current spotlight, unselect
            if (auctionData.currentPlayer === playerName) {
                auctionData.currentPlayer = null;
            }

            saveState();
            renderManagePoolList();
            setupPlayerDatalist();
            updateSpotlightUI();
        }
    }
    // --- 8. POOLS LOGIC ---

    const poolConfigModal = document.getElementById('pool-config-modal');
    const createPoolsBtn = document.getElementById('create-pools-btn');
    const generatePoolsBtn = document.getElementById('generate-pools-btn');

    // State for Pool Config
    let tempPoolConfig = {
        method: 'random', // 'random' or 'manual'
        distribution: 'equal', // 'equal' or 'custom'
        numPools: 2,
        customDist: [] // Array of counts
    };

    if (createPoolsBtn) {
        createPoolsBtn.addEventListener('click', () => {
            // Reset config
            tempPoolConfig = { method: 'random', distribution: 'equal', numPools: 2, customDist: [] };
            document.getElementById('num-pools-input').value = 2;
            document.getElementById('pool-method-select').value = 'random';
            updatePoolConfigUI();
            openModal(poolConfigModal);
        });
    }

    const numPoolsInput = document.getElementById('num-pools-input');
    if (numPoolsInput) {
        numPoolsInput.addEventListener('input', (e) => {
            tempPoolConfig.numPools = parseInt(e.target.value) || 1;
            updatePoolConfigUI();
        });
    }

    const poolMethodSelect = document.getElementById('pool-method-select');
    if (poolMethodSelect) {
        poolMethodSelect.addEventListener('change', (e) => {
            tempPoolConfig.method = e.target.value;
            updatePoolConfigUI();
        });
    }

    if (generatePoolsBtn) {
        generatePoolsBtn.addEventListener('click', () => {
            generatePools();
        });
    }

    // Expose helpers to app
    if (!window.app) window.app = {};
    window.app.setPoolDistribution = (type) => {
        tempPoolConfig.distribution = type;
        updatePoolConfigUI();
    };


    function updatePoolConfigUI() {
        const step2Random = document.getElementById('pool-step-2-random');
        const step2Manual = document.getElementById('pool-step-2-manual');
        const distEqualBtn = document.getElementById('dist-equal-btn');
        const distCustomBtn = document.getElementById('dist-custom-btn');
        const customDistInputs = document.getElementById('custom-dist-inputs');

        // Hide all Step 2s first
        if (step2Random) step2Random.style.display = 'none';
        if (step2Manual) step2Manual.style.display = 'none';

        if (tempPoolConfig.method === 'random') {
            if (step2Random) step2Random.style.display = 'block';

            // Toggle Active Buttons
            if (tempPoolConfig.distribution === 'equal') {
                if (distEqualBtn) distEqualBtn.classList.add('active-method');
                if (distCustomBtn) distCustomBtn.classList.remove('active-method');
                if (customDistInputs) customDistInputs.style.display = 'none';
            } else {
                if (distEqualBtn) distEqualBtn.classList.remove('active-method');
                if (distCustomBtn) distCustomBtn.classList.add('active-method');
                if (customDistInputs) customDistInputs.style.display = 'block';
                renderCustomDistributionInputs();
            }
        } else {
            if (step2Manual) step2Manual.style.display = 'block';
            renderManualAssignmentUI();
        }
    }

    function renderCustomDistributionInputs() {
        const container = document.getElementById('pool-distribution-inputs');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 1; i <= tempPoolConfig.numPools; i++) {
            const input = document.createElement('input');
            input.type = 'number';
            input.placeholder = `Pool ${i}`;
            input.min = 0;
            input.style.width = '100%';
            // basic styling
            input.style.background = 'rgba(255,255,255,0.1)';
            input.style.border = '1px solid rgba(255,255,255,0.2)';
            input.style.color = '#fff';
            input.style.padding = '5px';
            input.style.borderRadius = '4px';

            container.appendChild(input);
        }
    }

    function renderManualAssignmentUI() {
        const container = document.getElementById('manual-pool-assignment-container');
        if (!container) return;
        container.innerHTML = '';

        if (!auctionData.teams || auctionData.teams.length === 0) {
            container.innerHTML = 'No teams available.';
            return;
        }

        auctionData.teams.forEach((team, index) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.marginBottom = '0.5rem';
            row.style.background = 'rgba(255,255,255,0.05)';
            row.style.padding = '0.5rem';
            row.style.borderRadius = '4px';

            const name = document.createElement('span');
            name.textContent = team.name;

            const select = document.createElement('select');
            select.className = 'manual-pool-select';
            select.dataset.teamIndex = index;
            select.style.background = '#333';
            select.style.color = '#fff';
            select.style.border = '1px solid #555';
            select.style.borderRadius = '4px';
            select.style.padding = '2px 5px';

            for (let i = 1; i <= tempPoolConfig.numPools; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `Pool ${i}`;
                select.appendChild(opt);
            }

            row.appendChild(name);
            row.appendChild(select);
            container.appendChild(row);
        });
    }

    function generatePools() {
        // Validation & Logic
        const pools = []; // Array of Arrays of Team Objects (or Indices)
        // Let's store Team Indices to persist

        const numPools = tempPoolConfig.numPools;
        if (numPools < 1) return;

        if (tempPoolConfig.method === 'random') {
            const teamIndices = auctionData.teams.map((_, i) => i);
            // Shuffle
            for (let i = teamIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [teamIndices[i], teamIndices[j]] = [teamIndices[j], teamIndices[i]];
            }

            if (tempPoolConfig.distribution === 'equal') {
                // Distribute round-robin
                for (let i = 0; i < numPools; i++) pools.push([]);
                teamIndices.forEach((tIdx, i) => {
                    pools[i % numPools].push(tIdx);
                });
            } else {
                // Custom
                const inputs = document.querySelectorAll('#pool-distribution-inputs input');
                const limits = Array.from(inputs).map(inp => parseInt(inp.value) || 0);

                // Validate total matches team count?
                const sum = limits.reduce((a, b) => a + b, 0);
                // Only validate if sum > 0 (to allow lazy input) but strict is better
                if (sum !== auctionData.teams.length) {
                    alert(`Distribution sum (${sum}) does not match total teams (${auctionData.teams.length})`);
                    return;
                }

                let currentIndex = 0;
                limits.forEach(limit => {
                    const pool = [];
                    for (let k = 0; k < limit; k++) {
                        if (currentIndex < teamIndices.length) {
                            pool.push(teamIndices[currentIndex++]);
                        }
                    }
                    pools.push(pool);
                });
            }

        } else {
            // Manual
            for (let i = 0; i < numPools; i++) pools.push([]);
            const selects = document.querySelectorAll('.manual-pool-select');
            selects.forEach(select => {
                const teamIdx = parseInt(select.dataset.teamIndex);
                const poolNum = parseInt(select.value) - 1; // 0-indexed
                if (pools[poolNum]) pools[poolNum].push(teamIdx);
            });
        }

        // Save Pools
        auctionData.pools = pools;
        saveState();

        // Render & Close
        renderPools();
        closeModal(poolConfigModal);

        // Show container
        const container = document.getElementById('pools-display-container');
        if (container) {
            container.style.display = 'block';
            container.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function renderPools() {
        const container = document.getElementById('pools-grid');
        const wrapper = document.getElementById('pools-display-container');
        if (!container) return;

        if (!auctionData.pools || auctionData.pools.length === 0) {
            if (wrapper) wrapper.style.display = 'none';
            return;
        }

        if (wrapper) wrapper.style.display = 'block';
        container.innerHTML = '';

        auctionData.pools.forEach((pool, index) => {
            const col = document.createElement('div');
            col.className = 'pool-column';

            const header = document.createElement('div');
            header.className = 'pool-header';
            header.textContent = `Pool ${index + 1}`;
            col.appendChild(header);

            pool.forEach(teamIdx => {
                const team = auctionData.teams[teamIdx];
                if (team) {
                    const item = document.createElement('div');
                    item.className = 'pool-team-item';
                    item.innerHTML = `
                        <span style="font-weight:600; color:#fff;">${team.name}</span>
                        <span style="font-size:0.8rem; color:#aaa;">${team.manager || ''}</span>
                    `;
                    col.appendChild(item);
                }
            });
            container.appendChild(col);
        });
    }

    // Auto-load pools on startup if they exist
    if (auctionData.pools && auctionData.pools.length > 0) {
        renderPools();
    }
});
