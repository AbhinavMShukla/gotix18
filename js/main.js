let CANVAS = null;
        let CTX = null;

        let config = {
            lang: 'hi',
            mode: 'pvp',
            aiDiff: 'medium',
            boardTheme: 'royal',
            pieceTheme: 'red_black',
            pieceStyle: 'vertical',
            soundEnabled: localStorage.getItem('gotix_sound_enabled') !== 'false',
            bgmEnabled: localStorage.getItem('gotix_bgm_enabled') !== 'false',
            musicVolume: Number(localStorage.getItem('gotix_music_volume') ?? .25),
            sfxVolume: Number(localStorage.getItem('gotix_sfx_volume') ?? .6),
            username: localStorage.getItem('gutika_username') || 'Player_' + Math.floor(Math.random() * 9000 + 1000)
        };

        // User Stats & Reward Points State
        let userStats = JSON.parse(localStorage.getItem('gutika_stats')) || { 
            played: 0, 
            wins: 0, 
            losses: 0,
            coins: 100,
            xp: 10
        };

        let onlineState = { 
            roomCode: null, 
            role: null, 
            unsubscribe: null, 
            roomRef: null, 
            connected: false, 
            startedLocally: false,
            moveTimer: 120,
            turnDeadline: null,
            timeoutCounts: {P1: 0, P2: 0},
            resolvingTimeout: false,
            lastAlertTurnKey: null,
            lastTickSecond: null,
            turnInterval: null,
            syncInterval: null,
            chatMessages: [],
            lastSeenChatIndex: 0
        };

        let gameState = {
            board: new Array(37).fill(null),
            turn: 'P1',
            selectedNode: null,
            legalMoves: [],
            multiCaptureActive: false,
            p1Count: 18,
            p2Count: 18,
            gameOver: false,
            history: [],
            moveLogs: [],
            elapsedSeconds: 0,
            timerInterval: null
        };

        // GOTIX 18 Royal Sound Pack: offline original audio, separate music/SFX volumes.
        class SoundFX {
            constructor() {
                this.ctx = null;
                this.music = new Audio('audio/royal-home.wav');
                this.music.loop = true;
                this.music.preload = 'auto';
                this.files = {};
                ['select','move','capture','capture-opponent','victory','loss'].forEach(k => {
                    const a = new Audio(`audio/${k}.wav`);
                    a.preload = 'auto';
                    this.files[k] = a;
                });
                this.music.volume = 0;
                this.unlocked = false;
                this.winPlayed = false;
                this.fade = null;
            }
            init() {
                if (!this.ctx) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (AC) this.ctx = new AC();
                }
                if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            }
            unlock() {
                this.unlocked = true;
                this.init();
                this.updateMusic();
            }
            sfx(key) {
                if (!config.soundEnabled) return;
                const a = this.files[key];
                if (!a) return;
                try {
                    const copy = a.cloneNode();
                    copy.volume = Math.max(0, Math.min(1, config.sfxVolume ?? .6));
                    copy.play().catch(() => {});
                } catch (e) { /* audio unavailable; gameplay unaffected */ }
            }
            playBeep(freq, type = 'sine', duration = .15, vol = .1) {
                if (!config.soundEnabled) return;
                this.init();
                if (!this.ctx) return;
                try {
                    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                    gain.gain.setValueAtTime(vol * (config.sfxVolume ?? .6), this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(this.ctx.currentTime + duration);
                } catch(e) {}
            }
            playSelect() { this.sfx('select'); }
            playMove() { this.sfx('move'); }
            playCapture(isMine = true) { this.sfx(isMine ? 'capture' : 'capture-opponent'); }
            playWin() { this.stopBGM(); this.sfx('victory'); }
            playLoss() { this.stopBGM(); this.sfx('loss'); }
            toggleBGM() {
                config.bgmEnabled = !config.bgmEnabled;
                localStorage.setItem('gotix_bgm_enabled', String(config.bgmEnabled));
                this.updateMusic();
            }
            startBGM() { this.updateMusic(); }
            stopBGM() { this.fadeTo(0, true); }
            fadeTo(target, pauseAtEnd = false) {
                if (this.fade) clearInterval(this.fade);
                const a = this.music;
                let n = 0, initial = a.volume;
                this.fade = setInterval(() => {
                    n++;
                    a.volume = Math.max(0, Math.min(1, initial + (target - initial) * n / 12));
                    if (n >= 12) {
                        clearInterval(this.fade); this.fade = null;
                        if (pauseAtEnd) a.pause();
                    }
                }, 35);
            }
            updateMusic() {
                const menu = document.getElementById('modal-start-menu');
                const shouldPlay = this.unlocked && config.bgmEnabled && menu && !menu.classList.contains('hidden') && !document.hidden;
                const btn = document.getElementById('btn-bgm');
                if (btn) btn.innerHTML = config.bgmEnabled ? '<i class="fa-solid fa-music text-xs text-amber-600"></i>' : '<i class="fa-solid fa-music text-xs opacity-50"></i>';
                if (shouldPlay) {
                    this.music.play().then(() => this.fadeTo(config.musicVolume ?? .25)).catch(() => {});
                } else this.stopBGM();
            }
        }
        const audio = new SoundFX();

        let activeAnimation = null;
        let particles = [];
        let touchRipples = [];

        const NODES_DEF = [
            { x: 0.27, y: 0.05 }, { x: 0.50, y: 0.05 }, { x: 0.73, y: 0.05 },
            { x: 0.37, y: 0.13 }, { x: 0.50, y: 0.13 }, { x: 0.63, y: 0.13 },
            { x: 0.16, y: 0.22 }, { x: 0.33, y: 0.22 }, { x: 0.50, y: 0.22 }, { x: 0.67, y: 0.22 }, { x: 0.84, y: 0.22 },
            { x: 0.16, y: 0.36 }, { x: 0.33, y: 0.36 }, { x: 0.50, y: 0.36 }, { x: 0.67, y: 0.36 }, { x: 0.84, y: 0.36 },
            { x: 0.16, y: 0.50 }, { x: 0.33, y: 0.50 }, { x: 0.50, y: 0.50 }, { x: 0.67, y: 0.50 }, { x: 0.84, y: 0.50 },
            { x: 0.16, y: 0.64 }, { x: 0.33, y: 0.64 }, { x: 0.50, y: 0.64 }, { x: 0.67, y: 0.64 }, { x: 0.84, y: 0.64 },
            { x: 0.16, y: 0.78 }, { x: 0.33, y: 0.78 }, { x: 0.50, y: 0.78 }, { x: 0.67, y: 0.78 }, { x: 0.84, y: 0.78 },
            { x: 0.37, y: 0.87 }, { x: 0.50, y: 0.87 }, { x: 0.63, y: 0.87 },
            { x: 0.27, y: 0.95 }, { x: 0.50, y: 0.95 }, { x: 0.73, y: 0.95 }
        ];

        const ADJACENCY_LIST = [
            [1, 3], [0, 2, 4], [1, 5],
            [0, 4, 8], [1, 3, 5, 8], [2, 4, 8],
            [7, 11, 12], [6, 8, 12], [3, 4, 5, 7, 9, 12, 13, 14], [8, 10, 14], [9, 14, 15],
            [6, 12, 16], [6, 7, 8, 11, 13, 16, 17, 18], [8, 12, 14, 18], [8, 9, 10, 13, 15, 18, 19, 20], [10, 14, 20],
            [11, 12, 17, 21, 22], [12, 16, 18, 22], [12, 13, 14, 17, 19, 22, 23, 24], [14, 18, 20, 24], [14, 15, 19, 24, 25],
            [16, 22, 26], [16, 17, 18, 21, 23, 26, 27, 28], [18, 22, 24, 28], [18, 19, 20, 23, 25, 28, 29, 30], [20, 24, 30],
            [21, 22, 27], [22, 26, 28], [22, 23, 24, 27, 29, 31, 32, 33], [24, 28, 30], [24, 25, 29],
            [28, 32, 34], [28, 31, 33, 35], [28, 32, 36],
            [31, 35], [32, 34, 36], [33, 35]
        ];

        const THEMES = {
            boards: {
                royal: { line: '#e7c279', shadowLine: '#f9e6b1', nodeFill: '#172d4b', nodeBorder: '#c99b54', ring: '#e6bf76' },
                wooden: { line: '#b45309', shadowLine: '#fef3c7', nodeFill: '#ffffff', nodeBorder: '#92400e', ring: '#d97706' },
                classic: { line: '#166534', shadowLine: '#dcfce7', nodeFill: '#ffffff', nodeBorder: '#14532d', ring: '#15803d' },
                dark: { line: '#334155', shadowLine: '#f1f5f9', nodeFill: '#ffffff', nodeBorder: '#1e293b', ring: '#475569' },
                ivory: { line: '#92400e', shadowLine: '#fffbeb', nodeFill: '#ffffff', nodeBorder: '#b45309', ring: '#d97706' },
                nature: { line: '#065f46', shadowLine: '#f0fdf4', nodeFill: '#ffffff', nodeBorder: '#022c22', ring: '#047857' }
            },
            pieces: {
                red_black: {
                    p1: { top: '#f87171', mid: '#dc2626', dark: '#991b1b', highlight: '#fca5a5' },
                    p2: { top: '#38bdf8', mid: '#0284c7', dark: '#0369a1', highlight: '#bae6fd' }
                },
                gold_silver: {
                    p1: { top: '#facc15', mid: '#ca8a04', dark: '#854d0e', highlight: '#fef08a' },
                    p2: { top: '#94a3b8', mid: '#64748b', dark: '#334155', highlight: '#cbd5e1' }
                },
                crimson_teal: {
                    p1: { top: '#fb7185', mid: '#e11d48', dark: '#9f1239', highlight: '#fecdd3' },
                    p2: { top: '#2dd4bf', mid: '#0d9488', dark: '#115e59', highlight: '#99f6e4' }
                },
                emerald_obsidian: {
                    p1: { top: '#34d399', mid: '#059669', dark: '#065f46', highlight: '#a7f3d0' },
                    p2: { top: '#818cf8', mid: '#4f46e5', dark: '#3730a3', highlight: '#c7d2fe' }
                }
            }
        };

        const I18N = {
            hi: {
                title: "GUTIKA (18 गुटी)",
                subtitle: "पारंपरिक भारतीय रणनीति खेल",
                changeMode: "मोड बदलें",
                turnYou: "आपकी चाल (लाल)",
                turnComputer: "कंप्यूटर सोच रहा है...",
                turnP1: "खिलाड़ी 1 की चाल (लाल)",
                turnP2: "खिलाड़ी 2 की चाल (नीली)",
                you: "आप (You)",
                computer: "कंप्यूटर (Computer)",
                p1Default: "खिलाड़ी 1",
                p2Default: "खिलाड़ी 2",
                winTitleCongrats: "बधाई हो! आप जीत गए 🎉",
                winTitleLoss: "आप हार गए (You Lost) 💔",
                winTitleP1: "खिलाड़ी 1 की जीत!",
                winTitleP2: "खिलाड़ी 2 की जीत!",
                statusWinPieces: "{winner} ने सभी गोटियाँ काटकर जीत हासिल की!",
                statusWinMoves: "{winner} ने प्रतिद्वंद्वी को पूरी तरह ब्लॉक करके जीत लिया!",
                btnRestart: "नया गेम",
                btnUndo: "Undo",
                btnFinish: "बारी समाप्त",
                statusGameOver: "खेल समाप्त!",
                yourTurnStatus: "आपकी चाल",
                opponentTurnStatus: "प्रतिद्वंद्वी की चाल...",
                vsComputer: "Vs Computer (कंप्यूटर)",
                twoPlayersOffline: "2 Players Pass & Play (ऑफलाइन)",
                onlineMultiplayer: "Online Multiplayer (ऑनलाइन)",
                changeName: "नाम बदलें / Login",
                subTitleDesc: "पारंपरिक भारतीय रणनीति खेल",
                turnBadge: "चाल",
                loginStatsBtn: "प्रोफ़ाइल / Login",
                sendBtn: "भेजें",
                nicknameLabel: "आपका नाम (Login User ID / Nickname):",
                statsLabel: "आपका रिकॉर्ड (Player Stats):",
                statPlayed: "कुल खेल",
                statWins: "कुल जीत",
                statLosses: "कुल हार",
                saveProfileBtn: "सेव लॉगिन",
                onlinePlayTitle: "ऑनलाइन मल्टीप्लेयर (Online Play)",
                onlineDesc: "दोस्त के साथ ऑनलाइन 18-गुटी खेलें। नया रूम बनाएं या रूम कोड डालकर जुड़ें:",
                createRoomBtn: "नया रूम बनाएं (Create Room)",
                randomMatchBtn: "Random Player खोजें",
                orDivider: "या फिर",
                joinRoomBtn: "जुड़ें (Join)",
                waitingOpponent: "दूसरे खिलाड़ी का इंतज़ार है...",
                shareRoomCode: "आपका रूम कोड (Share this code):",
                cancelBtn: "रद्द करें (Cancel)",
                moveLogTitle: "चाल रिकॉर्ड (Move Log)",
                noMovesYet: "कोई चाल रिकॉर्ड नहीं हुई है",
                settingsTitle: "गेम सेटिंग्स (Settings)",
                gameModeLabel: "गेम मोड (Game Mode)",
                aiDiffLabel: "AI कठिनाई (AI Difficulty)",
                boardThemeLabel: "बोर्ड थीम (Board Theme)",
                pieceColorsLabel: "गोटियों का रंग (Piece Colors)",
                pieceStyleLabel: "गोटी का आकार (Piece View Style)",
                applySettingsBtn: "सेटिंग्स लागू करें (Apply Settings)",
                gotItBtn: "समझ गया (Got It)",
                homeBtn: "होम (Home)",
                newGameBtn: "नया गेम",
                challengeTeaser: "जीत हासिल करके और कॉइन्स कमाएं। जल्द आ रहे हैं दैनिक चैलेंजेस और रिवॉर्ड्स!",
                rulesText: `<b>18 गुटी (Gutika) खेल के मुख्य नियम:</b><br/>
                1. <b>कुल गोटियाँ:</b> खेल में दोनों खिलाड़ियों की 18-18 गोटियाँ बोर्ड पर रखी होती हैं।<br/>
                2. <b>गोटी चाल:</b> प्रत्येक खिलाड़ी अपनी बारी में अपनी एक गोटी को संलग्न खाली स्थान पर चला सकता है।<br/>
                3. <b>गोटी काटना:</b> प्रतिद्वंद्वी की गोटी के ऊपर से कूदकर उसके ठीक पीछे वाले खाली बिंदु पर पहुँचकर गोटी काटी जाती है।<br/>
                4. <b>Multi-Capture:</b> गोटी काटने के बाद यदि आगे और कूदने का मौका हो, तो लगातार गोटियाँ काट सकते हैं।<br/>
                5. <b>जीत:</b> प्रतिद्वंद्वी की सभी गोटियाँ समाप्त करने या ब्लॉक करने पर जीत होती है।`
            },
            en: {
                title: "GUTIKA (18 Guti)",
                subtitle: "Traditional Strategy Board Game",
                changeMode: "Change Mode",
                turnYou: "Your Turn (Red)",
                turnComputer: "Computer is thinking...",
                turnP1: "Player 1's Turn (Red)",
                turnP2: "Player 2's Turn (Blue)",
                you: "You",
                computer: "Computer",
                p1Default: "Player 1",
                p2Default: "Player 2",
                winTitleCongrats: "Congratulations! You Won 🎉",
                winTitleLoss: "You Lost 💔",
                winTitleP1: "Player 1 Victory!",
                winTitleP2: "Player 2 Victory!",
                statusWinPieces: "{winner} won by capturing all enemy pieces!",
                statusWinMoves: "{winner} won by trapping the opponent!",
                btnRestart: "Restart",
                btnUndo: "Undo",
                btnFinish: "Finish Turn",
                statusGameOver: "Game Over!",
                yourTurnStatus: "Your Turn",
                opponentTurnStatus: "Opponent's Turn...",
                vsComputer: "Vs Computer",
                twoPlayersOffline: "2 Players Pass & Play",
                onlineMultiplayer: "Online Multiplayer",
                changeName: "Change Name / Login",
                subTitleDesc: "Traditional Strategy Board Game",
                turnBadge: "TURN",
                loginStatsBtn: "Profile / Stats",
                sendBtn: "Send",
                nicknameLabel: "Your Nickname (Login User ID):",
                statsLabel: "Player Statistics:",
                statPlayed: "Played",
                statWins: "Wins",
                statLosses: "Losses",
                saveProfileBtn: "Save Profile",
                onlinePlayTitle: "Online Multiplayer",
                onlineDesc: "Play 18 Guti online with friends. Create a room or join via code:",
                createRoomBtn: "Create Room",
                randomMatchBtn: "Find Random Player",
                orDivider: "OR",
                joinRoomBtn: "Join",
                waitingOpponent: "Waiting for opponent...",
                shareRoomCode: "Room Code (Share this):",
                cancelBtn: "Cancel",
                moveLogTitle: "Move History Log",
                noMovesYet: "No moves recorded yet",
                settingsTitle: "Game Settings",
                gameModeLabel: "Game Mode",
                aiDiffLabel: "AI Difficulty",
                boardThemeLabel: "Board Theme",
                pieceColorsLabel: "Piece Colors",
                pieceStyleLabel: "Piece View Style",
                applySettingsBtn: "Apply Settings",
                gotItBtn: "Got It",
                homeBtn: "Home",
                newGameBtn: "New Game",
                challengeTeaser: "Earn more coins by winning games. Daily Challenges & Rewards coming soon!",
                rulesText: `<b>18 Guti (Gutika) Rules:</b><br/>
                1. <b>Setup:</b> Each player starts with 18 pieces.<br/>
                2. <b>Movement:</b> Move one piece along valid lines to an adjacent empty node.<br/>
                3. <b>Capture:</b> Jump over an adjacent opponent piece landing directly onto an empty node beyond.<br/>
                4. <b>Multi-Capture:</b> Perform sequential jumps in a single turn if valid jump paths exist.<br/>
                5. <b>Winning:</b> Reduce opponent pieces to 0 or trap them with no legal moves.`
            }
        };

        let canvasWidth = 0;
        let canvasHeight = 0;
        let computedNodes = [];

        // 1. AUTO-OPTIMIZE CANVAS SIZE FOR DEVICE SCREEN & VIEWPORT
        function resizeCanvas() {
            if (!CANVAS) return;
            const container = document.getElementById('board-box');
            if (!container) return;
            
            const rect = container.getBoundingClientRect();
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            
            canvasWidth = rect.width;
            canvasHeight = rect.height;

            CANVAS.width = Math.round(canvasWidth * dpr);
            CANVAS.height = Math.round(canvasHeight * dpr);
            CTX.setTransform(dpr, 0, 0, dpr, 0, 0);

            const baseRadius = Math.min(canvasWidth * 0.026, canvasHeight * 0.024);
            const sidePad = baseRadius * 1.2;
            const topPad = baseRadius * 2.8;
            const bottomPad = baseRadius * 1.3;
            const minX = 0.16, maxX = 0.84, minY = 0.05, maxY = 0.95;
            const safeW = Math.max(1, canvasWidth - sidePad * 2);
            const safeH = Math.max(1, canvasHeight - topPad - bottomPad);
            
            computedNodes = NODES_DEF.map(n => ({
                x: sidePad + ((n.x - minX) / (maxX - minX)) * safeW,
                y: topPad + ((n.y - minY) / (maxY - minY)) * safeH,
                radius: baseRadius
            }));

            render();
        }

        function initGame(randomTurn = true) {
            gameState.board = new Array(37).fill(null);
            
            for (let i = 0; i < 18; i++) gameState.board[i] = 'P2';
            for (let i = 19; i < 37; i++) gameState.board[i] = 'P1';

            onlineState.lastAlertTurnKey = null;
            gameState.turn = randomTurn ? (Math.random() < 0.5 ? 'P1' : 'P2') : 'P1';
            gameState.selectedNode = null;
            gameState.legalMoves = [];
            gameState.multiCaptureActive = false;
            gameState.p1Count = 18;
            gameState.p2Count = 18;
            gameState.gameOver = false;
            gameState.history = [];
            gameState.moveLogs = [];

            updateMoveLogUI();
            updateUI();
            startTimer();

            if (!computedNodes || computedNodes.length === 0) {
                resizeCanvas();
            } else {
                render();
            }

            if (config.mode === 'ai' && gameState.turn === 'P2') {
                setTimeout(makeAiMove, 600);
            }
        }

        function startTimer() {
            stopTimer();
            gameState.elapsedSeconds = 0;
            gameState.timerInterval = setInterval(() => {
                if (gameState.gameOver) return;
                gameState.elapsedSeconds++;
            }, 1000);
        }

        const TURN_LIMIT_MS = 120000;
        function isMyTurn() {
            return config.mode === 'online' ? gameState.turn === onlineState.role :
                   config.mode === 'ai' ? gameState.turn === 'P1' : true;
        }
        function notifyTurnIfNeeded() {
            if (gameState.gameOver || !isMyTurn()) return;
            const key = config.mode === 'online'
                ? `${onlineState.roomCode}:${gameState.turn}:${onlineState.turnDeadline}`
                : `${config.mode}:${gameState.turn}:${gameState.moveLogs.length}`;
            if (onlineState.lastAlertTurnKey === key) return;
            onlineState.lastAlertTurnKey = key;
            const el = document.getElementById('gotix-turn-alert');
            if (el) {
                el.textContent = config.lang === 'hi' ? 'आपकी चाल है!' : 'YOUR TURN!';
                el.classList.remove('gotix-alert-pop');
                void el.offsetWidth;
                el.classList.add('gotix-alert-pop');
            }
            audio.playBeep(820, 'sine', .13, .13);
            setTimeout(() => audio.playBeep(1060, 'sine', .16, .11), 160);
        }
        function updateTurnWarnings() {
            const warning = document.getElementById('gotix-countdown-warning');
            const indicator = document.getElementById('gotix-timeout-count');
            if (indicator) {
                const ownRole = config.mode === 'online' ? onlineState.role : gameState.turn;
                const count = onlineState.timeoutCounts[ownRole] || 0;
                indicator.textContent = config.mode === 'online' ?
                    (config.lang === 'hi' ? `समय चेतावनी: ${count}/3` : `Timeouts: ${count}/3`) : '';
            }
            if (!warning) return;
            const show = config.mode === 'online' && !gameState.gameOver && isMyTurn() && onlineState.moveTimer <= 10 && onlineState.moveTimer > 0;
            warning.classList.toggle('hidden', !show);
            warning.classList.toggle('gotix-countdown-urgent', show && onlineState.moveTimer <= 5);
            if (show) warning.textContent = config.lang === 'hi' ? `जल्दी चाल चलें! ${onlineState.moveTimer}` : `PLAY NOW! ${onlineState.moveTimer}`;
            if (show && onlineState.lastTickSecond !== onlineState.moveTimer) {
                onlineState.lastTickSecond = onlineState.moveTimer;
                audio.playBeep(onlineState.moveTimer <= 5 ? 1040 : 720, 'square', .075, .09);
            }
        }
        function startOnlineTurnTimer() {
            if (onlineState.turnInterval) clearInterval(onlineState.turnInterval);
            if (onlineState.syncInterval) clearInterval(onlineState.syncInterval);
            if (config.mode !== 'online' || gameState.gameOver) return;
            onlineState.syncInterval = null;
            onlineState.turnInterval = setInterval(() => {
                if (gameState.gameOver || config.mode !== 'online') return;
                if (onlineState.turnDeadline) {
                    onlineState.moveTimer = Math.max(0, Math.ceil((onlineState.turnDeadline - Date.now()) / 1000));
                    if (onlineState.moveTimer === 0) void resolveOnlineTimeout();
                }
                updateUI();
                updateTurnWarnings();
            }, 250);
        }
        async function resolveOnlineTimeout() {
            if (onlineState.resolvingTimeout || !onlineState.roomRef || !onlineState.turnDeadline || gameState.gameOver) return;
            onlineState.resolvingTimeout = true;
            try {
                const f = window.gutikaFB;
                await f.runTransaction(f.db, async tx => {
                    const snap = await tx.get(onlineState.roomRef);
                    if (!snap.exists()) return;
                    const d = snap.data();
                    if (d.status !== 'playing' || d.gameOver || !d.turnDeadline || Date.now() < d.turnDeadline) return;
                    if (d.turnDeadline !== onlineState.turnDeadline) return;
                    const role = d.turn;
                    const counts = {P1: Number(d.timeoutCounts?.P1 || 0), P2: Number(d.timeoutCounts?.P2 || 0)};
                    counts[role]++;
                    if (counts[role] >= 3) {
                        tx.update(onlineState.roomRef, {status:'finished', gameOver:true,
                            winner: role === 'P1' ? 'P2' : 'P1', finishReason:'timeout',
                            timeoutCounts:counts, turnDeadline:null, updatedAt:Date.now()});
                    } else {
                        tx.update(onlineState.roomRef, {turn: role === 'P1' ? 'P2' : 'P1',
                            timeoutCounts:counts, turnDeadline:Date.now()+TURN_LIMIT_MS,
                            updatedAt:Date.now()});
                    }
                });
            } catch(e) { console.error('Turn timeout sync failed:',e); }
            finally { onlineState.resolvingTimeout = false; }
        }

        function stopTimer() {
            if (gameState.timerInterval) clearInterval(gameState.timerInterval);
            if (onlineState.turnInterval) clearInterval(onlineState.turnInterval);
            if (onlineState.syncInterval) clearInterval(onlineState.syncInterval);
        }

        function getLegalMovesForPiece(fromNode, board, player, captureOnly = false) {
            const moves = [];
            const neighbors = ADJACENCY_LIST[fromNode];
            const enemy = player === 'P1' ? 'P2' : 'P1';

            neighbors.forEach(adj => {
                if (!board[adj] && !captureOnly) {
                    moves.push({ fromNode, targetNode: adj, capturedNode: null });
                } else if (board[adj] === enemy) {
                    const jumpNeighbors = ADJACENCY_LIST[adj];
                    jumpNeighbors.forEach(target => {
                        if (!board[target] && isStraightOrDiagonalLine(fromNode, adj, target)) {
                            moves.push({ fromNode, targetNode: target, capturedNode: adj });
                        }
                    });
                }
            });

            return moves;
        }

        function isStraightOrDiagonalLine(n1, n2, n3) {
            const p1 = NODES_DEF[n1];
            const p2 = NODES_DEF[n2];
            const p3 = NODES_DEF[n3];

            const dx1 = p2.x - p1.x;
            const dy1 = p2.y - p1.y;
            const dx2 = p3.x - p2.x;
            const dy2 = p3.y - p2.y;

            const cross = dx1 * dy2 - dy1 * dx2;
            const dot = dx1 * dx2 + dy1 * dy2;

            return Math.abs(cross) < 0.004 && dot > 0;
        }

        function getAllPlayerMoves(board, player) {
            let moves = [];
            for (let i = 0; i < 37; i++) {
                if (board[i] === player) {
                    moves = moves.concat(getLegalMovesForPiece(i, board, player, false));
                }
            }
            return moves;
        }

        function spawnCaptureBurst(x, y) {
            const layer = document.getElementById('floating-effects-layer');
            if (layer) {
                const el = document.createElement('div');
                el.className = 'floating-capture-text';
                el.style.left = `${x - 20}px`;
                el.style.top = `${y - 20}px`;
                el.innerText = config.lang === 'hi' ? 'कटी! -1' : 'Captured! -1';
                layer.appendChild(el);
                setTimeout(() => el.remove(), 900);
            }
        }

        function spawnVictoryParticles() {
            const colorList = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];
            for (let i = 0; i < 60; i++) {
                particles.push({
                    x: Math.random() * canvasWidth,
                    y: Math.random() * canvasHeight * 0.3,
                    vx: (Math.random() - 0.5) * 6,
                    vy: Math.random() * 3 + 1,
                    radius: Math.random() * 4 + 2,
                    color: colorList[Math.floor(Math.random() * colorList.length)],
                    alpha: 1.0,
                    decay: Math.random() * 0.015 + 0.005
                });
            }
        }

        function render() {
            if (!CTX || !computedNodes || computedNodes.length === 0) return;
            CTX.clearRect(0, 0, canvasWidth, canvasHeight);

            const isFlipped = (config.mode === 'online' && onlineState.role === 'P2');
            
            CTX.save();
            if (isFlipped) {
                CTX.translate(canvasWidth, canvasHeight);
                CTX.rotate(Math.PI);
            }

            const theme = THEMES.boards[config.boardTheme] || THEMES.boards.wooden;

            // Royal-only ambient finish; never modifies geometry or game state.
            if (config.boardTheme === 'royal') {
                const vignette = CTX.createRadialGradient(canvasWidth/2,canvasHeight/2,canvasWidth*.07,canvasWidth/2,canvasHeight/2,canvasWidth*.72);
                vignette.addColorStop(0,'rgba(36,69,111,.12)');
                vignette.addColorStop(1,'rgba(3,9,24,.25)');
                CTX.fillStyle=vignette;
                CTX.fillRect(0,0,canvasWidth,canvasHeight);
            }

            // Render Player Labels
            const topY = computedNodes[1].y - computedNodes[1].radius * 2.2;
            const botY = computedNodes[35].y + computedNodes[35].radius * 2.2;
            
            CTX.font = 'bold 12px Inter, sans-serif';
            CTX.textAlign = 'center';
            CTX.textBaseline = 'middle';

            CTX.fillStyle = gameState.turn === 'P2' ? '#0284c7' : '#94a3b8';
            CTX.fillText(config.mode === 'ai' ? 'PLAYER 2 (AI)' : 'PLAYER 2', canvasWidth * 0.5, topY);

            CTX.fillStyle = gameState.turn === 'P1' ? '#dc2626' : '#94a3b8';
            CTX.fillText(config.mode === 'ai' ? 'PLAYER 1 (YOU)' : 'PLAYER 1', canvasWidth * 0.5, botY);

            // Board Lines
            CTX.lineWidth = Math.max(1.5, canvasWidth * 0.004);
            CTX.strokeStyle = theme.line;
            if (config.boardTheme === 'royal') {
                CTX.shadowColor = 'rgba(244,194,100,.72)';
                CTX.shadowBlur = 7;
            }
            CTX.lineCap = 'round';

            const drawnEdges = new Set();
            for (let u = 0; u < ADJACENCY_LIST.length; u++) {
                for (let v of ADJACENCY_LIST[u]) {
                    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                    if (!drawnEdges.has(key)) {
                        drawnEdges.add(key);
                        const p1 = computedNodes[u];
                        const p2 = computedNodes[v];
                        CTX.beginPath();
                        CTX.moveTo(p1.x, p1.y);
                        CTX.lineTo(p2.x, p2.y);
                        CTX.stroke();
                    }
                }
            }

            CTX.shadowBlur = 0;
            CTX.shadowColor = 'transparent';

            touchRipples.forEach((rip, index) => {
                rip.radius += 1.8;
                rip.alpha -= 0.04;
                if (rip.alpha <= 0) {
                    touchRipples.splice(index, 1);
                } else {
                    CTX.beginPath();
                    CTX.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
                    CTX.strokeStyle = `rgba(217, 119, 6, ${rip.alpha})`;
                    CTX.lineWidth = 2;
                    CTX.stroke();
                }
            });

            // Node Spots
            computedNodes.forEach((node, idx) => {
                const nodeR = node.radius * 0.92;
                const occupant = gameState.board[idx];
                const colors = THEMES.pieces[config.pieceTheme];

                CTX.beginPath();
                CTX.arc(node.x, node.y, nodeR, 0, Math.PI * 2);
                CTX.fillStyle = occupant ? (occupant === 'P1' ? colors.p1.mid : colors.p2.mid) : theme.nodeFill;
                CTX.fill();
                if (occupant && config.boardTheme === 'royal') {
                    CTX.save();
                    CTX.shadowColor = occupant === 'P1' ? '#ef4444' : '#38bdf8';
                    CTX.shadowBlur = 8;
                    CTX.strokeStyle = occupant === 'P1' ? '#ff8b83' : '#7dd3fc';
                    CTX.lineWidth = 1.2;
                    CTX.stroke();
                    CTX.restore();
                }
                CTX.lineWidth = 2;
                CTX.strokeStyle = occupant ? (occupant === 'P1' ? colors.p1.dark : colors.p2.dark) : theme.nodeBorder;
                CTX.stroke();

                if (!occupant) {
                    CTX.beginPath();
                    CTX.arc(node.x, node.y, nodeR * 0.3, 0, Math.PI * 2);
                    CTX.fillStyle = theme.ring;
                    CTX.fill();
                }
            });

            // Moves highlights
            gameState.legalMoves.forEach(m => {
                const node = computedNodes[m.targetNode];
                CTX.beginPath();
                CTX.arc(node.x, node.y, node.radius * 1.05, 0, Math.PI * 2);
                CTX.fillStyle = m.capturedNode !== null ? 'rgba(244, 75, 75, .42)' : 'rgba(46, 230, 153, .32)';
                if (config.boardTheme === 'royal') {
                    CTX.shadowColor = m.capturedNode !== null ? '#fb7185' : '#34d399';
                    CTX.shadowBlur = 13;
                }
                CTX.fill();
                CTX.lineWidth = 2.5;
                CTX.strokeStyle = m.capturedNode !== null ? '#ef4444' : '#22c55e';
                CTX.stroke();
                CTX.shadowBlur = 0;
            });

            if (gameState.selectedNode !== null) {
                const node = computedNodes[gameState.selectedNode];
                CTX.beginPath();
                CTX.arc(node.x, node.y, node.radius * 1.3, 0, Math.PI * 2);
                CTX.fillStyle = gameState.turn === 'P1' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(2, 132, 199, 0.35)';
                CTX.fill();
                CTX.lineWidth = 2;
                CTX.strokeStyle = config.boardTheme === 'royal' ? '#ffe3a0' : (gameState.turn === 'P1' ? '#ef4444' : '#0284c7');
                if (config.boardTheme === 'royal') {
                    const pulse = .5 + .5 * Math.sin(performance.now()/230);
                    CTX.lineWidth = 2 + pulse*1.6;
                    CTX.shadowColor = '#f8cf7e';
                    CTX.shadowBlur = 9 + pulse*10;
                }
                CTX.stroke();
                CTX.shadowBlur = 0;
            }

            const colors = THEMES.pieces[config.pieceTheme];
            gameState.board.forEach((piece, idx) => {
                if (!piece) return;
                if (activeAnimation && activeAnimation.fromNode === idx) return;

                if (config.pieceStyle === 'vertical') {
                    drawUprightVerticalPiece(computedNodes[idx].x, computedNodes[idx].y, computedNodes[idx].radius, piece, colors, isFlipped);
                } else {
                    draw3DPiece(computedNodes[idx].x, computedNodes[idx].y, computedNodes[idx].radius, piece, colors);
                }
            });

            if (activeAnimation) {
                activeAnimation.progress += 0.09;
                if (activeAnimation.progress >= 1) activeAnimation.progress = 1;
                
                const curX = activeAnimation.startPos.x + (activeAnimation.endPos.x - activeAnimation.startPos.x) * activeAnimation.progress;
                const curY = activeAnimation.startPos.y + (activeAnimation.endPos.y - activeAnimation.startPos.y) * activeAnimation.progress;
                
                if (config.pieceStyle === 'vertical') {
                    drawUprightVerticalPiece(curX, curY, computedNodes[activeAnimation.fromNode].radius, activeAnimation.piece, colors, isFlipped);
                } else {
                    draw3DPiece(curX, curY, computedNodes[activeAnimation.fromNode].radius, activeAnimation.piece, colors);
                }

                if (activeAnimation.progress >= 1) {
                    const callback = activeAnimation.onComplete;
                    activeAnimation = null;
                    if (callback) callback();
                }
            }

            particles.forEach((p, idx) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.25;
                p.alpha -= p.decay;
                if (p.alpha <= 0) {
                    particles.splice(idx, 1);
                } else {
                    CTX.beginPath();
                    CTX.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    CTX.fillStyle = p.color;
                    CTX.globalAlpha = Math.max(0, p.alpha);
                    CTX.fill();
                    CTX.globalAlpha = 1.0;
                }
            });

            CTX.restore();

            if (activeAnimation || particles.length > 0 || touchRipples.length > 0 || (config.boardTheme === 'royal' && gameState.selectedNode !== null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
                requestAnimationFrame(render);
            }
        }

        function drawUprightVerticalPiece(x, y, r, pieceType, colors, isFlipped) {
            CTX.save();
            if (isFlipped) {
                CTX.translate(x, y);
                CTX.rotate(Math.PI);
                CTX.translate(-x, -y);
            }
            draw3DVerticalPiece(x, y, r, pieceType, colors);
            CTX.restore();
        }

        function draw3DPiece(x, y, r, pieceType, colors) {
            const pal = pieceType === 'P1' ? colors.p1 : colors.p2;

            CTX.beginPath();
            CTX.ellipse(x + 2, y + r * 0.7, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
            CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
            CTX.fill();

            const grad = CTX.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.08, x, y, r * 0.9);
            grad.addColorStop(0, pal.top);
            grad.addColorStop(0.6, pal.mid);
            grad.addColorStop(1, pal.dark);

            CTX.beginPath();
            CTX.arc(x, y, r * 0.88, 0, Math.PI * 2);
            CTX.fillStyle = grad;
            CTX.fill();
            CTX.lineWidth = 1.5;
            CTX.strokeStyle = pal.dark;
            CTX.stroke();
        }

        function draw3DVerticalPiece(x, y, r, pieceType, colors) {
            const pal = pieceType === 'P1' ? colors.p1 : colors.p2;
            const h = r * 2.2;

            CTX.beginPath();
            CTX.ellipse(x + 2, y + r * 0.3, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
            CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
            CTX.fill();

            const baseGrad = CTX.createLinearGradient(x - r, y, x + r, y);
            baseGrad.addColorStop(0, pal.dark);
            baseGrad.addColorStop(0.3, pal.mid);
            baseGrad.addColorStop(0.7, pal.top);
            baseGrad.addColorStop(1, pal.dark);

            CTX.beginPath();
            CTX.ellipse(x, y, r * 0.82, r * 0.35, 0, 0, Math.PI * 2);
            CTX.fillStyle = baseGrad;
            CTX.fill();
            CTX.lineWidth = 1;
            CTX.strokeStyle = pal.dark;
            CTX.stroke();

            const bodyYTop = y - h * 0.55;
            CTX.beginPath();
            CTX.moveTo(x - r * 0.65, y - r * 0.1);
            CTX.quadraticCurveTo(x - r * 0.35, y - h * 0.3, x - r * 0.4, bodyYTop);
            CTX.lineTo(x + r * 0.4, bodyYTop);
            CTX.quadraticCurveTo(x + r * 0.35, y - h * 0.3, x + r * 0.65, y - r * 0.1);
            CTX.closePath();
            
            const bodyGrad = CTX.createLinearGradient(x - r * 0.6, y, x + r * 0.6, y);
            bodyGrad.addColorStop(0, pal.dark);
            bodyGrad.addColorStop(0.4, pal.mid);
            bodyGrad.addColorStop(0.7, pal.top);
            bodyGrad.addColorStop(1, pal.dark);
            CTX.fillStyle = bodyGrad;
            CTX.fill();
            CTX.stroke();

            const headCenterY = bodyYTop - r * 0.48;
            const headR = r * 0.55;

            const headGrad = CTX.createRadialGradient(x - headR * 0.35, headCenterY - headR * 0.35, headR * 0.1, x, headCenterY, headR * 0.95);
            headGrad.addColorStop(0, pal.top);
            headGrad.addColorStop(0.6, pal.mid);
            headGrad.addColorStop(1, pal.dark);

            CTX.beginPath();
            CTX.arc(x, headCenterY, headR, 0, Math.PI * 2);
            CTX.fillStyle = headGrad;
            CTX.fill();
            CTX.stroke();
        }

        function executeMove(fromNode, move) {
            if (config.mode === 'ai' && gameState.turn === 'P1' && !gameState.multiCaptureActive) {
                gameState.history.push(JSON.parse(JSON.stringify({
                    board: gameState.board,
                    turn: gameState.turn,
                    p1Count: gameState.p1Count,
                    p2Count: gameState.p2Count,
                    moveLogs: gameState.moveLogs,
                    elapsedSeconds: gameState.elapsedSeconds
                })));
            }
            const piece = gameState.board[fromNode];

            activeAnimation = {
                piece: piece,
                fromNode: fromNode,
                toNode: move.targetNode,
                startPos: { x: computedNodes[fromNode].x, y: computedNodes[fromNode].y },
                endPos: { x: computedNodes[move.targetNode].x, y: computedNodes[move.targetNode].y },
                progress: 0,
                onComplete: () => finalizeMove(fromNode, move)
            };

            render();
        }

        function finalizeMove(fromNode, move) {
            const playerTag = gameState.turn === 'P1' ? 'P1' : 'P2';
            const actionSymbol = move.capturedNode !== null ? '✕' : '➔';
            const logEntry = `${playerTag}: ${fromNode} ${actionSymbol} ${move.targetNode}`;
            gameState.moveLogs.unshift(logEntry);
            updateMoveLogUI();

            gameState.board[move.targetNode] = gameState.turn;
            gameState.board[fromNode] = null;

            let captured = false;
            if (move.capturedNode !== null) {
                const capNode = move.capturedNode;
                gameState.board[capNode] = null;
                if (gameState.turn === 'P1') gameState.p2Count--;
                else gameState.p1Count--;
                captured = true;

                spawnCaptureBurst(computedNodes[capNode].x, computedNodes[capNode].y);
                audio.playCapture(config.mode === 'online' ? gameState.turn === onlineState.role : (config.mode === 'ai' ? gameState.turn === 'P1' : true));
            } else {
                audio.playMove();
            }

            if (checkWin()) { 
                if (config.mode === 'online') publishOnlineState(); 
                return; 
            }

            if (captured) {
                const furtherCaptures = getLegalMovesForPiece(move.targetNode, gameState.board, gameState.turn, true);
                if (furtherCaptures.length > 0) {
                    gameState.multiCaptureActive = true;
                    gameState.selectedNode = move.targetNode;
                    gameState.legalMoves = furtherCaptures;
                    if (config.mode === 'online') publishOnlineState();
                    updateUI();
                    render();

                    if (config.mode === 'ai' && gameState.turn === 'P2') {
                        setTimeout(() => {
                            if (!gameState.multiCaptureActive || gameState.gameOver) return;
                            const options = gameState.legalMoves;
                            if (options.length) {
                                const next = options[Math.floor(Math.random() * options.length)];
                                executeMove(gameState.selectedNode, next);
                            }
                        }, 350);
                    }
                    return;
                }
            }

            endTurn();
        }

        function endTurn() {
            gameState.multiCaptureActive = false;
            gameState.selectedNode = null;
            gameState.legalMoves = [];

            gameState.turn = gameState.turn === 'P1' ? 'P2' : 'P1';

            if (checkWin()) return;

            updateUI();
            render();
            if (config.mode !== 'online') notifyTurnIfNeeded();
            
            if (config.mode === 'online') {
                onlineState.turnDeadline = Date.now() + TURN_LIMIT_MS;
                onlineState.lastTickSecond = null;
                startOnlineTurnTimer();
                publishOnlineState();
            }

            if (config.mode === 'ai' && gameState.turn === 'P2') {
                setTimeout(makeAiMove, 500);
            }
        }

        function checkWin() {
            if (gameState.p2Count === 0) {
                triggerWin('P1', 'pieces');
                return true;
            }
            if (gameState.p1Count === 0) {
                triggerWin('P2', 'pieces');
                return true;
            }

            const p1Moves = getAllPlayerMoves(gameState.board, 'P1');
            const p2Moves = getAllPlayerMoves(gameState.board, 'P2');

            if (gameState.turn === 'P1' && p1Moves.length === 0) {
                triggerWin('P2', 'moves');
                return true;
            }
            if (gameState.turn === 'P2' && p2Moves.length === 0) {
                triggerWin('P1', 'moves');
                return true;
            }

            return false;
        }

        // 2. WINNER CONGRATS & LOSER YOU LOST CUSTOM MESSAGES & STATS UPDATING
        function triggerWin(winner, type) {
            if (gameState.gameOver && document.getElementById('modal-win').classList.contains('hidden') === false) return;
            gameState.gameOver = true;
            stopTimer();

            userStats.played++;

            let isUserWinner = false;
            if (config.mode === 'ai') {
                isUserWinner = (winner === 'P1');
            } else if (config.mode === 'online') {
                isUserWinner = (winner === onlineState.role);
            } else {
                isUserWinner = (winner === 'P1');
            }

            if (isUserWinner) {
                userStats.wins++;
                userStats.coins += 50;
                userStats.xp += 25;
                audio.playWin();
                spawnVictoryParticles();
            } else {
                userStats.losses++;
                userStats.coins = Math.max(0, userStats.coins - 10);
                audio.playLoss();
            }

            localStorage.setItem('gutika_stats', JSON.stringify(userStats));
            void saveCloudProfile();
            updateProfileModalUI();

            const lang = I18N[config.lang];
            const modal = document.getElementById('modal-win');
            const iconWrapper = document.getElementById('win-icon-wrapper');
            const iconEl = document.getElementById('win-icon');
            const winTitleEl = document.getElementById('win-title');
            const winSubtitleEl = document.getElementById('win-subtitle');
            const winCardBox = document.getElementById('win-card-box');

            if (config.mode === 'pvp') {
                const winnerName = winner === 'P1' ? (config.username || 'Player 1') : (config.p2Name || 'Player 2');
                winTitleEl.innerText = winner === 'P1' ? lang.winTitleP1 : lang.winTitleP2;
                winSubtitleEl.innerText = type === 'pieces' 
                    ? lang.statusWinPieces.replace('{winner}', winnerName)
                    : lang.statusWinMoves.replace('{winner}', winnerName);
                iconWrapper.className = "w-16 h-16 mx-auto mb-3 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-amber-600 text-3xl";
                iconEl.className = "fa-solid fa-trophy";
            } else if (isUserWinner) {
                winTitleEl.innerText = lang.winTitleCongrats;
                winSubtitleEl.innerText = config.lang === 'hi' 
                    ? "शानदार रणनीति! आपने प्रतिद्वंद्वी को हराकर विजय प्राप्त की। (+50 Coins 🪙)" 
                    : "Outstanding Strategy! You defeated your opponent. (+50 Coins 🪙)";
                iconWrapper.className = "w-16 h-16 mx-auto mb-3 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-amber-600 text-3xl animate-bounce";
                iconEl.className = "fa-solid fa-crown text-amber-500";
                winCardBox.className = "bg-white border-2 border-amber-500 rounded-3xl max-w-sm w-full p-6 text-center text-slate-800 shadow-2xl relative overflow-hidden animate-fade-in";
            } else {
                winTitleEl.innerText = lang.winTitleLoss;
                winSubtitleEl.innerText = config.lang === 'hi' 
                    ? "आप यह मुकाबला हार गए। निराश न हों, अगली बार बेहतर प्रयास करें!" 
                    : "You lost this match. Don't give up, try again!";
                iconWrapper.className = "w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center text-red-600 text-3xl";
                iconEl.className = "fa-solid fa-face-frown text-red-500";
                winCardBox.className = "bg-white border-2 border-red-500 rounded-3xl max-w-sm w-full p-6 text-center text-slate-800 shadow-2xl relative overflow-hidden animate-fade-in";
            }

            modal.classList.remove('hidden');
            updateUI();
            render();
        }

        // 3. IN-GAME TOAST CHAT NOTIFICATIONS (REPLACES SEPARATE MODAL WINDOW)
        function showChatToastNotification(senderName, messageText) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            audio.playBeep(880, 'sine', 0.15, 0.15);

            const toast = document.createElement('div');
            toast.className = 'chat-toast bg-slate-900/90 text-white border border-amber-500/60 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3 pointer-events-auto';
            toast.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center font-bold text-xs text-white shadow flex-shrink-0">
                    <i class="fa-solid fa-comment-dots"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <span class="block text-[10px] text-amber-400 font-bold leading-tight truncate">${senderName}</span>
                    <p class="text-xs text-slate-100 font-medium leading-normal break-words">${messageText}</p>
                </div>
            `;
            container.appendChild(toast);

            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 3900);
        }

        function updateMoveLogUI() {
            const logList = document.getElementById('log-list');
            const lang = I18N[config.lang];
            if (gameState.moveLogs.length === 0) {
                logList.innerHTML = `<p class="text-slate-400 text-center py-4">${lang.noMovesYet}</p>`;
                return;
            }
            logList.innerHTML = gameState.moveLogs.map(item => `
                <div class="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-slate-800">
                    <span>${item}</span>
                </div>
            `).join('');
        }

        // 4. USER PROFILE & STATISTICS DASHBOARD UI
        function updateProfileModalUI() {
            const lblUsername = document.getElementById('lbl-username');
            if (lblUsername) lblUsername.innerText = config.username;
            
            const inputUsername = document.getElementById('input-username');
            if (inputUsername) inputUsername.value = config.username;
            
            const menuPlayerLbl = document.getElementById('txt-menu-player');
            if (menuPlayerLbl) menuPlayerLbl.innerText = `Player: ${config.username}`;

            const menuPointsLbl = document.getElementById('txt-menu-points');
            if (menuPointsLbl) menuPointsLbl.innerText = `Coins: ${userStats.coins} 🪙`;
            
            const elPlayed = document.getElementById('stat-played');
            if (elPlayed) elPlayed.innerText = userStats.played;
            
            const elWins = document.getElementById('stat-wins');
            if (elWins) elWins.innerText = userStats.wins;
            
            const elLosses = document.getElementById('stat-losses');
            if (elLosses) elLosses.innerText = userStats.losses;

            const elCoins = document.getElementById('stat-coins');
            if (elCoins) elCoins.innerText = userStats.coins;

            const totalWinRate = userStats.played > 0 ? Math.round((userStats.wins / userStats.played) * 100) : 0;
            const elWinRate = document.getElementById('stat-winrate');
            if (elWinRate) elWinRate.innerText = `Win Rate: ${totalWinRate}%`;

            const currentLvl = Math.floor(userStats.xp / 50) + 1;
            const elXp = document.getElementById('stat-xp');
            if (elXp) elXp.innerText = `Lvl ${currentLvl}`;
        }

        function makeAiMove() {
            if (gameState.gameOver || gameState.turn !== 'P2') return;

            let allMoves = getAllPlayerMoves(gameState.board, 'P2');
            if (allMoves.length === 0) return;

            let selectedMove = null;
            if (config.aiDiff === 'easy') {
                selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
            } else if (config.aiDiff === 'medium') {
                let captures = allMoves.filter(m => m.capturedNode !== null);
                selectedMove = captures.length > 0 ? captures[Math.floor(Math.random() * captures.length)] : allMoves[Math.floor(Math.random() * allMoves.length)];
            } else {
                let bestVal = -Infinity;
                allMoves.forEach(move => {
                    let simBoard = [...gameState.board];
                    simBoard[move.targetNode] = 'P2';
                    simBoard[move.fromNode] = null;
                    if (move.capturedNode !== null) simBoard[move.capturedNode] = null;

                    let val = minimax(simBoard, 3, -Infinity, Infinity, false);
                    if (val > bestVal) {
                        bestVal = val;
                        selectedMove = move;
                    }
                });
            }
            if (!selectedMove) selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
            executeMove(selectedMove.fromNode, selectedMove);
        }

        function evaluateBoard(board) {
            let p1Count = 0, p2Count = 0;
            for (let i = 0; i < 37; i++) {
                if (board[i] === 'P1') p1Count++;
                else if (board[i] === 'P2') p2Count++;
            }
            return p2Count - p1Count;
        }

        function minimax(board, depth, alpha, beta, isMax) {
            if (depth === 0) return evaluateBoard(board);
            if (isMax) {
                let maxEval = -Infinity;
                let moves = getAllPlayerMoves(board, 'P2');
                if (moves.length === 0) return -1000;
                for (let move of moves) {
                    let simBoard = [...board];
                    simBoard[move.targetNode] = 'P2';
                    simBoard[move.fromNode] = null;
                    if (move.capturedNode !== null) simBoard[move.capturedNode] = null;
                    let evalVal = minimax(simBoard, depth - 1, alpha, beta, false);
                    maxEval = Math.max(maxEval, evalVal);
                    alpha = Math.max(alpha, evalVal);
                    if (beta <= alpha) break;
                }
                return maxEval;
            } else {
                let minEval = Infinity;
                let moves = getAllPlayerMoves(board, 'P1');
                if (moves.length === 0) return 1000;
                for (let move of moves) {
                    let simBoard = [...board];
                    simBoard[move.targetNode] = 'P1';
                    simBoard[move.fromNode] = null;
                    if (move.capturedNode !== null) simBoard[move.capturedNode] = null;
                    let evalVal = minimax(simBoard, depth - 1, alpha, beta, true);
                    minEval = Math.min(minEval, evalVal);
                    beta = Math.min(beta, evalVal);
                    if (beta <= alpha) break;
                }
                return minEval;
            }
        }

        function handleInput(clientX, clientY) {
            if (gameState.gameOver || activeAnimation) return;
            if (config.mode === 'ai' && gameState.turn !== 'P1') return;
            if (config.mode === 'online' && (!onlineState.startedLocally || gameState.turn !== onlineState.role)) return;

            const rect = CANVAS.getBoundingClientRect();
            let x = clientX - rect.left;
            let y = clientY - rect.top;

            if (config.mode === 'online' && onlineState.role === 'P2') {
                x = canvasWidth - x;
                y = canvasHeight - y;
            }

            touchRipples.push({ x: x, y: y, radius: 2, alpha: 0.8 });

            let touchedIdx = null;
            let minDist = Infinity;

            computedNodes.forEach((node, idx) => {
                const d = Math.hypot(node.x - x, node.y - y);
                const hitRadius = Math.max(node.radius * 2.2, 24);
                if (d <= hitRadius && d < minDist) {
                    minDist = d;
                    touchedIdx = idx;
                }
            });

            if (touchedIdx === null) {
                render();
                return;
            }

            const touchedPiece = gameState.board[touchedIdx];

            if (gameState.multiCaptureActive) {
                const move = gameState.legalMoves.find(m => m.targetNode === touchedIdx);
                if (move) executeMove(gameState.selectedNode, move);
                return;
            }

            if (touchedPiece === gameState.turn) {
                gameState.selectedNode = touchedIdx;
                gameState.legalMoves = getLegalMovesForPiece(touchedIdx, gameState.board, gameState.turn, false);
                audio.playSelect();
                render();
                return;
            }

            if (gameState.selectedNode !== null) {
                const move = gameState.legalMoves.find(m => m.targetNode === touchedIdx);
                if (move) executeMove(gameState.selectedNode, move);
            }
        }

        function updateUI() {
            const lang = I18N[config.lang];

            document.getElementById('count-p1').innerText = gameState.p1Count;
            document.getElementById('count-p2').innerText = gameState.p2Count;

            document.getElementById('lost-p1').innerText = `(${config.lang === 'hi' ? 'कटी' : 'Captured'}: ${18 - gameState.p1Count})`;
            document.getElementById('lost-p2').innerText = `(${config.lang === 'hi' ? 'कटी' : 'Captured'}: ${18 - gameState.p2Count})`;

            const p1Label = document.getElementById('lbl-p1-name');
            const p2Label = document.getElementById('lbl-p2-name');

            if (config.mode === 'ai') {
                p1Label.innerText = config.username + ` (${lang.you})`;
                p2Label.innerText = lang.computer;
                document.getElementById('inline-chat-bar').classList.add('hidden');
                document.getElementById('gotix-chat-wrap').classList.add('hidden');
            } else if (config.mode === 'online') {
                p1Label.innerText = onlineState.role === 'P1' ? `${config.p1Name || config.username} (${lang.you})` : (config.p1Name || 'Player 1');
                p2Label.innerText = onlineState.role === 'P2' ? `${config.p2Name || config.username} (${lang.you})` : (config.p2Name || 'Player 2');
                document.getElementById('gotix-chat-wrap').classList.remove('hidden');
                document.getElementById('inline-chat-bar').classList.toggle('hidden', !gotixChatOpen);
                document.getElementById('inline-chat-bar').classList.toggle('flex', gotixChatOpen);
            } else {
                p1Label.innerText = config.username;
                p2Label.innerText = lang.p2Default;
                document.getElementById('inline-chat-bar').classList.add('hidden');
                document.getElementById('gotix-chat-wrap').classList.add('hidden');
            }

            const cardP1 = document.getElementById('card-p1');
            const cardP2 = document.getElementById('card-p2');
            const badgeP1 = document.getElementById('badge-p1');
            const badgeP2 = document.getElementById('badge-p2');

            cardP1.classList.remove('opacity-60');
            cardP2.classList.remove('opacity-60');
            if (gameState.turn === 'P1') {
                cardP2.classList.add('opacity-60');
                badgeP1.classList.remove('hidden');
                badgeP2.classList.add('hidden');
            } else {
                cardP1.classList.add('opacity-60');
                badgeP2.classList.remove('hidden');
                badgeP1.classList.add('hidden');
            }

            // Place actual player cards on opposite sides of the canvas.
            // Online role is fixed per device; pass-and-play follows the current turn.
            const myRole = config.mode === 'online' ? (onlineState.role || 'P1') :
                config.mode === 'ai' ? 'P1' : gameState.turn;
            const opponentCard = myRole === 'P1' ? cardP2 : cardP1;
            const selfCard = myRole === 'P1' ? cardP1 : cardP2;
            const opponentSlot = document.getElementById('gotix-opponent-slot');
            const selfSlot = document.getElementById('gotix-self-slot');
            if (opponentSlot && opponentCard.parentElement !== opponentSlot) opponentSlot.appendChild(opponentCard);
            if (selfSlot && selfCard.parentElement !== selfSlot) selfSlot.appendChild(selfCard);
            opponentCard.classList.remove('gotix-my-card');
            selfCard.classList.add('gotix-my-card');
            updateTurnWarnings();
            const statusMsg = document.getElementById('status-message');
            if (gameState.gameOver) {
                statusMsg.innerText = lang.statusGameOver;
            } else if (config.mode === 'online') {
                const mins = String(Math.floor(onlineState.moveTimer / 60)).padStart(2, '0');
                const secs = String(onlineState.moveTimer % 60).padStart(2, '0');
                const timerText = ` ⏳ (${mins}:${secs})`;

                if (gameState.turn === onlineState.role) {
                    statusMsg.innerText = lang.yourTurnStatus + timerText;
                } else {
                    statusMsg.innerText = lang.opponentTurnStatus + timerText;
                }
            } else if (gameState.turn === 'P1') {
                statusMsg.innerText = config.mode === 'ai' ? lang.turnYou : lang.turnP1;
            } else {
                statusMsg.innerText = config.mode === 'ai' ? lang.turnComputer : lang.turnP2;
            }

            const btnFinish = document.getElementById('btn-finish-multi');
            if (gameState.multiCaptureActive) {
                btnFinish.classList.remove('hidden');
            } else {
                btnFinish.classList.add('hidden');
            }

            const btnUndo = document.getElementById('btn-undo');
            btnUndo.disabled = (config.mode !== 'ai' || gameState.history.length === 0 || gameState.turn === 'P2');
        }

        function applyLanguage() {
            const lang = I18N[config.lang];
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (lang[key]) el.innerText = lang[key];
            });

            document.getElementById('txt-app-title').innerText = config.lang === 'hi' ? "GUTIKA (18 गुटी)" : "GUTIKA (18 Guti)";
            document.getElementById('txt-app-subtitle').innerText = lang.subtitle;
            document.getElementById('txt-btn-undo').innerText = lang.btnUndo;
            document.getElementById('txt-btn-finish').innerText = lang.btnFinish;
            document.getElementById('txt-btn-restart').innerText = lang.btnRestart;
            
            updateUI();
            updateMoveLogUI();
            updateProfileModalUI();
        }

        const btnStartHi = document.getElementById('start-lang-hi');
        const btnStartEn = document.getElementById('start-lang-en');

        btnStartHi.addEventListener('click', () => {
            audio.playSelect();
            config.lang = 'hi';
            btnStartHi.className = "px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-600 text-white shadow";
            btnStartEn.className = "px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 hover:text-amber-900";
            applyLanguage();
        });

        btnStartEn.addEventListener('click', () => {
            audio.playSelect();
            config.lang = 'en';
            btnStartEn.className = "px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-600 text-white shadow";
            btnStartHi.className = "px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 hover:text-amber-900";
            applyLanguage();
        });

        window.addEventListener('resize', resizeCanvas);
        if (window.ResizeObserver) {
            const boardObserver = new ResizeObserver(() => {
                if (CANVAS && CTX) resizeCanvas();
            });
            boardObserver.observe(document.getElementById('board-box'));
        }
        
        function initCanvasListeners() {
            if (!CANVAS) return;
            CANVAS.addEventListener('pointerdown', e => {
                e.preventDefault();
                handleInput(e.clientX, e.clientY);
            }, { passive: false });
        }

        document.getElementById('btn-finish-multi').addEventListener('click', () => {
            if (!gameState.multiCaptureActive || gameState.gameOver) return;
            audio.playSelect();
            endTurn();
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            audio.playSelect();
            initGame(true);
        });

        document.getElementById('btn-play-again').addEventListener('click', () => {
            audio.playSelect();
            document.getElementById('modal-win').classList.add('hidden');
            initGame(true);
        });

        document.getElementById('btn-win-home').addEventListener('click', async () => {
            if (config.mode === 'online') await leaveOnlineRoom(false);
            audio.playSelect();
            document.getElementById('modal-win').classList.add('hidden');
            document.getElementById('modal-start-menu').classList.remove('hidden');
        });

        document.getElementById('btn-exit-game').addEventListener('click', async () => {
            audio.playSelect();
            const activeMatch = !gameState.gameOver &&
                (config.mode !== 'online' || onlineState.startedLocally);
            const warning = activeMatch
                ? 'मैच छोड़ने पर आपकी हार दर्ज होगी। क्या आप सचमुच Exit करना चाहते हैं?\n\nLeaving now will count as a loss. Exit?'
                : 'क्या आप गेम से बाहर निकलना चाहते हैं? / Exit game?';
            if (!window.confirm(warning)) return;
            if (config.mode === 'online') {
                if (!await leaveOnlineRoom(true)) return;
            } else if (activeMatch) {
                // End the local match before returning to the menu.
                gameState.gameOver = true;
                stopTimer();
            }
            document.getElementById('modal-online').classList.add('hidden');
            document.getElementById('modal-start-menu').classList.remove('hidden');
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            if (config.mode === 'ai' && gameState.history.length > 0) {
                audio.playSelect();
                const last = gameState.history.pop();
                gameState.board = last.board;
                gameState.turn = last.turn;
                gameState.p1Count = last.p1Count;
                gameState.p2Count = last.p2Count;
                gameState.moveLogs = last.moveLogs || [];
                gameState.elapsedSeconds = last.elapsedSeconds || 0;
                gameState.gameOver = false;
                gameState.multiCaptureActive = false;
                gameState.selectedNode = null;
                gameState.legalMoves = [];
                if (activeAnimation) activeAnimation = null;
                document.getElementById('modal-win').classList.add('hidden');
                updateMoveLogUI();
                updateUI();
                render();
            }
        });

        const startMenuModal = document.getElementById('modal-start-menu');
        const profileModal = document.getElementById('modal-profile');
        const onlineModal = document.getElementById('modal-online');
        const settingsModal = document.getElementById('modal-settings');
        const rulesModal = document.getElementById('modal-rules');
        const logModal = document.getElementById('modal-log');

        // Compact online chat: keep existing Firestore chatMessages format intact.
        let gotixChatOpen = false;
        let gotixChatUnread = 0;
        const gotixChatToggle = document.getElementById('gotix-chat-toggle');
        const gotixChatPanel = document.getElementById('gotix-chat-panel');
        const gotixChatHistory = document.getElementById('gotix-chat-history');
        function refreshGotixChat() {
            const messages = (onlineState.chatMessages || []).slice(-40);
            gotixChatHistory.replaceChildren();
            for (const msg of messages) {
                if (!msg || typeof msg.text !== 'string') continue;
                const line = document.createElement('div');
                line.className = 'gotix-chat-message' + (msg.sender === config.username ? ' mine' : '');
                const who = document.createElement('strong');
                who.textContent = msg.sender === config.username ? 'You' : (msg.sender || 'Opponent');
                const body = document.createElement('span');
                body.textContent = msg.text;
                line.append(who, body);
                gotixChatHistory.appendChild(line);
            }
            gotixChatHistory.scrollTop = gotixChatHistory.scrollHeight;
            const badge = document.getElementById('gotix-chat-unread');
            badge.textContent = String(gotixChatUnread);
            badge.classList.toggle('hidden', gotixChatUnread === 0);
        }
        gotixChatToggle.addEventListener('click', () => {
            gotixChatOpen = !gotixChatOpen;
            gotixChatPanel.classList.toggle('hidden', !gotixChatOpen);
            gotixChatToggle.setAttribute('aria-expanded', String(gotixChatOpen));
            document.getElementById('inline-chat-bar').classList.toggle('hidden', !gotixChatOpen);
            document.getElementById('inline-chat-bar').classList.toggle('flex', gotixChatOpen);
            if (gotixChatOpen) gotixChatUnread = 0;
            refreshGotixChat();
        });
        document.querySelectorAll('[data-gotix-quick]').forEach(button => {
            button.addEventListener('click', () => {
                document.getElementById('input-online-chat').value = button.dataset.gotixQuick;
                sendOnlineChatMessage();
            });
        });

        // Inline Fast Online Chat Event
        async function sendOnlineChatMessage() {
            const input = document.getElementById('input-online-chat');
            const text = input.value.trim();
            if (!text || !onlineState.roomRef || !window.gutikaFB) return;
            input.value = '';
            audio.playSelect();

            const msgObj = { sender: config.username, text, time: Date.now() };
            const newMsgs = [...(onlineState.chatMessages || []), msgObj].slice(-40);
            try {
                await window.gutikaFB.setDoc(onlineState.roomRef, { chatMessages: newMsgs }, { merge: true });
                onlineState.chatMessages = newMsgs;
                refreshGotixChat();
            } catch(e) { console.error(e); }
        }

        document.getElementById('btn-send-inline-chat').addEventListener('click', sendOnlineChatMessage);
        document.getElementById('input-online-chat').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendOnlineChatMessage();
        });



        document.querySelectorAll('.btn-diff-choice').forEach(btn => {
            btn.addEventListener('click', (e) => {
                audio.playSelect();
                document.querySelectorAll('.btn-diff-choice').forEach(b => {
                    b.className = "btn-diff-choice px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white border border-amber-300 text-amber-700 hover:border-amber-500";
                });
                e.target.className = "btn-diff-choice px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-600 border border-amber-500 text-white shadow";
                config.aiDiff = e.target.getAttribute('data-diff');
                document.getElementById('select-ai-diff').value = config.aiDiff;
            });
        });

        document.getElementById('btn-start-ai').addEventListener('click', () => {
            audio.playSelect();
            config.mode = 'ai';
            btnAi.click();
            startMenuModal.classList.add('hidden');
            initGame(true);
        });

        document.getElementById('btn-start-pvp').addEventListener('click', () => {
            audio.playSelect();
            config.mode = 'pvp';
            btnPvp.click();
            startMenuModal.classList.add('hidden');
            initGame(true);
        });

        document.getElementById('btn-start-online').addEventListener('click', () => {
            audio.playSelect();
            startMenuModal.classList.add('hidden');
            onlineModal.classList.remove('hidden');
        });

        document.getElementById('btn-user-profile').addEventListener('click', () => {
            audio.playSelect();
            updateProfileModalUI();
            profileModal.classList.remove('hidden');
        });

        document.getElementById('btn-menu-profile').addEventListener('click', () => {
            audio.playSelect();
            updateProfileModalUI();
            profileModal.classList.remove('hidden');
        });

        document.getElementById('btn-close-profile').addEventListener('click', () => profileModal.classList.add('hidden'));

        document.getElementById('btn-save-profile').addEventListener('click', () => {
            const nameInput = document.getElementById('input-username').value.trim();
            if (nameInput) {
                config.username = nameInput;
                localStorage.setItem('gutika_username', config.username);
                void saveCloudProfile();
                updateProfileModalUI();
            }
            profileModal.classList.add('hidden');
        });

        // ---------- GOOGLE LOGIN & CONSERVATIVE CLOUD PROFILE ----------
        function setGoogleStatus(message) {
            const el = document.getElementById('google-login-status');
            if (el) el.textContent = message;
        }
        function updateGoogleIdentity() {
            const user = window.gutikaFB?.auth?.currentUser;
            const button = document.getElementById('btn-google-login');
            const id = document.getElementById('google-player-id');
            const card = document.getElementById('google-account-card');
            const displayName = document.getElementById('google-display-name');
            const email = document.getElementById('google-email');
            const signedIn = Boolean(user && !user.isAnonymous);
            if (button) button.classList.toggle('hidden', signedIn);
            if (card) card.classList.toggle('hidden', !signedIn);
            if (id) id.textContent = signedIn ? `Player ID: GOTIX-${user.uid.slice(0, 12).toUpperCase()} | UID: ${user.uid}` : 'Guest account';
            if (displayName) displayName.textContent = signedIn ? (user.displayName || config.username || 'Player') : '';
            if (email) email.textContent = signedIn ? (user.email || '') : '';
            if (user) setGoogleStatus(signedIn ? 'Google account connected' : 'Guest player (not backed up to Google)');
        }
        async function loadOrCreateCloudProfile() {
            const f = window.gutikaFB;
            const user = f?.auth?.currentUser;
            if (!user || user.isAnonymous) return;
            const ref = f.doc(f.db, 'players', user.uid);
            // Award only once per authenticated UID. A transaction prevents repeated client logins from re-awarding.
            await f.runTransaction(f.db, async tx => {
                const snap = await tx.get(ref);
                const data = snap.exists() ? snap.data() : {};
                if (data.googleWelcomeBonusGranted === true) return;
                const prior = data.stats || { ...userStats };
                const coins = Math.max(0, Number(prior.coins) || 0);
                tx.set(ref, {
                    nickname: data.nickname || config.username,
                    stats: { ...prior, coins: coins + 1000 },
                    googleWelcomeBonusGranted: true,
                    updatedAt: f.serverTimestamp()
                }, { merge: true });
            });
            const snapshot = await f.getDoc(ref);
            const localStats = { ...userStats };
            if (snapshot.exists()) {
                const cloud = snapshot.data();
                // Preserve a separate local backup before restoring an existing cloud profile.
                localStorage.setItem('gutika_pre_google_stats_backup', JSON.stringify(localStats));
                if (cloud.stats) {
                    userStats = { ...userStats, ...cloud.stats };
                    localStorage.setItem('gutika_stats', JSON.stringify(userStats));
                }
                if (cloud.nickname) {
                    config.username = cloud.nickname;
                    localStorage.setItem('gutika_username', config.username);
                }
                setGoogleStatus('Google Login successful. Cloud profile restored.');
            } else {
                await f.setDoc(ref, { nickname: config.username, stats: localStats, createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() });
                setGoogleStatus('Google Login successful. Profile backed up to cloud.');
            }
            updateProfileModalUI();
            updateGoogleIdentity();
        }
        async function saveCloudProfile() {
            const f = window.gutikaFB;
            const user = f?.auth?.currentUser;
            if (!user || user.isAnonymous) return;
            try {
                await f.setDoc(f.doc(f.db, 'players', user.uid), {
                    nickname: config.username, stats: { ...userStats }, updatedAt: f.serverTimestamp()
                }, { merge: true });
            } catch (error) { console.error('Cloud profile save failed:', error); }
        }
        document.getElementById('btn-google-login').addEventListener('click', async () => {
            const btn = document.getElementById('btn-google-login');
            btn.disabled = true;
            setGoogleStatus('Signing in with Google...');
            try {
                if (!await ensureOnlineConnected()) throw new Error('Firebase connection failed');
                await window.gutikaGoogleLogin();
                await loadOrCreateCloudProfile();
                updateGoogleIdentity();
                profileModal.classList.remove('hidden');
                setGoogleStatus('Google Login successful. Cloud profile synchronized.');
            } catch (error) {
                console.error('Google login failed:', error);
                setGoogleStatus(`Login failed: ${error.message || error.code || 'Unknown error'}`);
            } finally { btn.disabled = false; }
        });
        window.addEventListener('gutika-auth-changed', updateGoogleIdentity);

        // ---------- ONLINE MULTIPLAYER ----------
        const FB_CONFIG_KEY = 'gutika_firebase_config_v1';
        const FB_ROOT = ['artifacts', 'gutika-18guti', 'public', 'data', 'rooms'];
        const DEFAULT_FB_CONFIG = {
            apiKey: "AIzaSyDkfrcLBVnBLgPcRXBy8b0jDMJYdAbwUYA",
            authDomain: "goti18.firebaseapp.com",
            projectId: "goti18",
            appId: "1:319122753628:web:7714fb738272b343c27e99"
        };

        function onlineMessage(msg) { const el = document.getElementById('online-status'); if (el) el.textContent = msg; }
        function currentRoomRef(code) { const f = window.gutikaFB; return f.doc(f.db, ...FB_ROOT, code); }
        
        async function ensureOnlineConnected() {
          if (window.gutikaFB && window.gutikaUser) return true;
          let raw = localStorage.getItem(FB_CONFIG_KEY);
          let cfg = raw ? JSON.parse(raw) : DEFAULT_FB_CONFIG;
          if (!window.gutikaFirebaseReady) { onlineMessage('Firebase SDK loading...'); return false; }
          try { 
              await window.connectGutikaFirebase(cfg); 
              onlineState.connected = true; 
              return true; 
          } catch(e) { 
              console.error(e); 
              onlineMessage('Firebase connection error'); 
              return false; 
          }
        }

        function roomPayload(status) { 
            return { 
                status, 
                board: gameState.board, 
                turn: gameState.turn, 
                p1Count: gameState.p1Count, 
                p2Count: gameState.p2Count, 
                gameOver: gameState.gameOver, 
                moveLogs: gameState.moveLogs.slice(0,80), 
                elapsedSeconds: gameState.elapsedSeconds,
                turnDeadline: onlineState.turnDeadline,
                timeoutCounts: onlineState.timeoutCounts,
                chatMessages: onlineState.chatMessages || [],
                updatedAt: Date.now() 
            }; 
        }

        async function publishOnlineState() {
          if (!onlineState.roomRef || !window.gutikaFB) return;
          try { 
              const f = window.gutikaFB;
              await f.runTransaction(f.db, async tx => {
                  const snap = await tx.get(onlineState.roomRef);
                  if (!snap.exists() || snap.data().status !== 'playing' || snap.data().players?.[onlineState.role]?.uid !== window.gutikaUser?.uid) return;
                  tx.update(onlineState.roomRef, roomPayload('playing'));
              }); 
          } catch(e) { console.error(e); }
        }

        function applyOnlineSnapshot(data) {
          if (!data || !data.board) return;
          const previousDeadline = onlineState.turnDeadline;
          const previousTurn = gameState.turn;
          onlineState.turnDeadline = Number(data.turnDeadline || 0) || null;
          onlineState.timeoutCounts = {P1:Number(data.timeoutCounts?.P1 || 0), P2:Number(data.timeoutCounts?.P2 || 0)};
          onlineState.moveTimer = onlineState.turnDeadline ? Math.max(0,Math.ceil((onlineState.turnDeadline-Date.now())/1000)) : 120;
          if (previousDeadline !== onlineState.turnDeadline || previousTurn !== data.turn) onlineState.lastTickSecond = null;
          // Remote capture SFX: detect loss of one of my pieces on an incoming snapshot.
          // Do not replay a locally executed capture or the initial room state.
          const priorMyPieces = onlineState.role === 'P1' ? gameState.p1Count : gameState.p2Count;
          const incomingMyPieces = onlineState.role === 'P1' ? data.p1Count : data.p2Count;
          const remoteCapture = onlineState.startedLocally && !gameState.gameOver &&
              Number.isFinite(priorMyPieces) && Number.isFinite(incomingMyPieces) &&
              incomingMyPieces < priorMyPieces;
          if (remoteCapture) audio.playCapture(false);
          gameState.board = [...data.board]; 
          gameState.turn = data.turn; 
          gameState.p1Count = data.p1Count; 
          gameState.p2Count = data.p2Count;
          gameState.gameOver = !!data.gameOver; 
          gameState.moveLogs = data.moveLogs || []; 
          gameState.elapsedSeconds = data.elapsedSeconds || 0;
          
          // Process incoming chat messages for Toast Notification
          if (data.chatMessages && Array.isArray(data.chatMessages)) {
              const newCount = data.chatMessages.length;
              if (newCount > onlineState.lastSeenChatIndex) {
                  for (let i = onlineState.lastSeenChatIndex; i < newCount; i++) {
                      const msg = data.chatMessages[i];
                      if (msg && msg.sender !== config.username) {
                          showChatToastNotification(msg.sender, msg.text);
                          if (!gotixChatOpen) gotixChatUnread++;
                      }
                  }
                  onlineState.lastSeenChatIndex = newCount;
              }
              onlineState.chatMessages = data.chatMessages;
              refreshGotixChat();
          }

          if (data.turn !== onlineState.role) {
              gameState.selectedNode = null; 
              gameState.legalMoves = []; 
              gameState.multiCaptureActive = false; 
          }
          
          updateMoveLogUI(); 
          updateUI();
          if (onlineState.startedLocally) notifyTurnIfNeeded(); 
          render();
          
          if (gameState.gameOver) stopTimer();
          if (data.status === 'playing') { 
              document.getElementById('modal-online').classList.add('hidden'); 
          }
        }

        function watchRoom(ref) {
          if (onlineState.unsubscribe) onlineState.unsubscribe();
          onlineState.roomRef = ref;
          onlineState.unsubscribe = window.gutikaFB.onSnapshot(ref, snap => {
            if (!snap.exists()) { onlineMessage('Room closed.'); return; }
            const d = snap.data();
            if (d.status === 'finished' || d.status === 'cancelled') {
              stopTimer();
              if (d.status === 'finished' && d.winner && onlineState.role && onlineState.roomCode && !onlineState.resultRecorded && d.exitedBy !== window.gutikaUser?.uid) {
                  onlineState.resultRecorded = true;
                  triggerWin(d.winner, 'forfeit');
              }
              if (d.status === 'cancelled') {
                  onlineMessage('Challenge cancelled.');
                  if (onlineState.unsubscribe) { onlineState.unsubscribe(); onlineState.unsubscribe = null; }
                  void leaveOnlineRoom(false);
                  onlineModal.classList.add('hidden');
                  startMenuModal.classList.remove('hidden');
              }
              return;
            }
            if (d.status === 'playing' && d.players && d.players.P1 && d.players.P2) {
              config.mode = 'online'; 
              startMenuModal.classList.add('hidden');
              onlineModal.classList.add('hidden');
              config.p1Name = d.players.P1.name || 'Player 1'; 
              config.p2Name = d.players.P2.name || 'Player 2';
              if (!onlineState.startedLocally) { 
                  onlineState.startedLocally = true; 
                  initGame(false); 
                  startOnlineTurnTimer();
              }
              applyOnlineSnapshot(d);
            } else if (d.status === 'waiting') { 
                onlineModal.classList.remove('hidden');
                startMenuModal.classList.add('hidden');
                onlineMessage(config.lang === 'hi' ? 'रूम तैयार है। दूसरे खिलाड़ी का इंतज़ार...' : 'Room ready. Waiting for opponent...'); 
            }
          }, err => { console.error('Room listener failed:',err); onlineMessage('Room sync error: ' + (err.message || err.code)); });
        }

        function makeRoomCode() { return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,'X'); }

        async function createOnlineRoom(random=false) {
          if (!await ensureOnlineConnected()) return;
          onlineMessage(config.lang === 'hi' ? 'खिलाड़ी खोज रहे हैं...' : 'Searching for opponent...');
          try {
            const f = window.gutikaFB; 
            let code = makeRoomCode(), ref = currentRoomRef(code);
            if (random) {
              const q = f.query(f.collection(f.db, ...FB_ROOT), f.where('status', '==', 'waiting'), f.limit(15));
              const found = await f.getDocs(q);
              let joined = false;
              for (const candidate of found.docs) {
                const candidateRef = candidate.ref;
                const d = candidate.data();
                if (d.players && d.players.P1 && d.players.P1.uid === window.gutikaUser.uid) {
                    continue;
                }
                try { 
                    await f.runTransaction(f.db, async tx => { 
                        const snap = await tx.get(candidateRef); 
                        if (!snap.exists()) throw new Error('gone'); 
                        const curData = snap.data(); 
                        if (curData.status !== 'waiting' || curData.players?.P2) throw new Error('taken'); 
                        tx.update(candidateRef, { 'players.P2': { uid: window.gutikaUser.uid, name: config.username }, status: 'playing', started: true, turnDeadline: Date.now()+TURN_LIMIT_MS, timeoutCounts:{P1:0,P2:0} }); 
                        code = candidate.id; 
                        ref = candidateRef; 
                    }); 
                    joined = true; 
                    onlineState.role = 'P2'; 
                    break; 
                } catch(e) {}
              }
              if (!joined) { 
                  await createOnlineRoom(false); 
                  return; 
              }
            } else {
              initGame(false); 
              onlineState.startedLocally = false;
              await f.setDoc(ref, { 
                  code, 
                  status: 'waiting', 
                  started: false, 
                  createdAt: Date.now(), 
                  players: { P1: { uid: window.gutikaUser.uid, name: config.username }, P2: null }, 
                  ...roomPayload('waiting') 
              });
              onlineState.role = 'P1';
            }
            onlineState.roomCode = code; 
            document.getElementById('display-room-code').textContent = code;
            document.getElementById('online-menu').classList.add('hidden'); 
            document.getElementById('online-waiting').classList.remove('hidden');
            startMenuModal.classList.add('hidden');
            watchRoom(ref);
          } catch(e) { 
              console.error(e); 
              onlineMessage('Error: ' + e.message); 
          }
        }

        async function joinOnlineRoom() {
          if (!await ensureOnlineConnected()) return;
          const code = document.getElementById('input-room-code').value.trim().toUpperCase();
          if (!/^[A-Z0-9]{6}$/.test(code)) { onlineMessage('Enter valid 6-character Room Code.'); return; }
          const f = window.gutikaFB, ref = currentRoomRef(code);
          try {
            await f.runTransaction(f.db, async tx => { 
                const snap = await tx.get(ref); 
                if (!snap.exists()) throw new Error('Room not found.'); 
                const d = snap.data(); 
                if (d.players && d.players.P1 && d.players.P1.uid === window.gutikaUser.uid) {
                    throw new Error('You cannot join your own created room!');
                }
                if (d.status !== 'waiting' || d.players?.P2) throw new Error('Room is already full.'); 
                tx.update(ref, { 'players.P2': { uid: window.gutikaUser.uid, name: config.username }, status: 'playing', started: true, turnDeadline: Date.now()+TURN_LIMIT_MS, timeoutCounts:{P1:0,P2:0} }); 
            });
            onlineState.role = 'P2'; 
            onlineState.roomCode = code; 
            startMenuModal.classList.add('hidden');
            watchRoom(ref);
            document.getElementById('online-menu').classList.add('hidden'); 
            document.getElementById('online-waiting').classList.remove('hidden'); 
            document.getElementById('display-room-code').textContent = code;
          } catch(e) { 
              onlineMessage(e.message || 'Could not join room.'); 
          }
        }

        async function leaveOnlineRoom(forfeit=true) {
            const ref = onlineState.roomRef;
            const role = onlineState.role;
            const f = window.gutikaFB;
            if (forfeit && ref && role && f && window.gutikaUser?.uid) {
                try {
                    await f.runTransaction(f.db, async tx => {
                        const snap = await tx.get(ref);
                        if (!snap.exists()) return;
                        const d = snap.data();
                        if (d.players?.[role]?.uid !== window.gutikaUser.uid) return;
                        if (d.status === 'playing') {
                            tx.update(ref, {status:'finished', gameOver:true,
                                winner: role === 'P1' ? 'P2' : 'P1',
                                finishReason:'forfeit', exitedBy:window.gutikaUser.uid, updatedAt:Date.now()});
                        } else if (d.status === 'waiting') {
                            tx.update(ref, {status:'cancelled', updatedAt:Date.now()});
                        }
                    });
                } catch(e) { console.error('Could not finish online room', e); onlineMessage('Could not leave room: ' + e.message); return false; }
            }
            if (onlineState.unsubscribe) onlineState.unsubscribe();
            stopTimer();
            onlineState = {
                roomCode:null, role:null, unsubscribe:null, roomRef:null,
                connected:!!window.gutikaFB, startedLocally:false, moveTimer:120,
                turnInterval:null, syncInterval:null, chatMessages:[], lastSeenChatIndex:0
            };
            config.mode = 'pvp';
            document.getElementById('online-waiting').classList.add('hidden');
            document.getElementById('online-menu').classList.remove('hidden');
            return true;
        }
        async function closeOnlineToHome() {
            if (!await leaveOnlineRoom(true)) return;
            onlineModal.classList.add('hidden');
            document.getElementById('modal-start-menu').classList.remove('hidden');
        }

        document.getElementById('fb-api-key').value = DEFAULT_FB_CONFIG.apiKey;
        document.getElementById('fb-auth-domain').value = DEFAULT_FB_CONFIG.authDomain;
        document.getElementById('fb-project-id').value = DEFAULT_FB_CONFIG.projectId;
        document.getElementById('fb-app-id').value = DEFAULT_FB_CONFIG.appId;

        document.getElementById('btn-firebase-connect').addEventListener('click', async () => {
          const cfg = {
              apiKey: document.getElementById('fb-api-key').value.trim(),
              authDomain: document.getElementById('fb-auth-domain').value.trim(),
              projectId: document.getElementById('fb-project-id').value.trim(),
              appId: document.getElementById('fb-app-id').value.trim()
          };
          if (Object.values(cfg).some(v => !v)) { onlineMessage('Fill all Firebase fields.'); return; }
          localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg)); 
          if (await ensureOnlineConnected()) onlineMessage('Firebase connected!');
        });

        async function shareChallenge() {
            const status = document.getElementById('challenge-share-status');
            status.textContent = 'Creating challenge...';
            await createOnlineRoom(false);
            if (!onlineState.roomCode) { status.textContent = 'Could not create challenge.'; return; }
            const code = onlineState.roomCode;
            // Public GitHub Pages URL works for both Android WebView and browsers.
            const pageUrl = new URL('https://abhinavmshukla.github.io/gotix18/');
            pageUrl.searchParams.set('challenge', code);
            const message = `🎮 GOTIX 18 — Challenge a Friend!\n\nChallenge Link: ${pageUrl.href}\nRoom Code: ${code}\n\nOpen the link in your browser, or enter the code in Online Multiplayer.`;
            status.textContent = `Challenge ready — Code: ${code} | Link: ${pageUrl.href}`;
            try {
                if (navigator.share) await navigator.share({ title: 'GOTIX 18 Challenge', text: message });
                else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); status.textContent = `Copied! Room Code: ${code} | ${pageUrl.href}`; }
                else status.textContent = message;
            } catch (e) { if (e.name !== 'AbortError') status.textContent = message; }

        }
        document.getElementById('btn-share-challenge').addEventListener('click', shareChallenge);
        document.getElementById('btn-random-match').addEventListener('click', () => createOnlineRoom(true));
        document.getElementById('btn-join-room').addEventListener('click', joinOnlineRoom);
        document.getElementById('btn-cancel-online').addEventListener('click', closeOnlineToHome);
        document.getElementById('btn-close-online').addEventListener('click', closeOnlineToHome);

        const moreButton = document.getElementById('btn-game-more');
        const moreMenu = document.getElementById('gotix-more-options');
        if (moreButton && moreMenu) {
            moreButton.addEventListener('click', () => {
                const opening = moreMenu.classList.contains('hidden');
                moreMenu.classList.toggle('hidden', !opening);
                moreButton.setAttribute('aria-expanded', String(opening));
            });
            moreMenu.addEventListener('click', (event) => {
                if (event.target.closest('button')) {
                    moreMenu.classList.add('hidden');
                    moreButton.setAttribute('aria-expanded', 'false');
                }
            });
        }
        document.getElementById('btn-settings').addEventListener('click', () => { audio.playSelect(); settingsModal.classList.remove('hidden'); });
        document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));

        document.getElementById('btn-rules').addEventListener('click', () => {
            audio.playSelect();
            document.getElementById('txt-rules-content').innerHTML = I18N[config.lang].rulesText;
            rulesModal.classList.remove('hidden');
        });
        document.getElementById('btn-close-rules').addEventListener('click', () => rulesModal.classList.add('hidden'));
        document.getElementById('btn-understand').addEventListener('click', () => rulesModal.classList.add('hidden'));

        document.getElementById('btn-log').addEventListener('click', () => { audio.playSelect(); logModal.classList.remove('hidden'); });
        document.getElementById('btn-close-log').addEventListener('click', () => logModal.classList.add('hidden'));

        document.getElementById('btn-sound').addEventListener('click', () => {
            config.soundEnabled = !config.soundEnabled;
            localStorage.setItem('gotix_sound_enabled', String(config.soundEnabled));
            const btn = document.getElementById('btn-sound');
            btn.innerHTML = config.soundEnabled ? `<i class="fa-solid fa-volume-high text-xs"></i>` : `<i class="fa-solid fa-volume-xmark text-xs"></i>`;
        });

        document.getElementById('btn-bgm').addEventListener('click', () => audio.toggleBGM());

        document.getElementById('btn-toggle-piece-style').addEventListener('click', () => {
            audio.playSelect();
            config.pieceStyle = config.pieceStyle === 'vertical' ? 'sphere' : 'vertical';
            document.getElementById('select-piece-style').value = config.pieceStyle;
            render();
        });

        const btnPvp = document.getElementById('opt-mode-pvp');
        const btnAi = document.getElementById('opt-mode-ai');
        const boxAiDiff = document.getElementById('box-ai-diff');

        btnPvp.addEventListener('click', () => {
            config.mode = 'pvp';
            btnPvp.className = "py-2 px-3 rounded-xl border border-amber-600 bg-amber-600 text-white font-semibold text-center transition";
            btnAi.className = "py-2 px-3 rounded-xl border border-slate-300 bg-slate-100 text-slate-700 font-semibold text-center hover:bg-slate-200 transition";
            boxAiDiff.classList.add('hidden');
        });

        btnAi.addEventListener('click', () => {
            config.mode = 'ai';
            btnAi.className = "py-2 px-3 rounded-xl border border-amber-600 bg-amber-600 text-white font-semibold text-center transition";
            btnPvp.className = "py-2 px-3 rounded-xl border border-slate-300 bg-slate-100 text-slate-700 font-semibold text-center hover:bg-slate-200 transition";
            boxAiDiff.classList.remove('hidden');
        });

        document.getElementById('btn-save-settings').addEventListener('click', () => {
            config.aiDiff = document.getElementById('select-ai-diff').value;
            config.boardTheme = document.getElementById('select-board-theme').value;
            config.pieceTheme = document.getElementById('select-piece-theme').value;
            config.pieceStyle = document.getElementById('select-piece-style').value;
            settingsModal.classList.add('hidden');
            render();
            updateUI();
        });

        // First-launch flow; completion stored only after account or guest choice.
        const onboarding = document.getElementById('onboarding');
        const onboardSections = ['onboard-language','onboard-tutorial','onboard-account'];
        function onboardShow(step) { onboardSections.forEach((id,i) => document.getElementById(id).classList.toggle('hidden', i !== step)); }
        const tutorialSteps = {
          hi: [
            'प्रत्येक खिलाड़ी अपनी गोटियाँ बारी-बारी चलाता है। पहले अपनी गोटी चुनें, फिर बोर्ड पर उपलब्ध स्थान चुनें।',
            'गोटी बोर्ड की बनी हुई रेखाओं के अनुसार ही चल सकती है। चाल के लिए दिखाई देने वाले वैध स्थान चुनें।',
            'नियमों के अनुसार प्रतिद्वंद्वी की गोटी काटें। जहाँ लगातार काटना संभव हो, अपनी बारी पूरी करने के निर्देश देखें।',
            'प्रतिद्वंद्वी की सभी गोटियाँ समाप्त करने या खेल के निर्धारित जीत नियम पूरे करने पर जीत होती है। पूरी नियमावली ? बटन में उपलब्ध है।'
          ],
          en: [
            'Players take turns. Tap one of your pieces, then tap a valid destination on the board.',
            'Pieces move along the lines drawn on the board. Select only legal destinations.',
            'Capture opponent pieces according to the game rules. Follow the prompts for consecutive captures.',
            'Win by meeting the game victory conditions. You can reopen the full rules with the ? button.'
          ]
        };
        let tutorialIndex = 0;
        function showTutorialStep() {
            const steps = tutorialSteps[config.lang] || tutorialSteps.hi;
            document.getElementById('onboard-tutorial-progress').textContent = `${tutorialIndex + 1} / ${steps.length}`;
            document.getElementById('onboard-tutorial-content').textContent = steps[tutorialIndex];
            document.getElementById('onboard-tutorial-next').textContent = tutorialIndex === steps.length-1 ? (config.lang === 'hi' ? 'आगे: लॉगिन' : 'Next: Login') : (config.lang === 'hi' ? 'अगला' : 'Next');
        }
        function setOnboardLanguage(lang) {
            config.lang = lang; localStorage.setItem('gutika_language',lang);
            applyLanguage(); tutorialIndex = 0; showTutorialStep(); onboardShow(1);
        }
        document.getElementById('onboard-hi').addEventListener('click',()=>setOnboardLanguage('hi'));
        document.getElementById('onboard-en').addEventListener('click',()=>setOnboardLanguage('en'));
        document.getElementById('onboard-tutorial-next').addEventListener('click',()=>{
            if (++tutorialIndex >= tutorialSteps[config.lang].length) onboardShow(2);
            else showTutorialStep();
        });
        function finishOnboarding() { localStorage.setItem('gutika_onboarding_v2','complete'); onboarding.classList.add('hidden'); startMenuModal.classList.remove('hidden'); updateProfileModalUI(); acceptChallengeFromUrl(); }
        document.getElementById('onboard-guest').addEventListener('click', finishOnboarding);
        document.getElementById('onboard-google').addEventListener('click',async()=>{
            const status = document.getElementById('onboard-status');
            const btn = document.getElementById('onboard-google'); btn.disabled=true;
            status.textContent = 'Signing in...';
            try {
                if (!await ensureOnlineConnected()) throw new Error('Firebase unavailable');
                if (window.gutikaFB?.auth?.currentUser?.isAnonymous) await window.gutikaGoogleLogin();
                await loadOrCreateCloudProfile(); updateGoogleIdentity(); finishOnboarding();
            } catch(e) { status.textContent = e.message || 'Sign-in failed'; }
            finally { btn.disabled=false; }
        });
        async function acceptChallengeFromUrl() {
            const code = new URLSearchParams(location.search).get('challenge');
            if (!code || !/^[A-Z0-9]{6}$/i.test(code)) return;
            document.getElementById('input-room-code').value = code.toUpperCase();
            startMenuModal.classList.add('hidden');
            onlineModal.classList.remove('hidden');
            // Do not auto-join before user accepts the challenge.
            onlineMessage(config.lang === 'hi' ? 'आमंत्रण मिला है। जुड़ें (Join) दबाएँ।' : 'Challenge received. Tap Join to accept.');
        }
        window.onload = () => {
            CANVAS = document.getElementById('gameCanvas');
            if (CANVAS) {
                CTX = CANVAS.getContext('2d');
                initCanvasListeners();
            }
            const savedLanguage = localStorage.getItem('gutika_language');
            if (savedLanguage === 'hi' || savedLanguage === 'en') config.lang = savedLanguage;
            applyLanguage();
            resizeCanvas();
            initGame(true);
            if (localStorage.getItem('gutika_onboarding_v2') !== 'complete') {
                startMenuModal.classList.add('hidden'); onboarding.classList.remove('hidden'); onboardShow(0);
            } else acceptChallengeFromUrl();
            ensureOnlineConnected().then(async ok => {
                if (!ok) return;
                updateGoogleIdentity();
                if (window.gutikaFB?.auth?.currentUser && !window.gutikaFB.auth.currentUser.isAnonymous) {
                    try { await loadOrCreateCloudProfile(); } catch (e) { console.error('Cloud restore failed:', e); }
                }
            });
        };

        // Menu-only soundtrack: existing screen navigation remains untouched.
        document.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
        document.addEventListener('keydown', () => audio.unlock(), { once: true, capture: true });
        document.addEventListener('visibilitychange', () => audio.updateMusic());
        const gotixMenu = document.getElementById('modal-start-menu');
        if (gotixMenu) new MutationObserver(() => audio.updateMusic()).observe(gotixMenu, { attributes: true, attributeFilter: ['class'] });
        const gotixMusicSlider = document.getElementById('gotix-music-volume');
        const gotixSfxSlider = document.getElementById('gotix-sfx-volume');
        if (gotixMusicSlider) {
            gotixMusicSlider.value = Math.round(config.musicVolume * 100);
            gotixMusicSlider.addEventListener('input', e => {
                config.musicVolume = Number(e.target.value) / 100;
                localStorage.setItem('gotix_music_volume', String(config.musicVolume));
                audio.updateMusic();
            });
        }
        if (gotixSfxSlider) {
            gotixSfxSlider.value = Math.round(config.sfxVolume * 100);
            gotixSfxSlider.addEventListener('input', e => {
                config.sfxVolume = Number(e.target.value) / 100;
                localStorage.setItem('gotix_sfx_volume', String(config.sfxVolume));
            });
        }
        audio.updateMusic();
