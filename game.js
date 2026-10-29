/**
 * ANOMALOUS MAZE: 1981
 * Terinspirasi dari Persona: Anomalous Tower (異空の塔) & 3D Monster Maze (1981)
 *
 * Kontrol Gerak:
 * - W (atau Panah Atas) : Maju 1 petak ke depan
 * - A (atau Panah Kiri / Q) : Menoleh ke Kiri (90°)
 * - D (atau Panah Kanan / E) : Menoleh ke Kanan (90°)
 * - S (atau Panah Bawah) : Putar balik ke Belakang (180°)
 * - M : Buka / Tutup Peta Labirin
 *
 * Fitur:
 * - Pencahayaan terang dan hangat khas Persona Dungeon
 * - Papan tutorial kompak dan lebar (tidak terpotong di layar)
 * - Radar Minimap Persona dengan bingkai kuning emas, N-E-S-W, dan panah oranye
 * - Misi 3 Kunci Kuno (Zamrud, Ambar, Delima) untuk membuka Gerbang Besi
 * - Monster AI cerdas yang berpatroli dan memburu tile-by-tile
 * - Ticker status monster khas 3D Monster Maze 1981
 * - Sound Engine Web Audio API murni tanpa file eksternal
 */

(function () {
    "use strict";

    // ==========================================
    // 1. HELPER & DOM REFERENCES
    // ==========================================
    const $ = (id) => document.getElementById(id);

    const canvas = $("gameCanvas");
    const minimapCanvas = $("minimapCanvas");
    const minimapCtx = minimapCanvas.getContext("2d");

    // UI Elements
    const keySlot1 = $("keySlot1");
    const keySlot2 = $("keySlot2");
    const keySlot3 = $("keySlot3");
    const keysCountLabel = document.querySelector(".keys-container .hud-label");
    const heartbeatCard = $("heartbeatCard");
    const heartIcon = $("heartIcon");
    const bpmValue = $("bpmValue");
    const hudFacingText = $("hudFacingText");
    const survivalTimerEl = $("survivalTimer");
    const monsterTicker = $("monsterTicker");
    const tickerText = $("tickerText");
    const playerStatusEl = $("playerStatus");
    const playerFacingText = $("playerFacingText");
    const monsterDistanceText = $("monsterDistanceText");
    const playerCoordsEl = $("playerCoords");
    const vignetteOverlay = $("vignetteOverlay");
    const gameToast = $("gameToast");
    const interactionPrompt = $("interactionPrompt");
    const minimapOverlay = $("minimapOverlay");

    // Screens
    const startScreen = $("startScreen");
    const gameOverScreen = $("gameOverScreen");
    const victoryScreen = $("victoryScreen");

    // Buttons
    const startGameBtn = $("startGameBtn");
    const restartBtn = $("restartBtn");
    const playAgainBtn = $("playAgainBtn");
    const muteButton = $("muteButton");
    const mapToggleBtn = $("mapToggleBtn");
    const fullscreenBtn = $("fullscreenBtn");
    const quickRestartBtn = $("quickRestartBtn");
    const howToPlayBtn = $("howToPlayBtn");
    const gameShell = document.querySelector(".game-shell");

    // Stats display
    const goKeysFound = $("goKeysFound");
    const goSurvivalTime = $("goSurvivalTime");
    const vicTime = $("vicTime");
    const vicBestTime = $("vicBestTime");

    const BEST_TIME_KEY = "dungeonMazeBestTime";

    // Direction Constants: 0: NORTH, 1: EAST, 2: SOUTH, 3: WEST
    const DIR_NORTH = 0;
    const DIR_EAST = 1;
    const DIR_SOUTH = 2;
    const DIR_WEST = 3;

    const DIR_NAMES = ["UTARA (N)", "TIMUR (E)", "SELATAN (S)", "BARAT (W)"];

    // Delta [dr, dc] for each direction
    const DIR_DELTAS = [
        [-1, 0], // NORTH (-Z)
        [0, 1],  // EAST (+X)
        [1, 0],  // SOUTH (+Z)
        [0, -1]  // WEST (-X)
    ];

    // Angles for camera yaw (in radians)
    const DIR_ANGLES = [
        0,
        Math.PI * 0.5,
        Math.PI,
        Math.PI * 1.5
    ];

    // ==========================================
    // 2. MAT4 3D MATRIX MATHEMATICS
    // ==========================================
    const Mat4 = {
        create: () => new Float32Array(16),

        identity: (out) => {
            out.fill(0);
            out[0] = out[5] = out[10] = out[15] = 1;
            return out;
        },

        perspective: (out, fovy, aspect, near, far) => {
            const f = 1.0 / Math.tan(fovy / 2);
            const nf = 1 / (near - far);
            out.fill(0);
            out[0] = f / aspect;
            out[5] = f;
            out[10] = (far + near) * nf;
            out[11] = -1;
            out[14] = (2 * far * near) * nf;
            return out;
        },

        lookAt: (out, eye, center, up) => {
            let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
            const eyex = eye[0], eyey = eye[1], eyez = eye[2];
            const upx = up[0], upy = up[1], upz = up[2];
            const centerx = center[0], centery = center[1], centerz = center[2];

            z0 = eyex - centerx;
            z1 = eyey - centery;
            z2 = eyez - centerz;
            len = 1 / Math.hypot(z0, z1, z2);
            z0 *= len; z1 *= len; z2 *= len;

            x0 = upy * z2 - upz * z1;
            x1 = upz * z0 - upx * z2;
            x2 = upx * z1 - upy * z0;
            len = Math.hypot(x0, x1, x2);
            if (!len) { x0 = 0; x1 = 0; x2 = 0; }
            else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }

            y0 = z1 * x2 - z2 * x1;
            y1 = z2 * x0 - z0 * x2;
            y2 = z0 * x1 - z1 * x0;
            len = Math.hypot(y0, y1, y2);
            if (!len) { y0 = 0; y1 = 0; y2 = 0; }
            else { len = 1 / len; y0 *= len; y1 *= len; y2 *= len; }

            out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
            out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
            out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
            out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
            out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
            out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
            out[15] = 1;
            return out;
        },

        multiply: (out, a, b) => {
            const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
            const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
            const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
            const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

            let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
            out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
            out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
            out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
            out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
            return out;
        },

        translate: (out, a, v) => {
            const x = v[0], y = v[1], z = v[2];
            if (a === out) {
                out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
                out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
                out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
                out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
            } else {
                for (let i = 0; i < 12; i++) out[i] = a[i];
                out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
                out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
                out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
                out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
            }
            return out;
        },

        rotateX: (out, a, rad) => {
            const s = Math.sin(rad), c = Math.cos(rad);
            const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
            const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
            if (a !== out) {
                out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
                out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
            }
            out[4] = a10 * c + a20 * s;
            out[5] = a11 * c + a21 * s;
            out[6] = a12 * c + a22 * s;
            out[7] = a13 * c + a23 * s;
            out[8] = a20 * c - a10 * s;
            out[9] = a21 * c - a11 * s;
            out[10] = a22 * c - a12 * s;
            out[11] = a23 * c - a13 * s;
            return out;
        },

        rotateY: (out, a, rad) => {
            const s = Math.sin(rad), c = Math.cos(rad);
            const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
            const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
            if (a !== out) {
                out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
                out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
            }
            out[0] = a00 * c - a20 * s;
            out[1] = a01 * c - a21 * s;
            out[2] = a02 * c - a22 * s;
            out[3] = a03 * c - a23 * s;
            out[8] = a00 * s + a20 * c;
            out[9] = a01 * s + a21 * c;
            out[10] = a02 * s + a22 * c;
            out[11] = a03 * s + a23 * c;
            return out;
        },

        rotateZ: (out, a, rad) => {
            const s = Math.sin(rad), c = Math.cos(rad);
            const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
            const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
            if (a !== out) {
                out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
                out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
            }
            out[0] = a00 * c + a10 * s;
            out[1] = a01 * c + a11 * s;
            out[2] = a02 * c + a12 * s;
            out[3] = a03 * c + a13 * s;
            out[4] = a10 * c - a00 * s;
            out[5] = a11 * c - a01 * s;
            out[6] = a12 * c - a02 * s;
            out[7] = a13 * c - a03 * s;
            return out;
        },

        scale: (out, a, v) => {
            const x = v[0], y = v[1], z = v[2];
            out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
            out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
            out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
            out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
            return out;
        }
    };

    // ==========================================
    // 3. SOUND SYNTHESIZER (WEB AUDIO API)
    // ==========================================
    class DungeonAudio {
        constructor() {
            this.ctx = null;
            this.muted = false;
            this.droneGain = null;
        }

        init() {
            if (this.ctx) return;
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            this.ctx = new AudioCtx();
            this.startAmbientDrone();
        }

        resume() {
            if (this.ctx && this.ctx.state === "suspended") {
                this.ctx.resume();
            }
        }

        toggleMute() {
            this.muted = !this.muted;
            if (this.droneGain && this.ctx) {
                this.droneGain.gain.setValueAtTime(this.muted ? 0 : 0.045, this.ctx.currentTime);
            }
            return this.muted;
        }

        startAmbientDrone() {
            if (!this.ctx || this.droneGain) return;
            try {
                const osc = this.ctx.createOscillator();
                const filter = this.ctx.createBiquadFilter();
                this.droneGain = this.ctx.createGain();

                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(48.0, this.ctx.currentTime);

                filter.type = "lowpass";
                filter.frequency.setValueAtTime(120, this.ctx.currentTime);

                this.droneGain.gain.setValueAtTime(this.muted ? 0 : 0.045, this.ctx.currentTime);

                osc.connect(filter);
                filter.connect(this.droneGain);
                this.droneGain.connect(this.ctx.destination);
                osc.start();
            } catch (e) {
                console.warn("Drone audio error", e);
            }
        }

        playStepSound() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(85 + Math.random() * 20, now);
            osc.frequency.exponentialRampToValueAtTime(32, now + 0.1);

            filter.type = "lowpass";
            filter.frequency.setValueAtTime(260, now);

            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.12);
        }

        playTurnSound() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(170, now);
            osc.frequency.exponentialRampToValueAtTime(85, now + 0.08);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
        }

        playBump() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(65, now);
            osc.frequency.exponentialRampToValueAtTime(25, now + 0.15);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.17);
        }

        playMonsterFootstep(distance, angleDiff) {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const distVol = Math.max(0, 1.0 - distance / 18.0);
            if (distVol <= 0.01) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

            osc.type = "sine";
            osc.frequency.setValueAtTime(75, now);
            osc.frequency.exponentialRampToValueAtTime(26, now + 0.35);

            const vol = distVol * 0.38;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

            if (panner) {
                const pan = Math.sin(angleDiff);
                panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
                osc.connect(gain);
                gain.connect(panner);
                panner.connect(this.ctx.destination);
            } else {
                osc.connect(gain);
                gain.connect(this.ctx.destination);
            }

            osc.start(now);
            osc.stop(now + 0.4);
        }

        playMonsterRoar(distance) {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const distVol = Math.max(0.15, 1.0 - distance / 22.0);

            const osc = this.ctx.createOscillator();
            const modOsc = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const mainGain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.linearRampToValueAtTime(320, now + 0.4);
            osc.frequency.exponentialRampToValueAtTime(65, now + 1.2);

            modOsc.type = "square";
            modOsc.frequency.setValueAtTime(45, now);
            modGain.gain.setValueAtTime(120, now);

            modOsc.connect(osc.frequency);

            filter.type = "bandpass";
            filter.frequency.setValueAtTime(450, now);
            filter.frequency.linearRampToValueAtTime(900, now + 0.3);
            filter.frequency.exponentialRampToValueAtTime(200, now + 1.2);
            filter.Q.setValueAtTime(3.0, now);

            mainGain.gain.setValueAtTime(0.001, now);
            mainGain.gain.linearRampToValueAtTime(0.35 * distVol, now + 0.15);
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

            osc.connect(filter);
            filter.connect(mainGain);
            mainGain.connect(this.ctx.destination);

            modOsc.start(now);
            osc.start(now);
            modOsc.stop(now + 1.3);
            osc.stop(now + 1.3);
        }

        playHeartbeatSound(volume = 0.2) {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;

            const playThump = (time, freq, gainVal) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, time);
                osc.frequency.exponentialRampToValueAtTime(25, time + 0.12);
                gain.gain.setValueAtTime(gainVal, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(time);
                osc.stop(time + 0.14);
            };

            playThump(now, 72, volume);
            playThump(now + 0.14, 58, volume * 0.7);
        }

        playKeyPickup() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const noteTime = now + idx * 0.08;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.15, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.5);
            });
        }

        playDoorUnlocked() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(70, now);
            osc.frequency.linearRampToValueAtTime(45, now + 1.2);

            filter.type = "lowpass";
            filter.frequency.setValueAtTime(250, now);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 1.5);
        }

        playJumpscare() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = "sawtooth";
            osc1.frequency.setValueAtTime(220, now);
            osc1.frequency.exponentialRampToValueAtTime(80, now + 1.0);

            osc2.type = "square";
            osc2.frequency.setValueAtTime(233, now);
            osc2.frequency.exponentialRampToValueAtTime(75, now + 1.0);

            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 1.2);
            osc2.stop(now + 1.2);
        }

        playVictory() {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const chords = [
                [261.63, 329.63, 392.00],
                [349.23, 440.00, 523.25],
                [392.00, 493.88, 587.33],
                [523.25, 659.25, 783.99, 1046.50]
            ];

            chords.forEach((chord, cIdx) => {
                const chordTime = now + cIdx * 0.35;
                const dur = cIdx === chords.length - 1 ? 1.4 : 0.32;
                chord.forEach(freq => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(freq, chordTime);
                    gain.gain.setValueAtTime(0.12, chordTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, chordTime + dur);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(chordTime);
                    osc.stop(chordTime + dur + 0.05);
                });
            });
        }
    }

    const audio = new DungeonAudio();

    // ==========================================
    // 4. PROCEDURAL TEXTURE GENERATOR (BRIGHT & WARM PERSONA STYLE)
    // ==========================================
    class TextureGenerator {
        static createWallTexture() {
            const cvs = document.createElement("canvas");
            cvs.width = 256; cvs.height = 256;
            const ctx = cvs.getContext("2d");

            // Warm brown mortar
            ctx.fillStyle = "#3e2815";
            ctx.fillRect(0, 0, 256, 256);

            const rows = 4;
            const rowH = 256 / rows;

            for (let r = 0; r < rows; r++) {
                const cols = (r % 2 === 0) ? 2 : 3;
                const colW = 256 / cols;
                const offset = (r % 2 === 0) ? 0 : -colW * 0.5;

                for (let c = -1; c <= cols + 1; c++) {
                    const bx = c * colW + offset + 5;
                    const by = r * rowH + 5;
                    const bw = colW - 10;
                    const bh = rowH - 10;
                    const radius = 14;

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(bx + radius, by);
                    ctx.lineTo(bx + bw - radius, by);
                    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
                    ctx.lineTo(bx + bw, by + bh - radius);
                    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
                    ctx.lineTo(bx + radius, by + bh);
                    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
                    ctx.lineTo(bx, by + radius);
                    ctx.quadraticCurveTo(bx, by, bx + radius, by);
                    ctx.closePath();

                    // Brighter golden sandstone gradient
                    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                    grad.addColorStop(0, "#f7d57f");   // Bright top highlight
                    grad.addColorStop(0.3, "#ebba4e"); // Golden warm
                    grad.addColorStop(0.7, "#d29c31"); // Mid sandstone
                    grad.addColorStop(1, "#9e6f1a");   // Base shadow
                    ctx.fillStyle = grad;
                    ctx.fill();

                    // Edge bevel highlight
                    ctx.strokeStyle = "rgba(255, 250, 210, 0.65)";
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    // Shading grain
                    for (let n = 0; n < 10; n++) {
                        const nx = bx + Math.random() * bw;
                        const ny = by + Math.random() * bh;
                        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,220,0.18)" : "rgba(100,60,10,0.14)";
                        ctx.beginPath();
                        ctx.arc(nx, ny, 3 + Math.random() * 6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }
            return cvs;
        }

        static createFloorTexture() {
            const cvs = document.createElement("canvas");
            cvs.width = 256; cvs.height = 256;
            const ctx = cvs.getContext("2d");

            // Brighter earthen stone floor
            ctx.fillStyle = "#634734";
            ctx.fillRect(0, 0, 256, 256);

            for (let i = 0; i < 300; i++) {
                const x = Math.random() * 256;
                const y = Math.random() * 256;
                const r = 2 + Math.random() * 5;
                ctx.fillStyle = Math.random() > 0.5 ? "rgba(60, 40, 25, 0.35)" : "rgba(140, 105, 80, 0.35)";
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            return cvs;
        }

        static createCeilingTexture() {
            const cvs = document.createElement("canvas");
            cvs.width = 256; cvs.height = 256;
            const ctx = cvs.getContext("2d");

            ctx.fillStyle = "#2e2722";
            ctx.fillRect(0, 0, 256, 256);

            const plankH = 32;
            for (let y = 0; y < 256; y += plankH) {
                ctx.fillStyle = (y / plankH) % 2 === 0 ? "#3d342d" : "#332c25";
                ctx.fillRect(0, y + 2, 256, plankH - 4);

                ctx.strokeStyle = "rgba(0,0,0,0.6)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(256, y);
                ctx.stroke();
            }
            return cvs;
        }

        static createDoorTexture() {
            const cvs = document.createElement("canvas");
            cvs.width = 256; cvs.height = 256;
            const ctx = cvs.getContext("2d");

            ctx.fillStyle = "#261a11";
            ctx.fillRect(0, 0, 256, 256);

            for (let p = 0; p < 4; p++) {
                ctx.fillStyle = p % 2 === 0 ? "#3b281b" : "#302015";
                ctx.fillRect(p * 64 + 2, 0, 60, 256);
            }

            ctx.fillStyle = "#3d4a5d";
            ctx.fillRect(0, 30, 256, 24);
            ctx.fillRect(0, 120, 256, 28);
            ctx.fillRect(0, 205, 256, 24);

            ctx.fillStyle = "#b0bac7";
            ctx.beginPath();
            ctx.arc(128, 134, 18, 0, Math.PI * 2);
            ctx.fill();

            return cvs;
        }

        static createMonsterTexture() {
            const cvs = document.createElement("canvas");
            cvs.width = 256; cvs.height = 256;
            const ctx = cvs.getContext("2d");

            ctx.fillStyle = "#241411";
            ctx.fillRect(0, 0, 256, 256);

            for (let y = 0; y < 256; y += 12) {
                for (let x = 0; x < 256; x += 12) {
                    const redVal = 45 + Math.floor(Math.random() * 30);
                    ctx.fillStyle = `rgb(${redVal + 15}, ${redVal}, ${redVal - 10})`;
                    ctx.beginPath();
                    ctx.arc(x + 6, y + 6, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.fillStyle = "#ff1122";
            ctx.beginPath();
            ctx.arc(64, 64, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffee55";
            ctx.beginPath();
            ctx.arc(64, 64, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#000";
            ctx.fillRect(61, 44, 6, 40);

            return cvs;
        }
    }

    // ==========================================
    // 5. WEBGL 3D RENDERER (BRIGHT & CLEAR LIGHTING)
    // ==========================================
    class DungeonRenderer {
        constructor(canvasEl) {
            this.canvas = canvasEl;
            this.gl = canvasEl.getContext("webgl", { antialias: false, powerPreference: "high-performance" }) ||
                      canvasEl.getContext("experimental-webgl");

            if (!this.gl) {
                alert("Browser tidak mendukung WebGL. Silakan buka di browser modern.");
                throw new Error("WebGL not supported");
            }

            this.initShaders();
            this.initTextures();
            this.initMeshBuffers();

            this.projMatrix = Mat4.create();
            this.viewMatrix = Mat4.create();
            this.modelMatrix = Mat4.create();
            this.mvpMatrix = Mat4.create();

            this.wallMesh = null;
            this.floorMesh = null;
            this.ceilMesh = null;

            this.resize();
            window.addEventListener("resize", () => this.resize());
        }

        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const w = Math.floor((this.canvas.clientWidth || 960) * dpr);
            const h = Math.floor((this.canvas.clientHeight || 540) * dpr);
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }

        initShaders() {
            const vsSource = `
                attribute vec3 a_position;
                attribute vec3 a_normal;
                attribute vec2 a_texcoord;

                uniform mat4 u_mvp;
                uniform mat4 u_model;

                varying vec3 v_worldPos;
                varying vec3 v_normal;
                varying vec2 v_texcoord;

                void main() {
                    vec4 worldPos = u_model * vec4(a_position, 1.0);
                    v_worldPos = worldPos.xyz;
                    v_normal = normalize((u_model * vec4(a_normal, 0.0)).xyz);
                    v_texcoord = a_texcoord;
                    gl_Position = u_mvp * vec4(a_position, 1.0);
                }
            `;

            const fsSource = `
                precision mediump float;

                varying vec3 v_worldPos;
                varying vec3 v_normal;
                varying vec2 v_texcoord;

                uniform sampler2D u_texture;
                uniform vec3 u_cameraPos;
                uniform vec3 u_lightPos;
                uniform vec3 u_lightColor;
                uniform float u_lightIntensity;
                uniform vec3 u_ambientColor;
                uniform vec3 u_fogColor;
                uniform float u_fogDensity;
                uniform vec4 u_tintColor;
                uniform float u_emissive;

                void main() {
                    vec4 texColor = texture2D(u_texture, v_texcoord);
                    texColor *= u_tintColor;

                    vec3 normal = length(v_normal) > 0.01 ? normalize(v_normal) : vec3(0.0, 1.0, 0.0);
                    vec3 lightDir = u_lightPos - v_worldPos;
                    float dist = length(lightDir);
                    lightDir = dist > 0.01 ? lightDir / dist : vec3(0.0, 0.0, 1.0);

                    // Broad, bright lighting attenuation
                    float attenuation = 1.0 / (1.0 + 0.03 * dist + 0.003 * dist * dist);
                    float diff = max(dot(normal, lightDir), 0.0);
                    diff = max(diff, 0.28); // Generous ambient bounce so reverse faces stay bright

                    vec3 diffuse = u_lightColor * diff * u_lightIntensity * attenuation;
                    vec3 lighting = u_ambientColor + diffuse + vec3(u_emissive);
                    vec3 litColor = texColor.rgb * lighting;

                    // Soft atmospheric fog
                    float viewDist = length(u_cameraPos - v_worldPos);
                    float fogFactor = clamp(exp(-viewDist * u_fogDensity), 0.0, 1.0);
                    vec3 finalColor = mix(u_fogColor, litColor, fogFactor);

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `;

            const gl = this.gl;
            const vShader = this.compileShader(gl.VERTEX_SHADER, vsSource);
            const fShader = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

            this.program = gl.createProgram();
            gl.attachShader(this.program, vShader);
            gl.attachShader(this.program, fShader);
            gl.linkProgram(this.program);

            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                throw new Error("Shader link error: " + gl.getProgramInfoLog(this.program));
            }

            this.attribs = {
                position: gl.getAttribLocation(this.program, "a_position"),
                normal: gl.getAttribLocation(this.program, "a_normal"),
                texcoord: gl.getAttribLocation(this.program, "a_texcoord")
            };

            this.uniforms = {
                mvp: gl.getUniformLocation(this.program, "u_mvp"),
                model: gl.getUniformLocation(this.program, "u_model"),
                texture: gl.getUniformLocation(this.program, "u_texture"),
                cameraPos: gl.getUniformLocation(this.program, "u_cameraPos"),
                lightPos: gl.getUniformLocation(this.program, "u_lightPos"),
                lightColor: gl.getUniformLocation(this.program, "u_lightColor"),
                lightIntensity: gl.getUniformLocation(this.program, "u_lightIntensity"),
                ambientColor: gl.getUniformLocation(this.program, "u_ambientColor"),
                fogColor: gl.getUniformLocation(this.program, "u_fogColor"),
                fogDensity: gl.getUniformLocation(this.program, "u_fogDensity"),
                tintColor: gl.getUniformLocation(this.program, "u_tintColor"),
                emissive: gl.getUniformLocation(this.program, "u_emissive")
            };
        }

        compileShader(type, src) {
            const gl = this.gl;
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error("Shader compile error: " + gl.getShaderInfoLog(s));
            }
            return s;
        }

        initTextures() {
            this.textures = {
                wall: this.createGLTexture(TextureGenerator.createWallTexture()),
                floor: this.createGLTexture(TextureGenerator.createFloorTexture()),
                ceiling: this.createGLTexture(TextureGenerator.createCeilingTexture()),
                door: this.createGLTexture(TextureGenerator.createDoorTexture()),
                monster: this.createGLTexture(TextureGenerator.createMonsterTexture())
            };
        }

        createGLTexture(image) {
            const gl = this.gl;
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
            return tex;
        }

        initMeshBuffers() {
            this.cubeMesh = this.buildCubeMesh();
            this.keyMesh = this.buildKeyMesh();
        }

        buildCubeMesh() {
            const gl = this.gl;
            const vertices = new Float32Array([
                // Front
                -0.5, -0.5,  0.5,   0,  0,  1,   0, 0,
                 0.5, -0.5,  0.5,   0,  0,  1,   1, 0,
                 0.5,  0.5,  0.5,   0,  0,  1,   1, 1,
                -0.5,  0.5,  0.5,   0,  0,  1,   0, 1,
                // Back
                -0.5, -0.5, -0.5,   0,  0, -1,   1, 0,
                -0.5,  0.5, -0.5,   0,  0, -1,   1, 1,
                 0.5,  0.5, -0.5,   0,  0, -1,   0, 1,
                 0.5, -0.5, -0.5,   0,  0, -1,   0, 0,
                // Top
                -0.5,  0.5, -0.5,   0,  1,  0,   0, 1,
                -0.5,  0.5,  0.5,   0,  1,  0,   0, 0,
                 0.5,  0.5,  0.5,   0,  1,  0,   1, 0,
                 0.5,  0.5, -0.5,   0,  1,  0,   1, 1,
                // Bottom
                -0.5, -0.5, -0.5,   0, -1,  0,   0, 0,
                 0.5, -0.5, -0.5,   0, -1,  0,   1, 0,
                 0.5, -0.5,  0.5,   0, -1,  0,   1, 1,
                -0.5, -0.5,  0.5,   0, -1,  0,   0, 1,
                // Right
                 0.5, -0.5, -0.5,   1,  0,  0,   1, 0,
                 0.5,  0.5, -0.5,   1,  0,  0,   1, 1,
                 0.5,  0.5,  0.5,   1,  0,  0,   0, 1,
                 0.5, -0.5,  0.5,   1,  0,  0,   0, 0,
                // Left
                -0.5, -0.5, -0.5,  -1,  0,  0,   0, 0,
                -0.5, -0.5,  0.5,  -1,  0,  0,   1, 0,
                -0.5,  0.5,  0.5,  -1,  0,  0,   1, 1,
                -0.5,  0.5, -0.5,  -1,  0,  0,   0, 1
            ]);

            const indices = new Uint16Array([
                0,  1,  2,    0,  2,  3,
                4,  5,  6,    4,  6,  7,
                8,  9,  10,   8,  10, 11,
                12, 13, 14,   12, 14, 15,
                16, 17, 18,   16, 18, 19,
                20, 21, 22,   20, 22, 23
            ]);

            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

            const ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

            return { vbo, ibo, count: indices.length };
        }

        buildKeyMesh() {
            const gl = this.gl;
            const verts = [];
            const inds = [];

            const addBox = (minX, minY, minZ, maxX, maxY, maxZ) => {
                const startIdx = verts.length / 8;
                const faces = [
                    [minX, minY, maxZ, 0, 0, 1, 0, 0], [maxX, minY, maxZ, 0, 0, 1, 1, 0],
                    [maxX, maxY, maxZ, 0, 0, 1, 1, 1], [minX, maxY, maxZ, 0, 0, 1, 0, 1],
                    [minX, minY, minZ, 0, 0, -1, 1, 0], [minX, maxY, minZ, 0, 0, -1, 1, 1],
                    [maxX, maxY, minZ, 0, 0, -1, 0, 1], [maxX, minY, minZ, 0, 0, -1, 0, 0],
                    [minX, maxY, minZ, 0, 1, 0, 0, 1], [minX, maxY, maxZ, 0, 1, 0, 0, 0],
                    [maxX, maxY, maxZ, 0, 1, 0, 1, 0], [maxX, maxY, minZ, 0, 1, 0, 1, 1],
                    [minX, minY, minZ, 0, -1, 0, 0, 0], [maxX, minY, minZ, 0, -1, 0, 1, 0],
                    [maxX, minY, maxZ, 0, -1, 0, 1, 1], [minX, minY, maxZ, 0, -1, 0, 0, 1],
                    [maxX, minY, minZ, 1, 0, 0, 1, 0], [maxX, maxY, minZ, 1, 0, 0, 1, 1],
                    [maxX, maxY, maxZ, 1, 0, 0, 0, 1], [maxX, minY, maxZ, 1, 0, 0, 0, 0],
                    [minX, minY, minZ, -1, 0, 0, 0, 0], [minX, minY, maxZ, -1, 0, 0, 1, 0],
                    [minX, maxY, maxZ, -1, 0, 0, 1, 1], [minX, maxY, minZ, -1, 0, 0, 0, 1]
                ];

                for (let f = 0; f < faces.length; f++) {
                    verts.push(...faces[f]);
                }

                for (let i = 0; i < 6; i++) {
                    const offset = startIdx + i * 4;
                    inds.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
                }
            };

            addBox(-0.04, -0.4, -0.04, 0.04, 0.25, 0.04);
            addBox(-0.2, 0.25, -0.04, 0.2, 0.29, 0.04);
            addBox(-0.2, 0.45, -0.04, 0.2, 0.49, 0.04);
            addBox(-0.2, 0.25, -0.04, -0.16, 0.49, 0.04);
            addBox(0.16, 0.25, -0.04, 0.2, 0.49, 0.04);
            addBox(0.04, -0.38, -0.03, 0.16, -0.32, 0.03);
            addBox(0.04, -0.26, -0.03, 0.13, -0.20, 0.03);

            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

            const ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(inds), gl.STATIC_DRAW);

            return { vbo, ibo, count: inds.length };
        }

        buildMazeBuffers(maze) {
            const gl = this.gl;
            const tileSize = maze.tileSize;
            const wallH = 3.2;

            const wallVerts = [];
            const wallInds = [];
            const floorVerts = [];
            const floorInds = [];
            const ceilVerts = [];
            const ceilInds = [];

            const addQuad = (vArray, iArray, p1, p2, p3, p4, normal, uvScale = 1) => {
                const start = vArray.length / 8;
                vArray.push(
                    p1[0], p1[1], p1[2], normal[0], normal[1], normal[2], 0, 0,
                    p2[0], p2[1], p2[2], normal[0], normal[1], normal[2], uvScale, 0,
                    p3[0], p3[1], p3[2], normal[0], normal[1], normal[2], uvScale, uvScale,
                    p4[0], p4[1], p4[2], normal[0], normal[1], normal[2], 0, uvScale
                );
                // Two-sided triangles: both CW and CCW so neither face can ever be culled
                iArray.push(
                    start, start + 1, start + 2,
                    start, start + 2, start + 3,
                    start, start + 2, start + 1,
                    start, start + 3, start + 2
                );
            };

            const grid = maze.grid;
            const rows = maze.rows;
            const cols = maze.cols;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x1 = c * tileSize;
                    const x2 = x1 + tileSize;
                    const z1 = r * tileSize;
                    const z2 = z1 + tileSize;

                    if (grid[r][c] === 0) {
                        addQuad(floorVerts, floorInds, [x1, 0, z1], [x2, 0, z1], [x2, 0, z2], [x1, 0, z2], [0, 1, 0], 1);
                        addQuad(ceilVerts, ceilInds, [x1, wallH, z2], [x2, wallH, z2], [x2, wallH, z1], [x1, wallH, z1], [0, -1, 0], 1);

                        if (r > 0 && grid[r - 1][c] === 1) {
                            addQuad(wallVerts, wallInds, [x2, 0, z1], [x1, 0, z1], [x1, wallH, z1], [x2, wallH, z1], [0, 0, 1], 1);
                        }
                        if (r < rows - 1 && grid[r + 1][c] === 1) {
                            addQuad(wallVerts, wallInds, [x1, 0, z2], [x2, 0, z2], [x2, wallH, z2], [x1, wallH, z2], [0, 0, -1], 1);
                        }
                        if (c > 0 && grid[r][c - 1] === 1) {
                            addQuad(wallVerts, wallInds, [x1, 0, z1], [x1, 0, z2], [x1, wallH, z2], [x1, wallH, z1], [1, 0, 0], 1);
                        }
                        if (c < cols - 1 && grid[r][c + 1] === 1) {
                            addQuad(wallVerts, wallInds, [x2, 0, z2], [x2, 0, z1], [x2, wallH, z1], [x2, wallH, z2], [-1, 0, 0], 1);
                        }
                    }
                }
            }

            const createVBO = (vData, iData) => {
                const vbo = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vData), gl.STATIC_DRAW);

                const ibo = gl.createBuffer();
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(iData), gl.STATIC_DRAW);
                return { vbo, ibo, count: iData.length };
            };

            this.wallMesh = createVBO(wallVerts, wallInds);
            this.floorMesh = createVBO(floorVerts, floorInds);
            this.ceilMesh = createVBO(ceilVerts, ceilInds);
        }

        beginFrame(cameraPos, cameraYaw, lightFlicker) {
            const gl = this.gl;
            this.resize();

            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE); // No backface culling to prevent missing geometry

            // Warm dungeon clear color
            gl.clearColor(0.12, 0.10, 0.08, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            gl.useProgram(this.program);

            const aspect = this.canvas.width / this.canvas.height;
            Mat4.perspective(this.projMatrix, 65 * Math.PI / 180, aspect, 0.1, 50.0);

            const lookX = cameraPos.x + Math.sin(cameraYaw);
            const lookY = cameraPos.y;
            const lookZ = cameraPos.z - Math.cos(cameraYaw);

            Mat4.lookAt(this.viewMatrix, [cameraPos.x, cameraPos.y, cameraPos.z], [lookX, lookY, lookZ], [0, 1, 0]);

            // Light position placed slightly ahead of the camera so facing walls are brightly lit
            const torchX = cameraPos.x + Math.sin(cameraYaw) * 0.4;
            const torchY = cameraPos.y + 0.1;
            const torchZ = cameraPos.z - Math.cos(cameraYaw) * 0.4;

            // Brighter, radiant Persona lighting
            const torchIntensity = 3.2 + lightFlicker;
            gl.uniform3f(this.uniforms.cameraPos, cameraPos.x, cameraPos.y, cameraPos.z);
            gl.uniform3f(this.uniforms.lightPos, torchX, torchY, torchZ);
            gl.uniform3f(this.uniforms.lightColor, 1.0, 0.94, 0.82);
            gl.uniform1f(this.uniforms.lightIntensity, torchIntensity);
            gl.uniform3f(this.uniforms.ambientColor, 0.45, 0.42, 0.38); // Warm Persona golden ambient
            gl.uniform3f(this.uniforms.fogColor, 0.08, 0.07, 0.06);
            gl.uniform1f(this.uniforms.fogDensity, 0.022); // Very gentle fog, clear long sightlines
        }

        drawMesh(mesh, texture, modelMatrix, tint = [1, 1, 1, 1], emissive = 0.0) {
            if (!mesh || mesh.count === 0) return;
            const gl = this.gl;
            Mat4.multiply(this.mvpMatrix, this.projMatrix, this.viewMatrix);
            Mat4.multiply(this.mvpMatrix, this.mvpMatrix, modelMatrix);

            gl.uniformMatrix4fv(this.uniforms.mvp, false, this.mvpMatrix);
            gl.uniformMatrix4fv(this.uniforms.model, false, modelMatrix);
            gl.uniform4fv(this.uniforms.tintColor, tint);
            gl.uniform1f(this.uniforms.emissive, emissive);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(this.uniforms.texture, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
            const stride = 8 * 4;
            gl.enableVertexAttribArray(this.attribs.position);
            gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, stride, 0);
            gl.enableVertexAttribArray(this.attribs.normal);
            gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, stride, 3 * 4);
            gl.enableVertexAttribArray(this.attribs.texcoord);
            gl.vertexAttribPointer(this.attribs.texcoord, 2, gl.FLOAT, false, stride, 6 * 4);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
            gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }

        drawMonster(monster, time) {
            const baseMat = Mat4.create();
            Mat4.identity(baseMat);
            Mat4.translate(baseMat, baseMat, [monster.curX, monster.curY, monster.curZ]);
            Mat4.rotateY(baseMat, baseMat, monster.curYaw);

            const isChasing = monster.state === "CHASE";
            const walkSpeed = isChasing ? 12 : 6;
            const legSwing = Math.sin(time * walkSpeed) * 0.45;
            const bodyBob = Math.abs(Math.cos(time * walkSpeed)) * 0.08;

            const drawBox = (pos, size, rot = [0, 0, 0], tint = [1, 1, 1, 1], emissive = 0) => {
                const m = Mat4.create();
                Mat4.identity(m);
                Mat4.multiply(m, baseMat, m);
                Mat4.translate(m, m, [pos[0], pos[1] + bodyBob, pos[2]]);
                if (rot[1]) Mat4.rotateY(m, m, rot[1]);
                if (rot[0]) Mat4.rotateX(m, m, rot[0]);
                if (rot[2]) Mat4.rotateZ(m, m, rot[2]);
                Mat4.scale(m, m, size);
                this.drawMesh(this.cubeMesh, this.textures.monster, m, tint, emissive);
            };

            // Torso
            drawBox([0, 1.4, 0], [0.9, 1.1, 1.4], [-0.15, 0, 0]);
            // Spiny back
            drawBox([0, 2.05, -0.1], [0.12, 0.35, 1.1], [-0.15, 0, 0], [0.8, 0.2, 0.2, 1]);
            // Neck
            drawBox([0, 1.85, 0.65], [0.65, 0.65, 0.8], [0.35, 0, 0]);
            // Head
            drawBox([0, 2.1, 1.15], [0.7, 0.6, 1.0], [0.1, 0, 0]);

            // Jaw
            const jawOpen = isChasing ? 0.35 + Math.sin(time * 14) * 0.15 : 0.08;
            drawBox([0, 1.75 - jawOpen * 0.5, 1.2], [0.55, 0.2, 0.85], [jawOpen, 0, 0]);

            // Glowing Eyes
            const eyeGlow = isChasing ? 1.0 : 0.7;
            drawBox([-0.36, 2.25, 1.3], [0.1, 0.1, 0.18], [0, 0, 0], [1, 0.1, 0.1, 1], eyeGlow);
            drawBox([0.36, 2.25, 1.3], [0.1, 0.1, 0.18], [0, 0, 0], [1, 0.1, 0.1, 1], eyeGlow);

            // Legs
            drawBox([-0.55, 1.0 + Math.sin(legSwing) * 0.1, Math.cos(legSwing) * 0.35], [0.35, 0.8, 0.45], [legSwing, 0, 0]);
            drawBox([-0.55, 0.35, -0.1 + Math.cos(legSwing) * 0.35], [0.28, 0.7, 0.35], [-legSwing * 0.8, 0, 0]);
            drawBox([-0.55, 0.08, 0.1 + Math.cos(legSwing) * 0.35], [0.32, 0.15, 0.55], [0, 0, 0], [0.4, 0.4, 0.4, 1]);

            drawBox([0.55, 1.0 - Math.sin(legSwing) * 0.1, -Math.cos(legSwing) * 0.35], [0.35, 0.8, 0.45], [-legSwing, 0, 0]);
            drawBox([0.55, 0.35, -0.1 - Math.cos(legSwing) * 0.35], [0.28, 0.7, 0.35], [legSwing * 0.8, 0, 0]);
            drawBox([0.55, 0.08, 0.1 - Math.cos(legSwing) * 0.35], [0.32, 0.15, 0.55], [0, 0, 0], [0.4, 0.4, 0.4, 1]);

            // Arms
            const armReach = isChasing ? 0.6 : 0.2;
            drawBox([-0.48, 1.35, 0.65], [0.2, 0.2, 0.65], [armReach, -0.2, 0]);
            drawBox([0.48, 1.35, 0.65], [0.2, 0.2, 0.65], [armReach, 0.2, 0]);

            // Tail
            const tailWag = Math.sin(time * walkSpeed * 0.7) * 0.3;
            drawBox([tailWag * 0.3, 1.25, -0.9], [0.38, 0.38, 0.8], [0.2, tailWag, 0]);
            drawBox([tailWag * 0.8, 1.05, -1.6], [0.25, 0.25, 0.8], [0.3, tailWag * 1.5, 0]);
        }

        drawKey(key, time) {
            const m = Mat4.create();
            Mat4.identity(m);
            const bob = Math.sin(time * 2.5 + key.id) * 0.12;
            Mat4.translate(m, m, [key.x, key.y + bob, key.z]);
            Mat4.rotateY(m, m, time * 1.8 + key.id);
            Mat4.scale(m, m, [1.4, 1.4, 1.4]);

            this.drawMesh(this.keyMesh, this.textures.wall, m, key.color, 0.75);
        }

        drawExitGate(gate, time, keysCount) {
            const m = Mat4.create();
            Mat4.identity(m);
            Mat4.translate(m, m, [gate.x, gate.y, gate.z]);
            Mat4.rotateY(m, m, gate.yaw);

            const frameColor = [0.55, 0.58, 0.65, 1];
            const pL = Mat4.create();
            Mat4.translate(pL, m, [-1.6, 1.6, 0]);
            Mat4.scale(pL, pL, [0.4, 3.2, 0.5]);
            this.drawMesh(this.cubeMesh, this.textures.wall, pL, frameColor);

            const pR = Mat4.create();
            Mat4.translate(pR, m, [1.6, 1.6, 0]);
            Mat4.scale(pR, pR, [0.4, 3.2, 0.5]);
            this.drawMesh(this.cubeMesh, this.textures.wall, pR, frameColor);

            const pT = Mat4.create();
            Mat4.translate(pT, m, [0, 3.1, 0]);
            Mat4.scale(pT, pT, [3.6, 0.4, 0.5]);
            this.drawMesh(this.cubeMesh, this.textures.wall, pT, frameColor);

            const openOffset = gate.openProgress * 1.35;
            const doorLeft = Mat4.create();
            Mat4.translate(doorLeft, m, [-0.75 - openOffset, 1.45, 0]);
            Mat4.scale(doorLeft, doorLeft, [1.4, 2.9, 0.18]);
            this.drawMesh(this.cubeMesh, this.textures.door, doorLeft);

            const doorRight = Mat4.create();
            Mat4.translate(doorRight, m, [0.75 + openOffset, 1.45, 0]);
            Mat4.scale(doorRight, doorRight, [1.4, 2.9, 0.18]);
            this.drawMesh(this.cubeMesh, this.textures.door, doorRight);

            const socketColors = [
                [0.1, 0.9, 0.4, 1],
                [1.0, 0.7, 0.1, 1],
                [0.9, 0.1, 0.2, 1]
            ];

            for (let i = 0; i < 3; i++) {
                const sM = Mat4.create();
                Mat4.translate(sM, m, [-0.8 + i * 0.8, 2.9, 0.28]);
                Mat4.scale(sM, sM, [0.22, 0.22, 0.1]);
                const isLit = i < keysCount;
                const emissive = isLit ? 1.0 + Math.sin(time * 4 + i) * 0.3 : 0.1;
                const col = isLit ? socketColors[i] : [0.3, 0.3, 0.3, 1];
                this.drawMesh(this.cubeMesh, this.textures.wall, sM, col, emissive);
            }
        }
    }

    // ==========================================
    // 6. PROCEDURAL MAZE GENERATOR
    // ==========================================
    class DungeonMaze {
        constructor(rows = 21, cols = 21, tileSize = 3.6) {
            this.rows = rows % 2 === 0 ? rows + 1 : rows;
            this.cols = cols % 2 === 0 ? cols + 1 : cols;
            this.tileSize = tileSize;
            this.grid = [];
            this.explored = [];
            this.generate();
        }

        generate() {
            this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(1));
            this.explored = Array.from({ length: this.rows }, () => new Array(this.cols).fill(false));

            const stack = [];
            const startR = 1, startC = 1;
            this.grid[startR][startC] = 0;
            stack.push([startR, startC]);

            const dirs = [
                [-2, 0, -1, 0],
                [2, 0, 1, 0],
                [0, -2, 0, -1],
                [0, 2, 0, 1]
            ];

            while (stack.length > 0) {
                const [r, c] = stack[stack.length - 1];
                const neighbors = [];

                for (let i = dirs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                }

                for (const [dr, dc, wr, wc] of dirs) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr > 0 && nr < this.rows - 1 && nc > 0 && nc < this.cols - 1 && this.grid[nr][nc] === 1) {
                        neighbors.push([nr, nc, r + wr, c + wc]);
                    }
                }

                if (neighbors.length > 0) {
                    const [nextR, nextC, wallR, wallC] = neighbors[0];
                    this.grid[wallR][wallC] = 0;
                    this.grid[nextR][nextC] = 0;
                    stack.push([nextR, nextC]);
                } else {
                    stack.pop();
                }
            }

            for (let r = 2; r < this.rows - 2; r += 2) {
                for (let c = 2; c < this.cols - 2; c += 2) {
                    if (this.grid[r][c] === 1 && Math.random() < 0.22) {
                        this.grid[r][c] = 0;
                    }
                }
            }

            const openCells = [];
            for (let r = 1; r < this.rows - 1; r++) {
                for (let c = 1; c < this.cols - 1; c++) {
                    if (this.grid[r][c] === 0 && (r !== 1 || c !== 1)) {
                        openCells.push({ r, c, dist: Math.hypot(r - 1, c - 1) });
                    }
                }
            }

            openCells.sort((a, b) => b.dist - a.dist);

            const exitCell = openCells[0];
            this.exitGate = {
                r: exitCell.r,
                c: exitCell.c,
                x: exitCell.c * this.tileSize + this.tileSize / 2,
                y: 0,
                z: exitCell.r * this.tileSize + this.tileSize / 2,
                yaw: 0,
                openProgress: 0,
                isUnlocked: false
            };

            const keyQuadrants = [
                { minR: Math.floor(this.rows / 2), maxR: this.rows - 2, minC: 1, maxC: Math.floor(this.cols / 2) },
                { minR: 1, maxR: Math.floor(this.rows / 2), minC: Math.floor(this.cols / 2), maxC: this.cols - 2 },
                { minR: Math.floor(this.rows / 2), maxR: this.rows - 2, minC: Math.floor(this.cols / 2), maxC: this.cols - 2 }
            ];

            const keyData = [
                { name: "Kunci Zamrud", color: [0.1, 0.9, 0.4, 1] },
                { name: "Kunci Ambar", color: [1.0, 0.7, 0.1, 1] },
                { name: "Kunci Delima", color: [0.95, 0.15, 0.25, 1] }
            ];

            this.keys = [];
            keyQuadrants.forEach((quad, idx) => {
                const candidates = openCells.filter(cell =>
                    cell.r >= quad.minR && cell.r <= quad.maxR &&
                    cell.c >= quad.minC && cell.c <= quad.maxC &&
                    (cell.r !== exitCell.r || cell.c !== exitCell.c)
                );

                const picked = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : openCells[idx + 5];
                this.keys.push({
                    id: idx + 1,
                    name: keyData[idx].name,
                    color: keyData[idx].color,
                    r: picked.r,
                    c: picked.c,
                    x: picked.c * this.tileSize + this.tileSize / 2,
                    y: 1.0,
                    z: picked.r * this.tileSize + this.tileSize / 2,
                    collected: false
                });
            });

            const centerR = Math.floor(this.rows / 2);
            const centerC = Math.floor(this.cols / 2);
            let monsterR = centerR, monsterC = centerC;
            if (this.grid[monsterR][monsterC] === 1) {
                for (const cell of openCells) {
                    if (Math.hypot(cell.r - centerR, cell.c - centerC) < 4) {
                        monsterR = cell.r;
                        monsterC = cell.c;
                        break;
                    }
                }
            }

            this.monsterSpawn = {
                r: monsterR,
                c: monsterC,
                x: monsterC * this.tileSize + this.tileSize / 2,
                y: 0,
                z: monsterR * this.tileSize + this.tileSize / 2
            };
        }

        isWalkable(r, c) {
            if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
            return this.grid[r][c] === 0;
        }

        hasLineOfSight(r1, c1, r2, c2) {
            if (r1 !== r2 && c1 !== c2) return false;
            if (r1 === r2) {
                const minC = Math.min(c1, c2);
                const maxC = Math.max(c1, c2);
                for (let c = minC + 1; c < maxC; c++) {
                    if (this.grid[r1][c] === 1) return false;
                }
                return true;
            } else {
                const minR = Math.min(r1, r2);
                const maxR = Math.max(r1, r2);
                for (let r = minR + 1; r < maxR; r++) {
                    if (this.grid[r][c1] === 1) return false;
                }
                return true;
            }
        }

        findPath(startR, startC, targetR, targetC) {
            if (startR === targetR && startC === targetC) return [];
            if (this.grid[targetR]?.[targetC] === 1) return [];

            const queue = [[startR, startC]];
            const visited = Array.from({ length: this.rows }, () => new Array(this.cols).fill(false));
            const parent = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));

            visited[startR][startC] = true;
            const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

            while (queue.length > 0) {
                const [r, c] = queue.shift();
                if (r === targetR && c === targetC) {
                    const path = [];
                    let curr = [targetR, targetC];
                    while (curr && (curr[0] !== startR || curr[1] !== startC)) {
                        path.push(curr);
                        curr = parent[curr[0]][curr[1]];
                    }
                    return path.reverse();
                }

                for (const [dr, dc] of neighbors) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && !visited[nr][nc] && this.grid[nr][nc] === 0) {
                        visited[nr][nc] = true;
                        parent[nr][nc] = [r, c];
                        queue.push([nr, nc]);
                    }
                }
            }
            return [];
        }
    }

    // ==========================================
    // 7. MONSTER AI CONTROLLER
    // ==========================================
    class MonsterAI {
        constructor(maze) {
            this.maze = maze;
            this.r = maze.monsterSpawn.r;
            this.c = maze.monsterSpawn.c;
            this.facing = DIR_SOUTH;

            this.prevR = this.r;
            this.prevC = this.c;
            this.prevYaw = DIR_ANGLES[this.facing];

            this.curX = this.c * maze.tileSize + maze.tileSize / 2;
            this.curY = 0;
            this.curZ = this.r * maze.tileSize + maze.tileSize / 2;
            this.curYaw = this.prevYaw;

            this.state = "DORMANT";
            this.stateTimer = 5.0;
            this.stepCooldown = 0.8;
            this.currentPath = [];
            this.roarCooldown = 0;

            this.isAnimating = false;
            this.animProgress = 1.0;
            this.animDuration = 0.22;
        }

        update(dt, player, time) {
            if (this.roarCooldown > 0) this.roarCooldown -= dt;

            if (this.isAnimating) {
                this.animProgress = Math.min(1.0, this.animProgress + dt / this.animDuration);
                const t = this.animProgress;
                const ease = 1 - Math.pow(1 - t, 3);

                const startX = this.prevC * this.maze.tileSize + this.maze.tileSize / 2;
                const startZ = this.prevR * this.maze.tileSize + this.maze.tileSize / 2;
                const targetX = this.c * this.maze.tileSize + this.maze.tileSize / 2;
                const targetZ = this.r * this.maze.tileSize + this.maze.tileSize / 2;

                this.curX = startX + (targetX - startX) * ease;
                this.curZ = startZ + (targetZ - startZ) * ease;

                let angleDiff = DIR_ANGLES[this.facing] - this.prevYaw;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                this.curYaw = this.prevYaw + angleDiff * ease;

                if (this.animProgress >= 1.0) {
                    this.isAnimating = false;
                    this.prevR = this.r;
                    this.prevC = this.c;
                    this.prevYaw = DIR_ANGLES[this.facing];
                }
            }

            const distTiles = Math.hypot(player.r - this.r, player.c - this.c);
            const hasLOS = distTiles < 12 && this.maze.hasLineOfSight(this.r, this.c, player.r, player.c);
            const canHear = distTiles < 6.0 && player.isMoving;

            switch (this.state) {
                case "DORMANT":
                    this.stateTimer -= dt;
                    if (this.stateTimer <= 0 || canHear || hasLOS) {
                        this.state = "PATROL";
                    }
                    break;

                case "PATROL":
                    if (hasLOS) {
                        this.triggerChase(player, distTiles);
                    } else if (canHear) {
                        this.state = "SUSPICIOUS";
                        this.currentPath = this.maze.findPath(this.r, this.c, player.r, player.c);
                    } else if (this.currentPath.length === 0) {
                        this.pickRandomPatrolPoint();
                    }
                    break;

                case "SUSPICIOUS":
                    if (hasLOS) {
                        this.triggerChase(player, distTiles);
                    } else if (this.currentPath.length === 0) {
                        this.state = "SEARCH";
                        this.stateTimer = 4.0;
                    }
                    break;

                case "CHASE":
                    this.currentPath = this.maze.findPath(this.r, this.c, player.r, player.c);
                    if (!hasLOS && distTiles > 9) {
                        this.state = "SEARCH";
                        this.stateTimer = 4.0;
                    }
                    break;

                case "SEARCH":
                    this.stateTimer -= dt;
                    if (hasLOS) {
                        this.triggerChase(player, distTiles);
                    } else if (this.stateTimer <= 0) {
                        this.state = "PATROL";
                    }
                    break;
            }

            this.stepCooldown -= dt;
            const stepInterval = (this.state === "CHASE") ? 0.44 : 0.75;

            if (this.state !== "DORMANT" && this.stepCooldown <= 0 && !this.isAnimating) {
                this.stepCooldown = stepInterval;
                this.executeNextStep(player, distTiles);
            }
        }

        executeNextStep(player, distTiles) {
            if (this.currentPath.length > 0) {
                const next = this.currentPath.shift();
                const nextR = next[0];
                const nextC = next[1];

                const dr = nextR - this.r;
                const dc = nextC - this.c;

                if (dr === -1) this.facing = DIR_NORTH;
                else if (dr === 1) this.facing = DIR_SOUTH;
                else if (dc === -1) this.facing = DIR_WEST;
                else if (dc === 1) this.facing = DIR_EAST;

                this.prevR = this.r;
                this.prevC = this.c;
                this.prevYaw = this.curYaw;

                this.r = nextR;
                this.c = nextC;

                this.isAnimating = true;
                this.animProgress = 0;
                this.animDuration = (this.state === "CHASE") ? 0.20 : 0.32;

                const angleDiff = DIR_ANGLES[this.facing] - DIR_ANGLES[player.facing];
                audio.playMonsterFootstep(distTiles, angleDiff);
            }
        }

        triggerChase(player, distTiles) {
            if (this.state !== "CHASE" && this.roarCooldown <= 0) {
                audio.playMonsterRoar(distTiles);
                this.roarCooldown = 6.0;
            }
            this.state = "CHASE";
        }

        pickRandomPatrolPoint() {
            const candidates = [];
            for (let r = 1; r < this.maze.rows - 1; r += 2) {
                for (let c = 1; c < this.maze.cols - 1; c += 2) {
                    if (this.maze.grid[r][c] === 0 && (r !== this.r || c !== this.c)) {
                        candidates.push([r, c]);
                    }
                }
            }
            if (candidates.length > 0) {
                const target = candidates[Math.floor(Math.random() * candidates.length)];
                this.currentPath = this.maze.findPath(this.r, this.c, target[0], target[1]);
            }
        }
    }

    // ==========================================
    // 8. PLAYER CONTROLLER
    // - W / Panah Atas : Maju 1 Petak ke Depan
    // - A / Panah Kiri / Q : Menoleh Kiri (90°)
    // - D / Panah Kanan / E : Menoleh Kanan (90°)
    // - S / Panah Bawah : Putar Balik ke Belakang (180°)
    // ==========================================
    class PlayerController {
        constructor(maze) {
            this.maze = maze;
            this.r = 1;
            this.c = 1;
            this.facing = DIR_NORTH;

            this.prevR = this.r;
            this.prevC = this.c;
            this.prevYaw = DIR_ANGLES[this.facing];

            this.curX = this.c * maze.tileSize + maze.tileSize / 2;
            this.curY = 1.45;
            this.curZ = this.r * maze.tileSize + maze.tileSize / 2;
            this.curYaw = this.prevYaw;

            this.isAnimating = false;
            this.animProgress = 1.0;
            this.animDuration = 0.16;
            this.isBump = false;
            this.isMoving = false;

            this.revealSurroundings();
            this.initListeners();
        }

        revealSurroundings() {
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const rr = this.r + dr;
                    const cc = this.c + dc;
                    if (rr >= 0 && rr < this.maze.rows && cc >= 0 && cc < this.maze.cols) {
                        this.maze.explored[rr][cc] = true;
                    }
                }
            }
        }

        initListeners() {
            window.addEventListener("keydown", (e) => {
                if (e.repeat) return;

                // W / Panah Atas: Maju langsung ke depan
                if (e.code === "KeyW" || e.code === "ArrowUp") {
                    this.tryStepForward();
                }
                // A / Panah Kiri / Q: Menoleh 90° ke Kiri
                else if (e.code === "KeyA" || e.code === "ArrowLeft" || e.code === "KeyQ") {
                    this.turnRelative(-1);
                }
                // D / Panah Kanan / E: Menoleh 90° ke Kanan
                else if (e.code === "KeyD" || e.code === "ArrowRight" || e.code === "KeyE") {
                    this.turnRelative(1);
                }
                // S / Panah Bawah: Putar Balik 180° ke Belakang
                else if (e.code === "KeyS" || e.code === "ArrowDown") {
                    this.turnRelative(2);
                }

                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
                    e.preventDefault();
                }
            });

            // Touch Control bindings
            const bindTouchBtn = (id, action) => {
                const btn = $(id);
                if (!btn) return;
                btn.addEventListener("touchstart", (e) => { e.preventDefault(); action(); }, { passive: false });
                btn.addEventListener("click", (e) => { e.preventDefault(); action(); });
            };

            bindTouchBtn("btnUp", () => this.tryStepForward());
            bindTouchBtn("btnLeft", () => this.turnRelative(-1));
            bindTouchBtn("btnRight", () => this.turnRelative(1));
            bindTouchBtn("btnDown", () => this.turnRelative(2));
            bindTouchBtn("btnTurnLeft", () => this.turnRelative(-1));
            bindTouchBtn("btnTurnRight", () => this.turnRelative(1));
        }

        turnRelative(delta) {
            if (this.isAnimating) return;
            audio.resume();
            audio.playTurnSound();

            this.prevYaw = this.curYaw;
            this.facing = (this.facing + delta + 4) % 4;

            this.isAnimating = true;
            this.isBump = false;
            this.animProgress = 0;
            this.animDuration = 0.14;
            this.isMoving = false;
        }

        tryStepForward() {
            if (this.isAnimating) return;
            audio.resume();

            const [dr, dc] = DIR_DELTAS[this.facing];
            const nextR = this.r + dr;
            const nextC = this.c + dc;

            if (this.maze.isWalkable(nextR, nextC)) {
                this.prevR = this.r;
                this.prevC = this.c;
                this.r = nextR;
                this.c = nextC;

                this.isAnimating = true;
                this.isBump = false;
                this.animProgress = 0;
                this.animDuration = 0.16;
                this.isMoving = true;

                audio.playStepSound();
            } else {
                this.isAnimating = true;
                this.isBump = true;
                this.animProgress = 0;
                this.animDuration = 0.12;
                this.isMoving = false;
                audio.playBump();
            }
        }

        update(dt) {
            if (this.isAnimating) {
                this.animProgress = Math.min(1.0, this.animProgress + dt / this.animDuration);
                const t = this.animProgress;
                const ease = 1 - Math.pow(1 - t, 3);

                let targetYaw = DIR_ANGLES[this.facing];
                let angleDiff = targetYaw - this.prevYaw;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                this.curYaw = this.prevYaw + angleDiff * ease;

                const startX = this.prevC * this.maze.tileSize + this.maze.tileSize / 2;
                const startZ = this.prevR * this.maze.tileSize + this.maze.tileSize / 2;
                const targetX = this.c * this.maze.tileSize + this.maze.tileSize / 2;
                const targetZ = this.r * this.maze.tileSize + this.maze.tileSize / 2;

                if (this.isBump) {
                    const bounceFactor = Math.sin(t * Math.PI) * 0.22;
                    const [dr, dc] = DIR_DELTAS[this.facing];
                    this.curX = startX + dc * this.maze.tileSize * bounceFactor;
                    this.curZ = startZ + dr * this.maze.tileSize * bounceFactor;
                    this.curY = 1.45;
                } else {
                    this.curX = startX + (targetX - startX) * ease;
                    this.curZ = startZ + (targetZ - startZ) * ease;
                    this.curY = 1.45 + Math.sin(t * Math.PI) * 0.05;
                }

                if (this.animProgress >= 1.0) {
                    this.isAnimating = false;
                    this.isBump = false;
                    this.isMoving = false;
                    this.prevR = this.r;
                    this.prevC = this.c;
                    this.prevYaw = DIR_ANGLES[this.facing];
                }
            } else {
                this.curY = 1.45;
            }

            this.revealSurroundings();
        }
    }

    // ==========================================
    // 9. MAIN GAME ORCHESTRATOR
    // ==========================================
    class DungeonGame {
        constructor() {
            this.renderer = new DungeonRenderer(canvas);
            this.maze = null;
            this.monster = null;
            this.player = null;

            this.state = "START";
            this.keysCollected = 0;
            this.survivalSeconds = 0;
            this.survivalInterval = null;
            this.lastFrameTime = performance.now();

            this.toastTimer = null;
            this.heartbeatTimer = 0;
            this.currentBPM = 72;

            this.bestTime = localStorage.getItem(BEST_TIME_KEY) || null;
            this.initEvents();

            this.buildDungeon();
        }

        buildDungeon() {
            this.maze = new DungeonMaze(21, 21, 3.6);
            this.renderer.buildMazeBuffers(this.maze);
            this.monster = new MonsterAI(this.maze);
            this.player = new PlayerController(this.maze);
            this.keysCollected = 0;
            this.updateKeysUI();

            const distTiles = Math.hypot(this.player.r - this.monster.r, this.player.c - this.monster.c);
            this.updateMonsterStatus(distTiles);
            playerCoordsEl.textContent = `Labirin [Baris: ${this.player.r}, Kolom: ${this.player.c}]`;
        }

        startNewGame() {
            audio.init();
            audio.resume();

            this.buildDungeon();
            this.survivalSeconds = 0;
            this.state = "PLAYING";

            this.hideAllModals();
            this.showToast("⚔️ Anomalous Maze Terbuka! W: Maju, A/D: Menoleh, S: Putar Balik.");

            if (this.survivalInterval) clearInterval(this.survivalInterval);
            this.survivalInterval = setInterval(() => {
                if (this.state === "PLAYING") {
                    this.survivalSeconds++;
                    survivalTimerEl.textContent = this.formatTime(this.survivalSeconds);
                }
            }, 1000);
        }

        initEvents() {
            startGameBtn.addEventListener("click", () => this.startNewGame());
            restartBtn.addEventListener("click", () => this.startNewGame());
            playAgainBtn.addEventListener("click", () => this.startNewGame());
            quickRestartBtn.addEventListener("click", () => this.startNewGame());

            muteButton.addEventListener("click", () => {
                audio.init();
                const muted = audio.toggleMute();
                muteButton.textContent = muted ? "🔇 Suara OFF" : "🔊 Suara ON";
                muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
            });

            mapToggleBtn.addEventListener("click", () => {
                minimapOverlay.classList.toggle("hidden");
            });

            if (fullscreenBtn) {
                fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
            }

            const onFullscreenChange = () => this.updateFullscreenUI();
            document.addEventListener("fullscreenchange", onFullscreenChange);
            document.addEventListener("webkitfullscreenchange", onFullscreenChange);
            document.addEventListener("mozfullscreenchange", onFullscreenChange);
            document.addEventListener("MSFullscreenChange", onFullscreenChange);

            howToPlayBtn.addEventListener("click", () => {
                alert("CARA BERMAIN ANOMALOUS MAZE: 1981:\n\n• W (atau Panah Atas) : Maju 1 petak ke depan\n• A (atau Panah Kiri) : Menoleh ke Kiri (90°)\n• D (atau Panah Kanan) : Menoleh ke Kanan (90°)\n• S (atau Panah Bawah) : Putar Balik ke Belakang (180°)\n• M : Buka / Tutup Peta Radar\n• F : Mode Layar Penuh (Fullscreen)\n• Kumpulkan 3 Kunci Kuno lalu cari Gerbang Keluar!");
            });

            window.addEventListener("keydown", (e) => {
                if (e.code === "KeyM") {
                    minimapOverlay.classList.toggle("hidden");
                }
                if (e.code === "KeyF" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    this.toggleFullscreen();
                }
                if (this.state === "START" && (e.code === "Enter" || e.code === "Space")) {
                    this.startNewGame();
                }
                if (this.state === "GAMEOVER" && (e.code === "Enter" || e.code === "Space")) {
                    this.startNewGame();
                }
                if (this.state === "VICTORY" && (e.code === "Enter" || e.code === "Space")) {
                    this.startNewGame();
                }
            });
        }

        toggleFullscreen() {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

            if (!isFull) {
                const target = gameShell || document.documentElement;
                if (target.requestFullscreen) {
                    target.requestFullscreen().catch(err => {
                        console.warn("Fullscreen request error:", err);
                        if (gameShell) gameShell.classList.toggle("is-fullscreen");
                        this.updateFullscreenUI();
                    });
                } else if (target.webkitRequestFullscreen) {
                    target.webkitRequestFullscreen();
                } else if (target.mozRequestFullScreen) {
                    target.mozRequestFullScreen();
                } else if (target.msRequestFullscreen) {
                    target.msRequestFullscreen();
                } else {
                    if (gameShell) gameShell.classList.toggle("is-fullscreen");
                    this.updateFullscreenUI();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(err => console.warn(err));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
                if (gameShell) gameShell.classList.remove("is-fullscreen");
                this.updateFullscreenUI();
            }
        }

        updateFullscreenUI() {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || (gameShell && gameShell.classList.contains("is-fullscreen")));
            if (fullscreenBtn) {
                fullscreenBtn.textContent = isFull ? "🗗 Keluar Penuh" : "⛶ Layar Penuh";
                fullscreenBtn.setAttribute("aria-pressed", isFull ? "true" : "false");
                fullscreenBtn.title = isFull ? "Keluar Layar Penuh [F]" : "Layar Penuh [F]";
            }
            if (this.renderer) {
                setTimeout(() => this.renderer.resize(), 60);
                setTimeout(() => this.renderer.resize(), 200);
            }
        }

        hideAllModals() {
            startScreen.classList.add("hidden");
            gameOverScreen.classList.add("hidden");
            victoryScreen.classList.add("hidden");
        }

        formatTime(sec) {
            const m = Math.floor(sec / 60).toString().padStart(2, "0");
            const s = (sec % 60).toString().padStart(2, "0");
            return `${m}:${s}`;
        }

        showToast(msg) {
            if (this.toastTimer) clearTimeout(this.toastTimer);
            gameToast.textContent = msg;
            gameToast.classList.add("visible");
            this.toastTimer = setTimeout(() => {
                gameToast.classList.remove("visible");
            }, 3200);
        }

        updateKeysUI() {
            keySlot1.classList.toggle("collected", this.keysCollected >= 1);
            keySlot2.classList.toggle("collected", this.keysCollected >= 2);
            keySlot3.classList.toggle("collected", this.keysCollected >= 3);
            keysCountLabel.textContent = `KUNCI LABIRIN (${this.keysCollected}/3)`;
        }

        updateMonsterStatus(distTiles) {
            monsterTicker.className = "monster-ticker";
            let statusStr = "MONSTER SEDANG MENUNGGU DI KEGELAPAN...";
            let pillText = "WASPADA";
            let pillDanger = false;
            let distText = "JAUH";

            if (distTiles < 3.0) distText = "SANGAT DEKAT!";
            else if (distTiles < 7.0) distText = "DEKAT";
            else if (distTiles < 13.0) distText = "SEDANG";

            switch (this.monster.state) {
                case "DORMANT":
                    statusStr = "REX LIES IN WAIT · MONSTER MASIH TERLELAP...";
                    break;
                case "PATROL":
                    if (distTiles < 7) {
                        monsterTicker.classList.add("approaching");
                        statusStr = "FOOTSTEPS APPROACHING · TERDENGAR LANGKAH KAKI MENDEKAT!";
                        pillText = "BAHAYA";
                        pillDanger = true;
                    } else {
                        statusStr = "REX IS HUNTING · MONSTER SEDANG MENCARI MANGSA...";
                    }
                    break;
                case "SUSPICIOUS":
                    monsterTicker.classList.add("searching");
                    statusStr = "HE HEARD YOU · MONSTER MENDENGAR SUARA LANGKAHMU!";
                    pillText = "TERDETEKSI";
                    pillDanger = true;
                    break;
                case "CHASE":
                    monsterTicker.classList.add("chasing");
                    statusStr = "REX HAS SEEN YOU! RUN! · MONSTER MELIHATMU! LARI!!";
                    pillText = "DIKEJAR MONSTER!";
                    pillDanger = true;
                    break;
                case "SEARCH":
                    monsterTicker.classList.add("searching");
                    statusStr = "HE LOST YOUR SCENT · MONSTER KEHILANGAN JEJAKMU...";
                    break;
            }

            tickerText.textContent = statusStr;
            playerStatusEl.textContent = pillText;
            playerStatusEl.className = pillDanger ? "status-pill danger" : "status-pill";

            const facingName = DIR_NAMES[this.player.facing];
            playerFacingText.textContent = facingName;
            if (hudFacingText) hudFacingText.textContent = facingName;
            monsterDistanceText.textContent = distText;

            if (this.monster.state === "CHASE") {
                this.currentBPM = 160;
            } else {
                const normDist = Math.max(0, Math.min(1, distTiles / 16.0));
                this.currentBPM = Math.floor(65 + (1.0 - normDist) * 75);
            }

            bpmValue.textContent = this.currentBPM;
            heartbeatCard.classList.toggle("danger", this.currentBPM > 110);

            vignetteOverlay.className = "vignette-overlay";
            if (this.monster.state === "CHASE") {
                vignetteOverlay.classList.add("danger-chase");
            } else if (distTiles < 6.0) {
                vignetteOverlay.classList.add("danger-near");
            }
        }

        drawPersonaRadar() {
            if (!this.maze || !this.player) return;
            const ctx = minimapCtx;
            const w = minimapCanvas.width;
            const h = minimapCanvas.height;
            ctx.clearRect(0, 0, w, h);

            ctx.fillStyle = "rgba(10, 16, 12, 0.88)";
            ctx.fillRect(0, 0, w, h);

            const viewRadius = 3;
            const tileSize = w / (viewRadius * 2 + 1);

            const pr = this.player.r;
            const pc = this.player.c;

            ctx.lineWidth = 1.8;
            for (let dr = -viewRadius; dr <= viewRadius; dr++) {
                for (let dc = -viewRadius; dc <= viewRadius; dc++) {
                    const r = pr + dr;
                    const c = pc + dc;
                    const sx = (dc + viewRadius) * tileSize;
                    const sy = (dr + viewRadius) * tileSize;

                    if (r >= 0 && r < this.maze.rows && c >= 0 && c < this.maze.cols && this.maze.explored[r][c]) {
                        if (this.maze.grid[r][c] === 0) {
                            ctx.fillStyle = "rgba(20, 35, 25, 0.6)";
                            ctx.fillRect(sx, sy, tileSize, tileSize);

                            ctx.strokeStyle = "#22c55e";

                            if (r === 0 || this.maze.grid[r - 1][c] === 1) {
                                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + tileSize, sy); ctx.stroke();
                            }
                            if (r === this.maze.rows - 1 || this.maze.grid[r + 1][c] === 1) {
                                ctx.beginPath(); ctx.moveTo(sx, sy + tileSize); ctx.lineTo(sx + tileSize, sy + tileSize); ctx.stroke();
                            }
                            if (c === 0 || this.maze.grid[r][c - 1] === 1) {
                                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + tileSize); ctx.stroke();
                            }
                            if (c === this.maze.cols - 1 || this.maze.grid[r][c + 1] === 1) {
                                ctx.beginPath(); ctx.moveTo(sx + tileSize, sy); ctx.lineTo(sx + tileSize, sy + tileSize); ctx.stroke();
                            }
                        }
                    }
                }
            }

            this.maze.keys.forEach(k => {
                if (!k.collected && this.maze.explored[k.r][k.c]) {
                    const dr = k.r - pr;
                    const dc = k.c - pc;
                    if (Math.abs(dr) <= viewRadius && Math.abs(dc) <= viewRadius) {
                        const kx = (dc + viewRadius + 0.5) * tileSize;
                        const ky = (dr + viewRadius + 0.5) * tileSize;
                        ctx.fillStyle = "#f59e0b";
                        ctx.beginPath();
                        ctx.arc(kx, ky, tileSize * 0.28, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });

            const gateR = this.maze.exitGate.r;
            const gateC = this.maze.exitGate.c;
            if (this.maze.explored[gateR][gateC]) {
                const dr = gateR - pr;
                const dc = gateC - pc;
                if (Math.abs(dr) <= viewRadius && Math.abs(dc) <= viewRadius) {
                    const gx = (dc + viewRadius) * tileSize;
                    const gy = (dr + viewRadius) * tileSize;
                    ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
                    ctx.fillRect(gx + 2, gy + 2, tileSize - 4, tileSize - 4);
                }
            }

            const centerX = (viewRadius + 0.5) * tileSize;
            const centerY = (viewRadius + 0.5) * tileSize;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(this.player.facing * (Math.PI / 2));

            const arrowSize = tileSize * 0.42;
            ctx.fillStyle = "#f97316";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.2;

            ctx.beginPath();
            ctx.moveTo(0, -arrowSize);
            ctx.lineTo(-arrowSize * 0.55, arrowSize * 0.6);
            ctx.lineTo(0, arrowSize * 0.25);
            ctx.lineTo(arrowSize * 0.55, arrowSize * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        triggerGameOver() {
            this.state = "GAMEOVER";
            audio.playJumpscare();
            goKeysFound.textContent = `${this.keysCollected} / 3`;
            goSurvivalTime.textContent = this.formatTime(this.survivalSeconds);
            gameOverScreen.classList.remove("hidden");
        }

        triggerVictory() {
            this.state = "VICTORY";
            audio.playVictory();
            const timeStr = this.formatTime(this.survivalSeconds);
            vicTime.textContent = timeStr;

            if (!this.bestTime || this.survivalSeconds < parseInt(this.bestTime)) {
                this.bestTime = this.survivalSeconds.toString();
                localStorage.setItem(BEST_TIME_KEY, this.bestTime);
            }
            vicBestTime.textContent = this.formatTime(parseInt(this.bestTime));

            victoryScreen.classList.remove("hidden");
        }

        run() {
            const loop = (now) => {
                try {
                    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
                    this.lastFrameTime = now;
                    const timeSec = now / 1000;

                    if (this.state === "PLAYING") {
                        this.player.update(dt);
                        this.monster.update(dt, this.player, timeSec);

                        // Key collection check
                        this.maze.keys.forEach(k => {
                            if (!k.collected && k.r === this.player.r && k.c === this.player.c) {
                                k.collected = true;
                                this.keysCollected++;
                                audio.playKeyPickup();
                                this.updateKeysUI();
                                this.showToast(`🗝️ ${k.name} Berhasil Didapatkan! (${this.keysCollected}/3)`);
                            }
                        });

                        // Exit gate check
                        const gate = this.maze.exitGate;
                        const isAdjacentToGate = Math.abs(this.player.r - gate.r) + Math.abs(this.player.c - gate.c) <= 1;

                        if (isAdjacentToGate) {
                            if (this.keysCollected >= 3) {
                                gate.openProgress = Math.min(1.0, gate.openProgress + dt * 1.5);
                                if (!gate.isUnlocked) {
                                    gate.isUnlocked = true;
                                    audio.playDoorUnlocked();
                                    this.showToast("🚪 Gerbang Keluar Terbuka! LARI MENUJU KEBEBASAN!");
                                }
                                if (gate.openProgress >= 0.85) {
                                    this.triggerVictory();
                                }
                            } else {
                                interactionPrompt.textContent = `Pintu Terkunci! Kumpulkan 3 Kunci Kuno (${this.keysCollected}/3)`;
                                interactionPrompt.classList.add("visible");
                            }
                        } else {
                            interactionPrompt.classList.remove("visible");
                        }

                        // Monster caught check
                        if (this.monster.r === this.player.r && this.monster.c === this.player.c) {
                            this.triggerGameOver();
                        }

                        const distTiles = Math.hypot(this.player.r - this.monster.r, this.player.c - this.monster.c);

                        // Heartbeat sound
                        this.heartbeatTimer -= dt;
                        if (this.heartbeatTimer <= 0) {
                            const beatInterval = 60.0 / this.currentBPM;
                            this.heartbeatTimer = beatInterval;
                            const vol = Math.max(0.08, Math.min(0.35, (16.0 - distTiles) / 16.0 * 0.35));
                            audio.playHeartbeatSound(vol);
                        }

                        this.updateMonsterStatus(distTiles);
                        playerCoordsEl.textContent = `Labirin [Baris: ${this.player.r}, Kolom: ${this.player.c}]`;

                        this.drawPersonaRadar();
                    } else if (this.state === "START") {
                        this.drawPersonaRadar();
                    }

                    // Render 3D Scene
                    if (this.maze && this.player) {
                        const flicker = Math.sin(timeSec * 16.0) * 0.08 + Math.sin(timeSec * 32.0) * 0.04;
                        this.renderer.beginFrame(
                            { x: this.player.curX, y: this.player.curY, z: this.player.curZ },
                            this.player.curYaw,
                            flicker
                        );

                        const identityMat = Mat4.create();
                        Mat4.identity(identityMat);
                        this.renderer.drawMesh(this.renderer.wallMesh, this.renderer.textures.wall, identityMat);
                        this.renderer.drawMesh(this.renderer.floorMesh, this.renderer.textures.floor, identityMat);
                        this.renderer.drawMesh(this.renderer.ceilMesh, this.renderer.textures.ceiling, identityMat);

                        this.maze.keys.forEach(k => {
                            if (!k.collected) this.renderer.drawKey(k, timeSec);
                        });

                        this.renderer.drawExitGate(this.maze.exitGate, timeSec, this.keysCollected);

                        if (this.monster) {
                            this.renderer.drawMonster(this.monster, timeSec);
                        }
                    }
                } catch (err) {
                    console.error("Game loop error:", err);
                    const errDiv = $("debugError");
                    if (errDiv) {
                        errDiv.style.display = "block";
                        errDiv.textContent = "Loop Error: " + err.message;
                    }
                }

                requestAnimationFrame(loop);
            };

            requestAnimationFrame(loop);
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        const game = new DungeonGame();
        game.run();
    });
})();
