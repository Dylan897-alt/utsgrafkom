// script.js — Main animation loop.
// Menggabungkan Sprout (kiri) dan Spike (kanan) dalam satu canvas.
// Semua logika animasi & state game Spike ada di sini.
// Kamera bebas: drag kiri = orbit, drag kanan = pan, scroll = zoom.

function main() {
    var CANVAS = document.getElementById('mycanvas');
    CANVAS.width  = window.innerWidth;
    CANVAS.height = window.innerHeight;

    var GL = CANVAS.getContext('webgl', { antialias: true });
    if (!GL) { alert('WebGL tidak didukung'); return; }
    if (!GL.getExtension('OES_element_index_uint')) { alert('OES_element_index_uint tidak didukung'); return; }
    GL.getExtension('OES_standard_derivatives');

    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearDepth(1.0);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

    // ---- Proyeksi ----
    var PROJMATRIX = LIBS.get_projection(49, CANVAS.width / CANVAS.height, 0.1, 300);
    var IDENTITY   = LIBS.get_I4();

    window.addEventListener('resize', function () {
        CANVAS.width  = window.innerWidth;
        CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(49, CANVAS.width / CANVAS.height, 0.1, 300);
    });

    // ---- Init karakter ----
    var sprout = initSprout(GL);
    var sk     = initSpike(GL);
    if (!sprout || !sk) { console.error('Gagal init karakter'); return; }

    // ================================================================
    //  KAMERA BEBAS (orbit di sekitar titik tengah antara dua karakter)
    // ================================================================
    var CAM_THETA = 0.0;    // sudut horizontal
    var CAM_PHI   = 0.28;   // sudut vertikal
    var CAM_DIST  = 16.0;   // jarak ke target
    var CAM_PAN_X = 0.0;    // geser target X
    var CAM_PAN_Y = 1.2;    // geser target Y

    var drag = false, rightDrag = false, xPrev = 0, yPrev = 0;

    CANVAS.addEventListener('pointerdown', function (e) {
        if (e.button === 0) drag      = true;
        if (e.button === 2) rightDrag = true;
        xPrev = e.clientX; yPrev = e.clientY;
        CANVAS.setPointerCapture(e.pointerId);
        e.preventDefault();
    }, false);
    window.addEventListener('pointerup', function (e) {
        if (e.button === 0) drag = false;
        if (e.button === 2) rightDrag = false;
    }, false);
    CANVAS.addEventListener('pointermove', function (e) {
        var dx = e.clientX - xPrev, dy = e.clientY - yPrev;
        xPrev = e.clientX; yPrev = e.clientY;
        if (drag) {
            CAM_THETA -= dx * 0.007;
            CAM_PHI    = Math.max(0.05, Math.min(1.4, CAM_PHI + dy * 0.006));
        }
        if (rightDrag) {
            var cosT = Math.cos(CAM_THETA), sinT = Math.sin(CAM_THETA);
            CAM_PAN_X += (-dx*cosT) * 0.012 * (CAM_DIST / 10);
            CAM_PAN_Y -= dy * 0.012 * (CAM_DIST / 10);
        }
        e.preventDefault();
    }, false);
    CANVAS.addEventListener('wheel', function (e) {
        CAM_DIST = Math.max(3, Math.min(60, CAM_DIST * (1 + e.deltaY * 0.001)));
        e.preventDefault();
    }, { passive: false });
    CANVAS.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // ================================================================
    //  STATE GAME SPIKE
    // ================================================================
    var TAU    = sk.TAU;
    var LEGLEN = sk.LEGLEN;
    var EYE_R  = sk.EYE_R;

    // Helper matriks
    var matrix_TS = function (parent, tx, ty, tz, sx, sy, sz) {
        var M = LIBS.copy(parent);
        LIBS.translate(M, tx, ty, tz);
        LIBS.scale(M, sx, sy, sz);
        return M;
    };
    var matrix_rotX = function (angle) {
        var M = LIBS.get_I4();
        LIBS.rotateX(M, angle);
        return M;
    };

    var t = 0, last = 0;
    var paused = false;

    // Tahap tumbuh
    var stage      = 'seed';
    var stageStart = 0;
    var GROW_DUR   = 2.6;

    // State karakter Spike
    var state      = 'idle';
    var stateStart = 0;
    var walkPhase  = 0;
    var posX = 3.5, posZ = 0, facing = 0;   // Spike di kanan (X = 3.5)
    var castX = 0, castZ = 0, castFacing = 0;
    var DUR   = { idle:1e9, walk:1e9, wave:1.8, skill:1.9, ulti:2.4 };

    // State karakter Sprout
    var spPosX          = -3.5;
    var spPosZ          = 0.0;
    var spFacing        = 0.0;
    var spWalkPhase     = 0.0;
    var spWheelRot      = 0.0;
    var spTiltX         = 0.0;
    var spScale         = 1.0;
    var spTargetScale   = 1.0;
    var spShooting      = false;
    var spShootStart    = 0.0;
    var spSpawnedProj   = false;
    var spProjectiles   = [];
    var spDead          = false;
    var spDeathStart    = 0.0;
    var spDeathAxis     = [0.75, 0.0, 0.66]; // Sumbu diagonal sembarang untuk animasi tumbang

    // Musuh kaktus kecil
    var enemyState     = 'none';
    var enemyTime      = 0;
    var enemyX = 0, enemyZ = 0;
    var skillHasTarget = false;
    var skillDist      = 2.7;
    var aimFacing      = 0;
    var ultiClicks     = 0;
    var flash          = null;

    // Power Box
    var boxSpawned   = false;
    var boxState     = 'none';
    var boxPos       = [0, 0, 0];
    var boxT         = 0;
    var ultiUnlocked = false;

    // RNG — sama dengan spike.js (seed=7) supaya ROCKS/CACTI/dll konsisten
    var seed2 = 999;
    var rnd2  = function () { seed2 = (seed2*16807)%2147483647; return seed2/2147483647; };

    // Referensi ke data lingkungan dari spike.js
    var ROCKS     = sk.ROCKS;
    var CACTI     = sk.CACTI;
    var MESAS     = sk.MESAS;
    var CLOUDS    = sk.CLOUDS;
    var ULTI_RING = sk.ULTI_RING;
    var DROPS     = sk.DROPS;
    var SPIKES    = sk.SPIKES;
    var VEST_A    = sk.VEST_A;

    // Mesh referensi
    var SPHERE     = sk.SPHERE;
    var CONE       = sk.CONE;
    var BODY       = sk.BODY;
    var PANTS      = sk.PANTS;
    var PARABOLOID = sk.PARABOLOID;
    var MOUTH      = sk.MOUTH;
    var ARM        = sk.ARM;
    var LEG        = sk.LEG;
    var GROUND     = sk.GROUND;
    var BOX        = sk.BOX;
    var HANDLE     = sk.HANDLE;
    var VEST_SHELL = sk.VEST_SHELL;
    var VEST_HEM_LO= sk.VEST_HEM_LO;
    var VEST_HEM_HI= sk.VEST_HEM_HI;
    var VEST_EDGE_R= sk.VEST_EDGE_R;
    var VEST_EDGE_L= sk.VEST_EDGE_L;
    var bezier     = sk.bezier;
    var ARM_P      = sk.ARM_P;
    var LEG_P      = sk.LEG_P;
    var VPMATRIX   = LIBS.get_I4();

    // ---- UI ----
    var flashEl  = document.getElementById('flash');
    var objEl    = document.getElementById('obj');
    var objTxt   = '';

    var setObj = function (s) {
        if (s !== objTxt) { objTxt = s; if (objEl) objEl.textContent = s; }
    };

    var spawnEnemy = function () {
        var a = rnd2() * TAU;
        enemyX = posX + Math.sin(a) * 4.5;
        enemyZ = posZ + Math.cos(a) * 4.5;
        enemyState = 'growing';
        enemyTime  = t;
    };

    var startFlash = function () {
        if (flash) return;
        flash = { t0: t, reset: false, cx: 0, cy: 0 };
        if (flashEl) { flashEl.style.display = 'block'; flashEl.style.pointerEvents = 'auto'; flashEl.style.opacity = 1; }
    };

    var resetGame = function () {
        stage = 'seed'; stageStart = t;
        state = 'idle'; stateStart = t;
        posX = 3.5; posZ = 0; facing = 0; castFacing = 0;
        enemyState = 'none'; skillHasTarget = false;
        boxSpawned = false; boxState = 'none';
        ultiUnlocked = false; ultiClicks = 0;
        for (var k in keys) keys[k] = false;
    };

    // Proyeksi 3D ke piksel layar (untuk efek flash)
    var projectPt = function (p) {
        var m = VPMATRIX;
        var x = m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12];
        var y = m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13];
        var w = m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];
        return [(x/w*.5+.5)*window.innerWidth, (1-(y/w*.5+.5))*window.innerHeight];
    };

    var worldPt = function (cx, cz, fac, l) {
        var c = Math.cos(fac), s = Math.sin(fac);
        return [cx+l[0]*c+l[2]*s, l[1], cz-l[0]*s+l[2]*c];
    };

    // Helper trigger aksi Spike (wave, skill, ulti)
    var triggerSpikeAction = function (kind) {
        if (stage !== 'spike' || flash) return;

        if (kind === 'ulti') {
            if (!ultiUnlocked) return;
            ultiClicks++;
            if (ultiClicks >= 2) {
                startFlash();
                return;
            }
        }

        state = kind;
        stateStart = t;
        castX = posX;
        castZ = posZ;
        castFacing = facing;
        skillHasTarget = false;
        skillDist = 2.7;

        if (kind === 'skill' && (enemyState === 'growing' || enemyState === 'alive')) {
            var dx = enemyX - posX, dz = enemyZ - posZ;
            aimFacing = Math.atan2(dx, dz);
            skillDist = Math.max(1, Math.hypot(dx, dz) - 0.3);
            skillHasTarget = true;
        }
    };

    // ---- Input keyboard ----
    var keys = {};
    window.addEventListener('keydown', function (e) {
        keys[e.code] = true;
        if (e.code === 'KeyX' && !e.repeat) {
            if (!spDead) {
                spDead       = true;
                spDeathStart = t;
                spShooting   = false;
            }
        }
        if (e.code === 'Space') {
            if (!spDead && !spShooting) {
                spShooting    = true;
                spShootStart  = t;
                spSpawnedProj = false;
            }
            e.preventDefault();
        }
        if (e.code === 'KeyC' && !e.repeat) {
            if (!spDead) {
                spTargetScale = spTargetScale + 0.2;
            }
        }
        // Trigger animasi Spike via Keyboard:
        // Q : Siram air & tumbuh (saat masih seed) / Wave (setelah tumbuh menjadi spike)
        // E : Skill
        // R : Ulti
        if (e.code === 'KeyQ' && !e.repeat) {
            if (stage === 'seed') {
                stage = 'growing';
                stageStart = t;
            } else if (stage === 'spike') {
                triggerSpikeAction('wave');
            }
        }
        if (e.code === 'KeyE' && !e.repeat) {
            triggerSpikeAction('skill');
        }
        if (e.code === 'KeyR' && !e.repeat) {
            triggerSpikeAction('ulti');
        }
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            e.preventDefault();
        }
    }, false);
    window.addEventListener('keyup', function (e) { keys[e.code] = false; }, false);

    // ---- Fungsi gambar Power Box ----
    var gambarPeti = function (M, alpha) {
        var gambar = sk.gambar;
        var sc = 0.42;
        var BLU=[0.2,0.24,0.86], YEL=[0.98,0.8,0.22], YEL2=[0.92,0.6,0.16];
        var RED=[0.85,0.14,0.14], DK=[0.08,0.08,0.08], SIGN=[-1,1];

        gambar(BOX, matrix_TS(M, 0,-sc*.55,0, sc,sc*.45,sc), BLU, {spec:.4,alpha:alpha});
        gambar(BOX, matrix_TS(M, 0, sc*.425,0, sc,sc*.575,sc), YEL, {spec:.4,alpha:alpha});
        for (var i=0;i<2;i++) for (var j=0;j<2;j++) for (var k=0;k<2;k++)
            gambar(SPHERE, matrix_TS(M, SIGN[i]*sc*.88,SIGN[j]*sc*.88,SIGN[k]*sc*.88, sc*.28,sc*.28,sc*.28), RED, {spec:.5,alpha:alpha});
        var SISI=[[1,0],[-1,0],[0,1],[0,-1]];
        for (var i=0;i<SISI.length;i++)
            gambar(SPHERE, matrix_TS(M, SISI[i][0]*sc*.88,sc*.95,SISI[i][1]*sc*.88, sc*.2,sc*.2,sc*.2), RED, {spec:.5,alpha:alpha});
        var hm=LIBS.copy(M); LIBS.translate(hm,0,sc*1.0,0);
        gambar(HANDLE, matrix_TS(hm,0,0,0,sc,sc,sc), BLU, {spec:.5,alpha:alpha});
        for (var i=0;i<2;i++)
            gambar(SPHERE, matrix_TS(hm,SIGN[i]*sc*.55,0,0,sc*.2,sc*.2,sc*.2), RED, {spec:.5,alpha:alpha});
        var fz=sc*1.03;
        for (var i=0;i<2;i++) {
            var s=SIGN[i];
            gambar(SPHERE, matrix_TS(M, s*sc*.32,sc*.22,fz, sc*.17,sc*.17,sc*.06), DK, {spec:.3,alpha:alpha});
            var alis=LIBS.copy(M);
            LIBS.translate(alis,s*sc*.32,sc*.47,fz*.98); LIBS.rotateZ(alis,s*.6); LIBS.scale(alis,sc*.2,sc*.05,sc*.05);
            gambar(SPHERE,alis,DK,{spec:.3,alpha:alpha});
        }
        gambar(SPHERE, matrix_TS(M,0,-sc*.08,fz+.02,sc*.36,sc*.24,sc*.08), YEL2, {spec:.4,alpha:alpha});
        var orn=LIBS.copy(M); LIBS.translate(orn,sc*1.02,sc*.08,0); LIBS.rotateZ(orn,.12); LIBS.scale(orn,sc*.09,sc*.32,sc*.15);
        gambar(BOX,orn,RED,{spec:.5,alpha:alpha});
    };

    // ================================================================
    //  ANIMATION LOOP
    // ================================================================
    var animate = function (time) {
        requestAnimationFrame(animate);

        // ---- Delta time & jeda ----
        var dt = Math.min((time - last) / 1000, 0.05);
        last = time;
        if (!paused) t += dt;

        // ---- Clear ----
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clearColor(0.6, 0.75, 0.9, 1.0);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        // ---- Kamera ----
        var eyeX = CAM_PAN_X + CAM_DIST * Math.cos(CAM_PHI) * Math.sin(CAM_THETA);
        var eyeY = CAM_PAN_Y + CAM_DIST * Math.sin(CAM_PHI);
        var eyeZ =             CAM_DIST * Math.cos(CAM_PHI) * Math.cos(CAM_THETA);
        var eye  = [eyeX, eyeY, eyeZ];
        var VIEWMATRIX = LIBS.look_at(eye, [CAM_PAN_X, CAM_PAN_Y - 0.3, 0.0], [0, 1, 0]);
        VPMATRIX = LIBS.multiply(PROJMATRIX, VIEWMATRIX);

        // ================================================================
        //  UPDATE & RENDER SPROUT (Arrow Keys — sama persis dengan WASD Spike)
        // ================================================================
        var spMx = 0, spMz = 0;
        if (!spDead) {
            if (keys.ArrowUp)    spMz -= 1;
            if (keys.ArrowDown)  spMz += 1;
            if (keys.ArrowLeft)  spMx -= 1;
            if (keys.ArrowRight) spMx += 1;
        }

        var spWalking = !spDead && (spMx !== 0 || spMz !== 0);
        if (spWalking) {
            var spLen = Math.hypot(spMx, spMz);
            spMx /= spLen;
            spMz /= spLen;

            spPosX += spMx * 2.6 * dt;
            spPosZ += spMz * 2.6 * dt;

            // Putar arah hadap Sprout menghadap arah gerak (sama seperti Spike)
            var spTarget = Math.atan2(-spMx, spMz);
            var spDiff = spTarget - spFacing;
            while (spDiff >  Math.PI) spDiff -= TAU;
            while (spDiff < -Math.PI) spDiff += TAU;
            spFacing += spDiff * Math.min(dt * 8, 1);

            spWalkPhase += dt * 7.5;
            spWheelRot  += (2.6 * dt) / 0.32;
        }

        // Progress animasi mati tumbang
        var spDeathElapsed = spDead ? (t - spDeathStart) : 0;
        var spFallProgress = 0;
        if (spDead) {
            if (spDeathElapsed < 0.65) {
                var pFall = spDeathElapsed / 0.65;
                spFallProgress = pFall * pFall;
            } else if (spDeathElapsed < 0.90) {
                var pBounce = (spDeathElapsed - 0.65) / 0.25;
                spFallProgress = 1.0 - Math.sin(pBounce * Math.PI) * 0.07;
            } else {
                spFallProgress = 1.0;
            }
        }

        // Bobbing badan saat jalan vs idle (berhenti total ketika mati)
        var spBobY = spDead
            ? -0.18 * spScale * LIBS.clamp(spDeathElapsed / 0.65, 0, 1)
            : (spWalking
                ? 0.04 + 0.05 * Math.abs(Math.sin(spWalkPhase * 2))
                : 0.05 * Math.sin(t * 2));

        // Interpolasi halus animasi scaling saat tombol C ditekan (hanya saat masih hidup)
        if (!spDead) {
            spScale += (spTargetScale - spScale) * Math.min(dt * 7, 1);
        }

        // Gunakan JOINT_MATRIX untuk translasi dunia & translateY sesuai spScale (1.17 * spScale)
        // agar titik terbawah roda (y lokal = -1.17) selalu menempel tepat di tanah (y = 0)
        LIBS.set_I4(sprout.bodyBase.JOINT_MATRIX);
        LIBS.translateX(sprout.bodyBase.JOINT_MATRIX, spPosX);
        LIBS.translateY(sprout.bodyBase.JOINT_MATRIX, 1.17 * spScale + spBobY);
        LIBS.translateZ(sprout.bodyBase.JOINT_MATRIX, spPosZ);

        LIBS.set_I4(sprout.bodyBase.POSITION_MATRIX);
        delete sprout.bodyBase.MOVE_MATRIX._mode;
        LIBS.set_I4(sprout.bodyBase.MOVE_MATRIX);
        LIBS.rotateY(sprout.bodyBase.MOVE_MATRIX, spFacing);
        if (spDead) {
            // Rotasi tumbang ke arah diagonal sembarang (rotation on arbitrary axis)
            LIBS.rotateAxis(sprout.bodyBase.MOVE_MATRIX, spDeathAxis, spFallProgress * 1.42);
        }
        LIBS.scaleX(sprout.bodyBase.MOVE_MATRIX, spScale);
        LIBS.scaleY(sprout.bodyBase.MOVE_MATRIX, spScale);
        LIBS.scaleZ(sprout.bodyBase.MOVE_MATRIX, spScale);

        // Putaran roda Sprout di tempat pada porosnya
        LIBS.set_I4(sprout.leftWheel.MOVE_MATRIX);
        LIBS.rotateY(sprout.leftWheel.MOVE_MATRIX, spWheelRot);
        LIBS.set_I4(sprout.rightWheel.MOVE_MATRIX);
        LIBS.rotateY(sprout.rightWheel.MOVE_MATRIX, spWheelRot);

        if (spDead) {
            var limpSmooth = LIBS.smoothstep(0, 0.65, spDeathElapsed);

            // Tangan terkulai pada sumbu diagonal sembarang lalu diam
            delete sprout.leftArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.leftArm.MOVE_MATRIX);
            LIBS.rotateAxis(sprout.leftArm.MOVE_MATRIX, [0.8, 0.2, -0.5], limpSmooth * 0.95);

            delete sprout.rightArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.rightArm.MOVE_MATRIX);
            LIBS.rotateAxis(sprout.rightArm.MOVE_MATRIX, [0.8, -0.2, 0.5], limpSmooth * 0.85);

            // Kubah kaca miring pada sumbu sembarang dan tidak lagi melakukan animasi idle
            delete sprout.glassDome.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.glassDome.MOVE_MATRIX);
            LIBS.rotateAxis(sprout.glassDome.MOVE_MATRIX, [0.4, 0.8, 0.4], limpSmooth * 0.35);

            // Tangkai daun terkulai layu pada sumbu diagonal sembarang dan berhenti bergoyang
            delete sprout.stem.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.stem.MOVE_MATRIX);
            LIBS.rotateAxis(sprout.stem.MOVE_MATRIX, [0.7, 0.0, 0.7], limpSmooth * 0.75);
        } else if (spWalking) {
            // Ayunan tangan Sprout (persis seperti ayunan lengan WASD Spike: mengayun maju-mundur bergantian)
            var spArmL = Math.sin(spWalkPhase + Math.PI) * 0.4;
            var spArmR = Math.sin(spWalkPhase) * 0.4;

            delete sprout.leftArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.leftArm.MOVE_MATRIX);
            LIBS.rotateX(sprout.leftArm.MOVE_MATRIX, -spArmL);
            LIBS.rotateZ(sprout.leftArm.MOVE_MATRIX, -0.45);

            delete sprout.rightArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.rightArm.MOVE_MATRIX);
            LIBS.rotateX(sprout.rightArm.MOVE_MATRIX, -spArmR);
            LIBS.rotateZ(sprout.rightArm.MOVE_MATRIX, 0.45);

            // Kepala menghadap lurus ke depan saat jalan
            delete sprout.glassDome.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.glassDome.MOVE_MATRIX);
        } else {
            var armWave = Math.sin(t * 2.5) * 0.18;
            delete sprout.leftArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.leftArm.MOVE_MATRIX);
            LIBS.rotateZ(sprout.leftArm.MOVE_MATRIX, -0.45 + armWave);
            delete sprout.rightArm.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.rightArm.MOVE_MATRIX);
            LIBS.rotateZ(sprout.rightArm.MOVE_MATRIX, 0.45 - armWave);

            // Animasi menoleh kubah kaca saat diam (idle)
            var domePositions = [-0.9, 0, 0.9, 0];
            var domeMoveDuration = 50;
            var domePauseDuration = 1500;
            var domeSegmentDuration = domeMoveDuration + domePauseDuration;
            var domeCycleDuration = domeSegmentDuration * domePositions.length;
            var domePhase = (t * 1000) % domeCycleDuration;
            var domeSegment = Math.floor(domePhase / domeSegmentDuration);
            var domeSegmentTime = domePhase % domeSegmentDuration;
            var domePreviousPosition = domePositions[(domeSegment + domePositions.length - 1) % domePositions.length];
            var domeTargetPosition = domePositions[domeSegment];
            var domeProgress = Math.min(domeSegmentTime / domeMoveDuration, 1);
            var domeAngle = domePreviousPosition + (domeTargetPosition - domePreviousPosition) * domeProgress;

            delete sprout.glassDome.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.glassDome.MOVE_MATRIX);
            LIBS.rotateY(sprout.glassDome.MOVE_MATRIX, domeAngle);
        }

        // Animasi menembak proyektil (Spacebar) — tangan kanan rotate ke atas lalu melontarkan proyektil pink
        if (!spDead && spShooting) {
            var spSt = t - spShootStart;
            var shootArmAng = 0;

            if (spSt < 0.28) {
                // Tangan kanan diangkat (rotate) ke atas
                var pUp = LIBS.smoothstep(0, 0.28, spSt);
                shootArmAng = pUp * 2.1;
            } else if (spSt < 0.75) {
                // Spawn proyektil tepat dari ujung tangan kanan saat di puncak atas
                if (!spSpawnedProj) {
                    var handPos = sprout.getLeftHandWorldPosition();
                    spSpawnedProj = true;
                    var cF = Math.cos(spFacing);
                    var sF = Math.sin(spFacing);

                    // Arah depan Sprout sesuai rotasi hadapnya: (-sin(spFacing), cos(spFacing))
                    var fwdX = -sF;
                    var fwdZ =  cF;

                    spProjectiles.push({
                        x: handPos.x,
                        y: handPos.y,
                        z: handPos.z,
                        vx : fwdX * 6.5,
                        vy : 6.2,
                        vz : fwdZ * 6.5
                    });
                }
                // Tangan kanan turun kembali ke posisi semula
                var pDown = LIBS.smoothstep(0.28, 0.75, spSt);
                shootArmAng = (1 - pDown) * 2.1;
            } else {
                spShooting = false;
            }

            if (spShooting) {
                delete sprout.leftArm.MOVE_MATRIX._mode;
                LIBS.set_I4(sprout.leftArm.MOVE_MATRIX);
                LIBS.rotateX(sprout.leftArm.MOVE_MATRIX, shootArmAng);
                LIBS.rotateZ(sprout.leftArm.MOVE_MATRIX, 0.45);
            }
        }

        // Update fisika melambung proyektil & hapus saat menyentuh tanah
        for (var pi = spProjectiles.length - 1; pi >= 0; pi--) {
            var prj = spProjectiles[pi];
            prj.x  += prj.vx * dt;
            prj.z  += prj.vz * dt;
            prj.y  += prj.vy * dt;
            prj.vy -= 14.0 * dt; // gravitasi agar lintasan melambung parabolik

            // Hapus proyektil saat menyentuh permukaan tanah (radius sphere = 0.30)
            if (prj.y <= 0.30) {
                spProjectiles.splice(pi, 1);
            }
        }

        // Goyang daun di atas kepala (hanya saat hidup)
        if (!spDead) {
            delete sprout.stem.MOVE_MATRIX._mode;
            LIBS.set_I4(sprout.stem.MOVE_MATRIX);
            LIBS.rotateZ(sprout.stem.MOVE_MATRIX, spWalking ? Math.sin(spWalkPhase * 2) * 0.12 : Math.sin(t * 3) * 0.05);
        }

        sprout.draw(time, PROJMATRIX, VIEWMATRIX, spProjectiles);

        // ================================================================
        //  RENDER SPIKE — set kamera ke shader Spike
        // ================================================================
        sk.setCamera(PROJMATRIX, VIEWMATRIX, eye);
        var gambar = sk.gambar;

        // ---- State game: tahap tumbuh ----
        if (stage === 'growing' && t - stageStart > GROW_DUR) {
            stage = 'spike';
            if (enemyState === 'none') spawnEnemy();
        }

        var st = t - stateStart;
        if (state !== 'idle' && state !== 'walk' && st > DUR[state]) {
            state = 'idle'; stateStart = t; st = 0;
        }

        // Skill: putar badan ke arah kaktus kecil
        if (state === 'skill' && skillHasTarget && st < 0.6) {
            var selisih = aimFacing - facing;
            while (selisih >  Math.PI) selisih -= TAU;
            while (selisih < -Math.PI) selisih += TAU;
            facing += selisih * Math.min(dt * 10, 1);
            castFacing = facing;
        }

        // Gerak WASD (khusus Spike)
        if (stage === 'spike' && (state === 'idle' || state === 'walk')) {
            var mx = 0, mz = 0;
            if (keys.KeyW) mz -= 1;
            if (keys.KeyS) mz += 1;
            if (keys.KeyA) mx -= 1;
            if (keys.KeyD) mx += 1;
            if (mx || mz) {
                var panjang = Math.hypot(mx, mz);
                mx /= panjang; mz /= panjang;
                posX += mx * 2.6 * dt;
                posZ += mz * 2.6 * dt;
                var target = Math.atan2(mx, mz);
                var selisih2 = target - facing;
                while (selisih2 >  Math.PI) selisih2 -= TAU;
                while (selisih2 < -Math.PI) selisih2 += TAU;
                facing += selisih2 * Math.min(dt * 8, 1);
                state = 'walk';
                walkPhase += dt * 7.5;
            } else if (state === 'walk') {
                state = 'idle';
            }
        }

        // ---- Parameter animasi badan ----
        var growP = stage === 'seed' ? 0
                  : stage === 'growing' ? LIBS.clamp((t - stageStart) / GROW_DUR, 0, 1)
                  : 1;
        var smallScale = 0.26;
        var bodyGrow   = stage === 'spike' ? 1 : LIBS.lerp(smallScale, 1, LIBS.smoothstep(0, 1, growP));
        var limbT      = Math.max(stage === 'spike' ? 1 : LIBS.smoothstep(0.2, 1, growP), 0.0005);

        var G        = [0.52, 0.88, 0.22];
        var bodyY    = 0.05 * Math.sin(t * 2);
        var sx = 1, sy = 1 + 0.014 * Math.sin(t * 2);
        var lean     = LIBS.get_I4();
        var armAngL  = 0.1 * Math.sin(t * 1.5);
        var armAngR  = 0.1 * Math.sin(t * 1.5 + 2.4);
        var armLiftBoth = 0;
        var legAngL  = 0.03 * Math.sin(t * 1.1);
        var legAngR  = 0.03 * Math.sin(t * 1.1 + 1.6);
        var shadowScale = 1;

        if (state === 'walk') {
            legAngL = Math.sin(walkPhase) * 0.7;
            legAngR = Math.sin(walkPhase + Math.PI) * 0.7;
            armAngL = Math.sin(walkPhase + Math.PI) * 0.4;
            armAngR = Math.sin(walkPhase) * 0.4;
            bodyY   = 0.04 + 0.05 * Math.abs(Math.sin(walkPhase * 2));
        } else if (state === 'wave') {
            var pw = LIBS.smoothstep(0, 0.25, st) - LIBS.smoothstep(1.55, 1.8, st);
            armAngR = 1.35 * pw + Math.sin(st * 9) * 0.35 * pw;
            lean = LIBS.get_I4(); LIBS.rotateY(lean, 0.12 * pw);
        } else if (state === 'skill') {
            var ang;
            if (st < 0.5) {
                var p1 = LIBS.smoothstep(0, 0.5, st);
                ang = -0.75 * p1; lean = matrix_rotX(0.15 * p1);
            } else if (st < 0.7) {
                var p2 = LIBS.smoothstep(0.5, 0.7, st);
                ang = LIBS.lerp(-0.75, 1.55, p2); lean = matrix_rotX(LIBS.lerp(0.15, -0.1, p2));
            } else {
                var p3 = LIBS.smoothstep(0.7, 1.0, st);
                ang = LIBS.lerp(1.55, 0, p3); lean = matrix_rotX(LIBS.lerp(-0.1, 0, p3));
            }
            armAngR = ang;
        } else if (state === 'ulti') {
            var pu = LIBS.smoothstep(0, 0.4, st) - LIBS.smoothstep(2.0, 2.4, st);
            armLiftBoth = pu * 2.3;
            if (st < 0.4) {
                sy = 1 - 0.24 * LIBS.smoothstep(0, 0.38, st); bodyY = 0;
            } else if (st < 1.6) {
                var at = (st - 0.4) / 1.2;
                bodyY = Math.sin(at * Math.PI) * 1.5;
                sy    = 1 + 0.12 * Math.sin(at * Math.PI);
                legAngL = legAngR = -0.5 * Math.sin(at * Math.PI);
            } else {
                var at2 = LIBS.smoothstep(1.6, 1.9, st);
                bodyY = (1 - at2) * 0.15 * Math.sin(at2 * Math.PI + 3.14);
                sy    = 1 - 0.06 * (1 - at2);
            }
            shadowScale = 1 - LIBS.clamp(bodyY / 1.5, 0, 1) * 0.7;
        }

        sx = 1 / Math.sqrt(Math.max(sy, 0.2));
        sx *= bodyGrow; sy *= bodyGrow;

        var B = LIBS.get_I4();
        LIBS.translate(B, posX, LEGLEN * bodyGrow + bodyY, posZ);
        LIBS.rotateY(B, facing);
        LIBS.scale(B, sx, sy, sx);
        B = LIBS.multiply(B, lean);

        var BL = LIBS.copy(B);
        LIBS.scale(BL, limbT, limbT, limbT);

        // ---- Langit & awan (tidak menulis depth) ----
        GL.depthMask(false);
        gambar(SPHERE, matrix_TS(IDENTITY, 0,0,0, 90,90,90), [0.28,0.55,0.95], {mode:2});
        gambar(SPHERE, matrix_TS(IDENTITY,-40,28,-55, 5,5,5), [1,0.95,0.6], {mode:4});

        var BAGIAN_AWAN = [[0,0,1],[1.6,-0.3,0.7],[-1.6,-0.2,0.75]];
        for (var i = 0; i < CLOUDS.length; i++) {
            var c = CLOUDS[i], ca = c.a + t * 0.02;
            var cm = LIBS.get_I4();
            LIBS.translate(cm, Math.cos(ca)*55, c.y, Math.sin(ca)*55);
            LIBS.rotateY(cm, -ca);
            for (var j = 0; j < BAGIAN_AWAN.length; j++) {
                var q = BAGIAN_AWAN[j];
                gambar(SPHERE, matrix_TS(cm, q[0]*c.s,q[1]*c.s,0, c.s*q[2]*1.3,c.s*.45*q[2],c.s*q[2]), [1,1,1], {mode:4});
            }
        }
        GL.depthMask(true);

        // ---- Tanah, mesa, batu, kaktus dekorasi ----
        gambar(GROUND, IDENTITY, [0.93,0.78,0.5], {mode:1,spec:0});
        for (var i = 0; i < MESAS.length; i++) {
            var ms = MESAS[i];
            gambar(CONE, matrix_TS(IDENTITY, Math.cos(ms.a)*32,0,Math.sin(ms.a)*32, ms.s,ms.s*.9,ms.s), [0.72,0.42,0.26], {spec:0});
        }
        for (var i = 0; i < ROCKS.length; i++) {
            var rk = ROCKS[i];
            gambar(SPHERE, matrix_TS(IDENTITY, rk.x,0,rk.z, rk.s*1.3,rk.s*.7,rk.s), [0.62,0.48,0.38], {spec:.05});
        }
        for (var i = 0; i < CACTI.length; i++) {
            var ck = CACTI[i], cb = LIBS.get_I4();
            LIBS.translate(cb, Math.cos(ck.a)*ck.r, 0, Math.sin(ck.a)*ck.r);
            LIBS.rotateY(cb, ck.i);
            LIBS.rotateZ(cb, 0.04 * Math.sin(t * 1.5 + ck.i));
            LIBS.scale(cb, ck.s, ck.s * 1.3, ck.s);
            gambar(BODY, cb, [0.3,0.6,0.16]);
            gambar(ARM,  matrix_TS(cb, 0.7,0.9,0.04, 1,1,1), [0.3,0.6,0.16]);
            gambar(SPHERE, matrix_TS(cb, 0,2.3,0, 0.28,0.18,0.28), [0.95,0.4,0.6]);
        }

        // ---- Musuh kaktus kecil ----
        if (enemyState === 'growing' || enemyState === 'alive' || enemyState === 'dying') {
            var ea  = t - enemyTime;
            if (enemyState === 'growing' && ea > 1.6) enemyState = 'alive';

            if (state === 'skill' && skillHasTarget && st >= 1.1 && (enemyState === 'growing' || enemyState === 'alive')) {
                enemyState = 'dying'; enemyTime = t; skillHasTarget = false;
            }

            var ea2   = t - enemyTime;
            var dying = enemyState === 'dying';
            var g     = dying
                ? Math.max(0, 1 - LIBS.smoothstep(0, 0.6, ea2))
                : LIBS.smoothstep(0, 1.5, ea2) * (1 + 0.12 * Math.sin(LIBS.clamp(ea2/1.5,0,1) * Math.PI));
            var shake = dying ? Math.sin(ea2*70)*0.06*(1-LIBS.clamp(ea2/0.6,0,1)) : 0;
            var gm    = dying ? g : Math.min(1, ea2/0.4);
            var gg    = Math.max(g, 0.001);
            var GC    = [0.3, 0.62, 0.2];

            var em = LIBS.get_I4();
            LIBS.translate(em, enemyX+shake, 0, enemyZ);
            LIBS.rotateY(em, 0.6);
            LIBS.scale(em, gg, gg, gg);

            gambar(SPHERE, matrix_TS(IDENTITY, enemyX,0,enemyZ, 0.6*gm,0.13*gm,0.6*gm), [0.5,0.34,0.2], {spec:0});
            gambar(BODY,   matrix_TS(em, 0,0,0, 0.36,0.34,0.36), GC, {mode:6,spec:.3});
            var SISI_L = [1, -1];
            for (var i = 0; i < 2; i++) {
                var es = SISI_L[i], lengan = LIBS.copy(em);
                LIBS.translate(lengan, es*0.3,0.2,0);
                LIBS.rotateZ(lengan, -es*0.9);
                LIBS.scale(lengan, 0.13,0.15,0.13);
                gambar(BODY, lengan, GC, {mode:6,spec:.3});
            }
            gambar(SPHERE, matrix_TS(em, 0,0.7,0, 0.13,0.1,0.13), [0.95,0.4,0.6], {spec:.4});

            if (!dying) {
                var pr = 0.8 + 0.08 * Math.sin(t * 6);
                gambar(SPHERE, matrix_TS(IDENTITY, enemyX,0.03,enemyZ, pr,0.005,pr), [1,0.25,0.2], {spec:0,alpha:.45});
            }
            if (dying) {
                for (var i = 0; i < 10; i++) {
                    var pa = (i/10)*TAU, pv = 1.6+0.4*(i%3);
                    var partX = enemyX + Math.cos(pa)*pv*ea2;
                    var partZ = enemyZ + Math.sin(pa)*pv*ea2;
                    var partY = 0.35 + 3.2*ea2 - 5*ea2*ea2;
                    var partS = 0.07*(1-LIBS.clamp(ea2/0.9,0,1));
                    if (partY > 0 && partS > 0)
                        gambar(SPHERE, matrix_TS(IDENTITY, partX,partY,partZ, partS,partS,partS), i%2?[0.3,0.62,0.2]:[0.95,0.4,0.6], {spec:.3});
                }
                if (ea2 > 0.9) enemyState = 'dead';
            }
        }

        // ---- Power Box ----
        if (!boxSpawned && enemyState === 'dead') {
            boxSpawned = true; boxState = 'falling'; boxT = t;
            boxPos = [enemyX+(rnd2()-.5)*1.5, 8, enemyZ+(rnd2()-.5)*1.5];
        }
        if (boxState === 'falling') {
            var ft = LIBS.clamp((t - boxT) / 1.1, 0, 1);
            boxPos[1] = 8*(1-ft)*(1-ft)+0.35;
            if (ft >= 1) boxState = 'ground';
        }
        if (boxState === 'ground') {
            var jarak = Math.hypot(posX-boxPos[0], posZ-boxPos[2]);
            if (jarak < 1.3) { boxState = 'opening'; boxT = t; }
        }
        if (boxState !== 'none' && boxState !== 'done') {
            var bm = LIBS.get_I4();
            LIBS.translate(bm, boxPos[0], boxPos[1], boxPos[2]);
            LIBS.rotateY(bm, 0.3 * Math.sin(t * 0.8));
            if (boxState === 'falling' || boxState === 'ground') {
                gambarPeti(bm, 1);
            } else if (boxState === 'opening') {
                var op = LIBS.clamp((t - boxT) / 0.6, 0, 1);
                var wob = Math.sin(op*TAU*3)*0.14*(1-op);
                var pm = LIBS.copy(bm);
                LIBS.translate(pm, 0, 0.08*Math.sin(op*Math.PI), 0);
                LIBS.rotateZ(pm, wob);
                gambarPeti(pm, 1);
                for (var i = 0; i < 6; i++) {
                    var ka = (i/6)*TAU+op*2, kr = op*0.9, ks = 0.05+0.04*op;
                    gambar(SPHERE, matrix_TS(bm, Math.cos(ka)*kr,0.3+op*0.7,Math.sin(ka)*kr, ks,ks,ks), [1,0.9,0.3], {spec:.6});
                }
                if (op >= 1) { boxState = 'fading'; boxT = t; }
            } else if (boxState === 'fading') {
                var fp = LIBS.clamp((t - boxT) / 0.9, 0, 1);
                gambarPeti(matrix_TS(bm, 0,fp*0.7,0, 1,1,1), 1-fp);
                if (fp >= 1) {
                    boxState = 'done'; ultiUnlocked = true;
                }
            }
        }

        // ---- Karakter Spike ----
        gambar(SPHERE, matrix_TS(IDENTITY, posX,0.02,posZ, 1.05*shadowScale*bodyGrow,0.01,1.05*shadowScale*bodyGrow), [0,0,0], {mode:3});

        // Kaki
        var SISI_K = [[1, legAngL], [-1, legAngR]];
        for (var i = 0; i < 2; i++) {
            var ls = SISI_K[i][0], lang = SISI_K[i][1];
            var LM = LIBS.copy(BL);
            LIBS.translate(LM, ls*0.34, 0, 0);
            LIBS.rotateX(LM, lang);
            gambar(LEG, LM, [0.32,0.47,0.26], {spec:.25});
            var ujung = bezier(LEG_P, 1);
            gambar(SPHERE, matrix_TS(LM, ujung[0],ujung[1],ujung[2], 0.25,0.14,0.32), [0.26,0.39,0.21], {spec:.15});
        }

        // Badan, celana, sabuk, kancing
        gambar(BODY,   B,  G,  {spec:.35, mode:6});
        gambar(PANTS,  matrix_TS(BL, 0,0.05,0, 1,1,1), [0.62,0.35,0.13], {spec:.2});
        gambar(CONE,   matrix_TS(BL, 0,0.37,0, 1.0,0.022,1.0), [0.42,0.22,0.08], {spec:.1});
        gambar(SPHERE, matrix_TS(BL, 0,0.33,0.63, 0.08,0.1,0.05), [0.35,0.18,0.05], {spec:.1});

        // Mata & mulut
        var bl    = t % 3.3;
        var blink = bl > 3.15 ? 1 - Math.sin(((bl-3.15)/0.15)*Math.PI)*0.9 : 1;
        var D     = [0.08, 0.14, 0.02];
        var SISI_M = [-1, 1];
        for (var i = 0; i < 2; i++) {
            var ex_ = SISI_M[i] * 0.36;
            var ez_ = Math.sqrt(Math.max(EYE_R*EYE_R - ex_*ex_, 0)) * 0.98;
            gambar(SPHERE, matrix_TS(BL, ex_,1.6,ez_, 0.16,0.23*blink,0.11), D, {spec:.5});
        }
        gambar(MOUTH, matrix_TS(BL, 0,1.2,1.0, 1,1+0.15*Math.abs(bodyY),0.8), D, {spec:.5});

        // Duri
        for (var i = 0; i < SPIKES.length; i++) {
            var sk_ = SPIKES[i], SM = LIBS.copy(B);
            LIBS.translate(SM, sk_.p[0], sk_.p[1], sk_.p[2]);
            LIBS.align_y(SM, sk_.d);
            LIBS.rotateY(SM, sk_.d[0]*3);
            LIBS.scale(SM, 0.05, 0.26, 0.02);
            gambar(PARABOLOID, SM, [0.2,0.4,0.19], {spec:.3});
        }

        // Lengan
        var SISI_A = [[1, armAngR], [-1, armAngL]];
        for (var i = 0; i < 2; i++) {
            var as = SISI_A[i][0], aang = SISI_A[i][1];
            var AM = LIBS.copy(BL);
            LIBS.translate(AM, as*1.04, 0.98, 0.06);
            LIBS.rotateX(AM, -aang - armLiftBoth);
            LIBS.rotateZ(AM, as*0.08);
            gambar(ARM, AM, G, {spec:.3});
            var tangan = bezier(ARM_P, 1);
            gambar(SPHERE, matrix_TS(AM, tangan[0],tangan[1],tangan[2], 0.3,0.27,0.3), G, {spec:.35});
        }

        // Rompi
        var PURPLE = [0.42, 0.12, 0.68];
        gambar(VEST_SHELL,  BL, PURPLE, {spec:.35});
        gambar(VEST_HEM_LO, BL, PURPLE, {spec:.35});
        gambar(VEST_HEM_HI, BL, PURPLE, {spec:.35});
        gambar(VEST_EDGE_R, BL, PURPLE, {spec:.35});
        gambar(VEST_EDGE_L, BL, PURPLE, {spec:.35});

        // Kancing bunga rompi
        for (var i = 0; i < 2; i++) {
            var ks_ = SISI_M[i], va = ks_*(VEST_A-0.18), vr = sk.vest_radius(1.0)+0.06;
            var KM = LIBS.copy(BL);
            LIBS.translate(KM, vr*Math.sin(va), 1.0, -vr*Math.cos(va));
            LIBS.rotateY(KM, Math.PI-va);
            LIBS.scale(KM, 0.09, 0.09, 0.04);
            gambar(SPHERE, KM, [1.0,0.82,0.1], {spec:.6});
        }

        // Bunga di kepala
        var F = LIBS.copy(BL);
        LIBS.translate(F, 0, 2.0, 0);
        LIBS.rotateAxis(F, [0.25,1,0.2], 0.3);
        for (var i = 0; i < 6; i++) {
            var kelopak = LIBS.copy(F);
            LIBS.rotateY(kelopak, (i*TAU)/6);
            LIBS.translate(kelopak, 0.2,0.08,0);
            LIBS.scale(kelopak, 0.26,0.28,0.26);
            gambar(SPHERE, kelopak, [0.93,0.3,0.1], {spec:.45});
        }
        gambar(SPHERE, matrix_TS(F, 0,0.24,0, 0.24,0.26,0.24), [0.98,0.55,0.15], {spec:.5});

        // Penyiram air saat tumbuh
        if (stage === 'growing') {
            var canM = LIBS.get_I4();
            LIBS.translate(canM, posX-0.75, 2.6, posZ-0.1);
            LIBS.rotateAxis(canM, [1,0,0.15], -0.65);
            gambar(CONE,   matrix_TS(canM, 0,0,0, 0.32,0.55,0.32), [0.55,0.55,0.6], {spec:.5});
            gambar(SPHERE, matrix_TS(canM, 0,0.55,0, 0.12,0.28,0.12), [0.55,0.55,0.6], {spec:.5});
            for (var i = 0; i < DROPS.length; i++) {
                var dp = DROPS[i], dph = (t*1.4+dp.ph)%1;
                var dy = LIBS.lerp(2.55, 0.15, dph);
                gambar(SPHERE, matrix_TS(IDENTITY, posX-0.55+dp.ox*dph, dy, posZ-0.05+dp.oz*dph, 0.045,0.09,0.045), [0.35,0.65,0.95], {spec:.6});
            }
        }

        // Efek Skill
        if (state === 'skill' && st > 0.6) {
            var start = [0.75,1.2,0.4], end = [0,0.06,skillDist];
            var flightP = LIBS.clamp((st-0.6)/0.5, 0, 1);
            if (flightP < 1) {
                var titik = [
                    LIBS.lerp(start[0], end[0], flightP),
                    LIBS.lerp(start[1], end[1], flightP),
                    LIBS.lerp(start[2], end[2], flightP)
                ];
                titik[1] += Math.sin(flightP*Math.PI)*0.9;
                var pos = worldPt(castX, castZ, castFacing, titik);
                var spin = st * 14;
                gambar(SPHERE, matrix_TS(IDENTITY, pos[0],pos[1],pos[2], 0.16,0.16,0.16), [0.3,0.55,0.15], {spec:.5});
                for (var i = 0; i < 3; i++) {
                    var dm = LIBS.get_I4();
                    LIBS.translate(dm, pos[0],pos[1],pos[2]);
                    LIBS.rotateY(dm, spin+(i*TAU)/3);
                    LIBS.translate(dm, 0.18,0,0);
                    LIBS.rotateZ(dm, -1.6);
                    LIBS.scale(dm, 0.06,0.22,0.06);
                    gambar(CONE, dm, [0.9,0.93,0.7], {spec:.4});
                }
            } else {
                var bp = LIBS.clamp((st-1.1)/0.5, 0, 1);
                var burst = LIBS.smoothstep(0, 0.15, bp) * (1-LIBS.smoothstep(0.6, 1, bp));
                var ep    = worldPt(castX, castZ, castFacing, end);
                for (var i = 0; i < 6; i++) {
                    var ba = (i/6)*TAU;
                    var pp = worldPt(castX, castZ, castFacing, [end[0]+Math.cos(ba)*0.35, 0, end[2]+Math.sin(ba)*0.35]);
                    gambar(CONE, matrix_TS(IDENTITY, pp[0],pp[1],pp[2], 0.1*burst+.02,0.55*burst+.02,0.1*burst+.02), [0.93,0.96,0.72], {spec:.4});
                }
                gambar(SPHERE, matrix_TS(IDENTITY, ep[0],0.02,ep[2], 0.4*burst,0.02,0.4*burst), [0.3,0.15,0.05], {spec:0});
            }
        }

        // Efek Ulti
        if (state === 'ulti' && st > 0.35 && st < 2.1) {
            var ub = LIBS.smoothstep(0.35,0.65,st) * (1-LIBS.smoothstep(1.7,2.1,st));
            for (var i = 0; i < ULTI_RING.length; i++) {
                var sp2 = ULTI_RING[i];
                var wobU = 1 + 0.08 * Math.sin(t*6+sp2.ph);
                var up   = worldPt(castX, castZ, castFacing, [Math.cos(sp2.a)*sp2.r, 0, Math.sin(sp2.a)*sp2.r]);
                var um   = LIBS.get_I4();
                LIBS.translate(um, up[0],up[1],up[2]);
                LIBS.rotateY(um, sp2.a+castFacing);
                LIBS.scale(um, 0.22*ub*wobU, sp2.h*ub, 0.22*ub*wobU);
                gambar(CONE, um, [0.85,0.9,0.6], {spec:.4});
            }
        }

        // ---- Teks tujuan ----
        if (!flash) {
            if (stage === 'seed')           setObj('Tekan Q untuk menyiram air & menumbuhkan kaktus menjadi Spike');
            else if (stage === 'growing')   setObj('Tumbuh...');
            else if (enemyState === 'growing' || enemyState === 'alive')
                setObj('Hancurkan kaktus kecil dengan Skill (tekan E)');
            else if (enemyState === 'dying')  setObj('');
            else if (boxState !== 'done' && boxState !== 'opening' && boxState !== 'fading')
                setObj('Ambil Power Box! (WASD)');
            else if (ultiUnlocked && ultiClicks === 0) setObj('Ulti terbuka! Tekan R (2x untuk Flash)');
            else if (ultiClicks === 1) setObj('Tekan R sekali lagi!');
            else setObj('');
        } else { setObj(''); }

        // ---- Efek Flash Ulti ----
        if (flash) {
            var e = t - flash.t0;
            var cen = [posX, LEGLEN*bodyGrow + bodyY + 1.0, posZ];
            if (e < 1.3) {
                var pp2 = projectPt(cen);
                flash.cx = pp2[0]; flash.cy = pp2[1];
                var fs = 0.2 + 2.6 * LIBS.smoothstep(0, 1.3, e);
                GL.disable(GL.DEPTH_TEST);
                gambar(SPHERE, matrix_TS(IDENTITY, cen[0],cen[1],cen[2], fs,fs,fs), [1,1,0.9], {mode:4});
                GL.enable(GL.DEPTH_TEST);
                var W = window.innerWidth, H = window.innerHeight;
                var far = Math.max(Math.hypot(flash.cx,flash.cy), Math.hypot(W-flash.cx,flash.cy), Math.hypot(flash.cx,H-flash.cy), Math.hypot(W-flash.cx,H-flash.cy));
                var Rr  = LIBS.smoothstep(0, 1.3, e) * (far/0.8+20);
                if (flashEl) flashEl.style.background =
                    'radial-gradient(circle at '+flash.cx+'px '+flash.cy+'px, rgba(255,255,255,1) 0px, rgba(255,255,255,1) '+(Rr*.8)+'px, rgba(255,244,190,0) '+Rr+'px)';
            } else if (e < 4.3) {
                if (!flash.reset) { resetGame(); flash.reset = true; }
                if (flashEl) flashEl.style.background = '#fff';
            } else if (e < 5.3) {
                if (flashEl) flashEl.style.opacity = String(1-(e-4.3));
            } else {
                if (flashEl) { flashEl.style.display = 'none'; flashEl.style.pointerEvents = 'none'; }
                flash = null;
            }
        }

        GL.flush();
    };

    animate(0);
}

window.addEventListener('load', main);
