class MyObject {
    constructor(gl, program, posAttr, colAttr, normAttr, mMatrixUnif, vertices, faces) {
        this.GL = gl;
        this.PROGRAM = program;
        this._position = posAttr;
        this._color = colAttr;
        this._normal = normAttr;
        this._Mmatrix = mMatrixUnif;

        this.vertices = vertices;
        this.faces = faces;

        this.POSITION_MATRIX = LIBS.get_I4();
        this.MOVE_MATRIX = LIBS.get_I4();
        this.JOINT_MATRIX = LIBS.get_I4();

        this.childs = [];

        this.vbo = gl.createBuffer();
        this.ibo = gl.createBuffer();

        this.setup();
    }

    setup() {
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.vbo);
        this.GL.bufferData(this.GL.ARRAY_BUFFER, new Float32Array(this.vertices), this.GL.STATIC_DRAW);

        this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.ibo);
        this.GL.bufferData(this.GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.faces), this.GL.STATIC_DRAW);
    }

    render(parentMatrix) {
        var model = LIBS.multiply(parentMatrix, this.JOINT_MATRIX);
        model = LIBS.multiply(model, this.MOVE_MATRIX);
        model = LIBS.multiply(model, this.POSITION_MATRIX);

        this.GL.useProgram(this.PROGRAM);
        this.GL.uniformMatrix4fv(this._Mmatrix, false, model);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.vbo);

        var stride = 10 * 4;
        this.GL.vertexAttribPointer(this._position, 3, this.GL.FLOAT, false, stride, 0);
        this.GL.vertexAttribPointer(this._color, 4, this.GL.FLOAT, false, stride, 3 * 4);
        this.GL.vertexAttribPointer(this._normal, 3, this.GL.FLOAT, false, stride, 7 * 4);

        this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.ibo);
        this.GL.drawElements(this.GL.TRIANGLES, this.faces.length, this.GL.UNSIGNED_SHORT, 0);

        for (var i = 0; i < this.childs.length; i++) {
            this.childs[i].render(model);
        }
    }
}

function main() {
    const CANVAS = document.getElementById("mycanvas");
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;

    const GL = CANVAS.getContext("webgl", { antialias: true, alpha: false });
    if (!GL) {
        alert("WebGL tidak didukung di browser ini.");
        return;
    }

    // ================= SHADERS =================
    const shader_vertex_source = `
        attribute vec3 position;
        attribute vec4 color;
        attribute vec3 normal;

        uniform mat4 Pmatrix;
        uniform mat4 Vmatrix;
        uniform mat4 Mmatrix;

        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vFragPos;

        void main(void) {
            vec4 worldPos = Mmatrix * vec4(position, 1.0);
            gl_Position = Pmatrix * Vmatrix * worldPos;

            vColor = color;
            vNormal = normalize(mat3(Mmatrix) * normal);
            vFragPos = vec3(worldPos);
        }
    `;

    const shader_fragment_source = `
        precision mediump float;

        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vFragPos;

        void main(void) {
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(vec3(-0.3, 0.8, 0.9));

            float ambient = 0.55;
            float diffuse = max(dot(normal, lightDir), 0.0) * 0.45;

            vec3 viewDir = normalize(vec3(0.0, 0.0, 8.0) - vFragPos);
            vec3 halfDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfDir), 0.0), 16.0) * 0.2;

            vec3 rgb = vColor.rgb * (ambient + diffuse) + vec3(spec);
            gl_FragColor = vec4(rgb, vColor.a);
        }
    `;

    function compileShader(source, type) {
        const shader = GL.createShader(type);
        GL.shaderSource(shader, source);
        GL.compileShader(shader);
        if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            console.error(GL.getShaderInfoLog(shader));
            GL.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vs = compileShader(shader_vertex_source, GL.VERTEX_SHADER);
    const fs = compileShader(shader_fragment_source, GL.FRAGMENT_SHADER);

    const SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, vs);
    GL.attachShader(SHADER_PROGRAM, fs);
    GL.linkProgram(SHADER_PROGRAM);

    if (!GL.getProgramParameter(SHADER_PROGRAM, GL.LINK_STATUS)) {
        console.error(GL.getProgramInfoLog(SHADER_PROGRAM));
        return;
    }

    const _position = GL.getAttribLocation(SHADER_PROGRAM, "position");
    const _color = GL.getAttribLocation(SHADER_PROGRAM, "color");
    const _normal = GL.getAttribLocation(SHADER_PROGRAM, "normal");

    const _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
    const _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
    const _Mmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix");

    GL.useProgram(SHADER_PROGRAM);
    GL.enableVertexAttribArray(_position);
    GL.enableVertexAttribArray(_color);
    GL.enableVertexAttribArray(_normal);

    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

    // ================= PALET WARNA =================
    const COLOR_WHITE = [0.92, 0.94, 0.96, 1.0];
    const COLOR_CYAN_GLASS = [0.60, 0.90, 1.0, 0.45];
    const COLOR_CYAN_TRIM = [0.72, 0.92, 0.98, 0.85];
    const COLOR_YELLOW_NOTE = [0.98, 0.85, 0.12, 1.0];
    const COLOR_GREEN_LEAF = [0.22, 0.82, 0.22, 1.0];
    const COLOR_GREEN_STEM = [0.15, 0.65, 0.15, 1.0];
    const COLOR_BLUE_PIPE = [0.45, 0.65, 0.95, 1.0];
    const COLOR_PINK_CAPIT = [0.95, 0.32, 0.55, 1.0];
    const COLOR_PURPLE_WHEEL = [0.18, 0.16, 0.35, 1.0];
    const COLOR_RED_BUTTON = [0.92, 0.15, 0.18, 1.0];
    const COLOR_BLACK_FACE = [0.12, 0.12, 0.12, 1.0];
    const COLOR_TAPE = [0.88, 0.88, 0.82, 0.9];

    // Warna Latar & Dekorasi
    const COLOR_GROUND_GREEN = [0.55, 0.82, 0.45, 1.0];
    const COLOR_SHADOW = [0.42, 0.68, 0.33, 1.0];
    const COLOR_CACTUS = [0.20, 0.70, 0.30, 1.0];
    const COLOR_WOOD_BOX = [0.58, 0.38, 0.20, 1.0];
    const COLOR_GOLD_TRIM = [0.92, 0.72, 0.18, 1.0];
    const COLOR_POWER_ICON = [0.85, 0.25, 0.95, 1.0];

    function createMeshObject(geom) {
        return new MyObject(
            GL, SHADER_PROGRAM,
            _position, _color, _normal, _Mmatrix,
            geom.vertex, geom.faces
        );
    }

    // ================= 1. DEKORASI BACKGROUND (STATIS) =================
    const backgroundRoot = createMeshObject(LIBS.createSphere(4, 4, 0.01, [0, 0, 0, 0]));

    const grassPlane = createMeshObject(LIBS.createDisc(48, 6.5, COLOR_GROUND_GREEN));
    LIBS.translateY(grassPlane.POSITION_MATRIX, -1.25);
    backgroundRoot.childs.push(grassPlane);

    const shadowDisc = createMeshObject(LIBS.createDisc(32, 1.35, COLOR_SHADOW));
    LIBS.translateY(shadowDisc.POSITION_MATRIX, -1.24);
    LIBS.scaleZ(shadowDisc.POSITION_MATRIX, 0.8);
    backgroundRoot.childs.push(shadowDisc);

    function createCactus(x, z, scale) {
        const cactus = createMeshObject(LIBS.createCylinder(16, 6, 0.28, 0.28, 1.8, COLOR_CACTUS));
        LIBS.set_position(cactus.POSITION_MATRIX, x, -0.35, z);
        LIBS.scaleX(cactus.POSITION_MATRIX, scale);
        LIBS.scaleY(cactus.POSITION_MATRIX, scale);
        LIBS.scaleZ(cactus.POSITION_MATRIX, scale);

        const armLeft = createMeshObject(LIBS.createCylinder(12, 4, 0.18, 0.18, 0.6, COLOR_CACTUS));
        LIBS.set_position(armLeft.POSITION_MATRIX, -0.32, 0.1, 0.0);
        LIBS.rotateZ(armLeft.POSITION_MATRIX, Math.PI / 3);
        cactus.childs.push(armLeft);

        const flower = createMeshObject(LIBS.createSphere(12, 12, 0.20, COLOR_PINK_CAPIT));
        LIBS.translateY(flower.POSITION_MATRIX, 0.95);
        cactus.childs.push(flower);

        return cactus;
    }

    backgroundRoot.childs.push(createCactus(-3.2, -1.8, 0.9));
    backgroundRoot.childs.push(createCactus(3.2, -2.2, 1.0));

    function createPowerBox(x, z, rotY) {
        const box = createMeshObject(LIBS.createBox(1.1, 1.1, 1.1, COLOR_WOOD_BOX));
        LIBS.set_position(box.POSITION_MATRIX, x, -0.70, z);
        LIBS.rotateY(box.POSITION_MATRIX, rotY);

        const goldTrim = createMeshObject(LIBS.createBox(1.15, 0.15, 1.15, COLOR_GOLD_TRIM));
        LIBS.translateY(goldTrim.POSITION_MATRIX, 0.50);
        box.childs.push(goldTrim);

        const powerIcon = createMeshObject(LIBS.createSphere(12, 12, 0.22, COLOR_POWER_ICON));
        LIBS.set_position(powerIcon.POSITION_MATRIX, 0.0, 0.0, 0.58);
        box.childs.push(powerIcon);

        return box;
    }

    backgroundRoot.childs.push(createPowerBox(2.2, -0.8, -0.35));
    backgroundRoot.childs.push(createPowerBox(-2.2, -1.5, 0.40));

    // ================= 2. MODEL SPROUT (HIERARKI BARU) =================
    // Root Utama Sprout: bodyBase
    const bodyBase = createMeshObject(LIBS.createCylinder(28, 8, 1.25, 1.1, 1.3, COLOR_WHITE));

    // --- bodyCollar (Child dari bodyBase) ---
    const bodyCollar = createMeshObject(LIBS.createCylinder(28, 6, 1.32, 1.32, 0.5, COLOR_CYAN_TRIM));
    LIBS.translateY(bodyCollar.POSITION_MATRIX, 0.25);
    bodyBase.childs.push(bodyCollar);

    // logoSymbol & redButton (Child dari bodyCollar)
    const logoSymbol = createMeshObject(LIBS.createSphere(16, 16, 0.16, [0.1, 0.75, 0.9, 1.0]));
    LIBS.set_position(logoSymbol.POSITION_MATRIX, 0.0, 0.0, 1.30); // Relative terhadap bodyCollar
    bodyCollar.childs.push(logoSymbol);

    const redButton = createMeshObject(LIBS.createCylinder(16, 4, 0.08, 0.08, 0.06, COLOR_RED_BUTTON));
    LIBS.rotateX(redButton.POSITION_MATRIX, Math.PI / 2);
    LIBS.rotateY(redButton.POSITION_MATRIX, -0.53);
    LIBS.set_position(redButton.POSITION_MATRIX, 0.67, 0.0, 1.14); // Masuk ke dalam agar menempel pas pada permukaan kerah
    bodyCollar.childs.push(redButton);

    // --- glassDome (Child dari bodyBase) ---
    const glassDome = createMeshObject(LIBS.createEllipticParaboloid(28, 16, 1.2, 1.1, 1.6, COLOR_CYAN_GLASS));
    LIBS.translateY(glassDome.POSITION_MATRIX, 0.62);
    bodyBase.childs.push(glassDome);

    // stickyNote (Child dari glassDome)
    const stickyNote = createMeshObject(LIBS.createBox(0.85, 0.85, 0.02, COLOR_YELLOW_NOTE));
    LIBS.set_position(stickyNote.POSITION_MATRIX, 0.0, 0.63, 0.865); // Menempel pas pada permukaan lengkung glassDome
    LIBS.rotateX(stickyNote.POSITION_MATRIX, 0.41); // Dimiringkan ke belakang mengikuti kurva kubah paraboloid
    glassDome.childs.push(stickyNote);

    // tape, leftEye, rightEye, mouth (Child dari stickyNote)
    const tape = createMeshObject(LIBS.createBox(0.25, 0.12, 0.03, COLOR_TAPE));
    LIBS.set_position(tape.POSITION_MATRIX, 0.0, 0.43, 0.01); // Relative terhadap stickyNote
    stickyNote.childs.push(tape);

    const leftEye = createMeshObject(LIBS.createSphere(12, 12, 0.075, COLOR_BLACK_FACE));
    LIBS.set_position(leftEye.POSITION_MATRIX, -0.20, 0.07, 0.03); // Relative terhadap stickyNote
    stickyNote.childs.push(leftEye);

    const rightEye = createMeshObject(LIBS.createSphere(12, 12, 0.075, COLOR_BLACK_FACE));
    LIBS.set_position(rightEye.POSITION_MATRIX, 0.20, 0.07, 0.03); // Relative terhadap stickyNote
    stickyNote.childs.push(rightEye);

    const mouth = createMeshObject(LIBS.createBox(0.16, 0.035, 0.02, COLOR_BLACK_FACE));
    LIBS.set_position(mouth.POSITION_MATRIX, 0.0, -0.13, 0.03); // Relative terhadap stickyNote
    stickyNote.childs.push(mouth);

    // stem (Child dari glassDome)
    const stem = createMeshObject(LIBS.createCylinder(12, 4, 0.06, 0.06, 0.35, COLOR_GREEN_STEM));
    LIBS.set_position(stem.POSITION_MATRIX, 0.0, 1.58, 0.0); // Relative terhadap glassDome
    glassDome.childs.push(stem);

    // leafLeft & leafRight (Child dari stem)
    const leafLeft = createMeshObject(LIBS.createCurvedLeaf(8, 10, 0.42, 0.75, COLOR_GREEN_LEAF));
    LIBS.set_position(leafLeft.POSITION_MATRIX, 0.0, 0.12, 0.0); // Relative terhadap stem
    LIBS.rotateY(leafLeft.POSITION_MATRIX, -Math.PI / 2 - 0.3);
    LIBS.rotateX(leafLeft.POSITION_MATRIX, 0.3);
    stem.childs.push(leafLeft);

    const leafRight = createMeshObject(LIBS.createCurvedLeaf(8, 10, 0.42, 0.75, COLOR_GREEN_LEAF));
    LIBS.set_position(leafRight.POSITION_MATRIX, 0.0, 0.12, 0.0); // Relative terhadap stem
    LIBS.rotateY(leafRight.POSITION_MATRIX, Math.PI / 2 + 0.3);
    LIBS.rotateX(leafRight.POSITION_MATRIX, 0.3);
    stem.childs.push(leafRight);

    // --- Lengan & Capit (leftArm / rightArm: Child dari bodyBase) ---
    function createArm(isLeft) {
        const side = isLeft ? -1 : 1;
        const shoulder = createMeshObject(LIBS.createCylinder(16, 6, 0.30, 0.32, 0.7, COLOR_BLUE_PIPE));
        LIBS.translateX(shoulder.JOINT_MATRIX, side * 1.35);
        LIBS.translateY(shoulder.JOINT_MATRIX, 0.15);
        LIBS.rotateZ(shoulder.MOVE_MATRIX, side * -0.55);

        // ring (Child dari shoulder)
        const ring = createMeshObject(LIBS.createCylinder(16, 4, 0.35, 0.35, 0.18, COLOR_CYAN_TRIM));
        LIBS.translateY(ring.POSITION_MATRIX, 0.1);
        shoulder.childs.push(ring);

        // wrist (Child dari shoulder)
        const wrist = createMeshObject(LIBS.createSphere(16, 16, 0.28, COLOR_PINK_CAPIT));
        LIBS.translateY(wrist.POSITION_MATRIX, -0.42);
        shoulder.childs.push(wrist);

        // claw1 & claw2 (Child dari wrist)
        const claw1 = createMeshObject(LIBS.createBox(0.12, 0.38, 0.12, COLOR_PINK_CAPIT));
        LIBS.set_position(claw1.POSITION_MATRIX, side * 0.12, -0.20, 0.1); // Relative terhadap wrist
        LIBS.rotateZ(claw1.POSITION_MATRIX, side * 0.4);
        wrist.childs.push(claw1);

        const claw2 = createMeshObject(LIBS.createBox(0.12, 0.38, 0.12, COLOR_PINK_CAPIT));
        LIBS.set_position(claw2.POSITION_MATRIX, side * 0.12, -0.20, -0.1); // Relative terhadap wrist
        LIBS.rotateZ(claw2.POSITION_MATRIX, side * 0.4);
        wrist.childs.push(claw2);

        return shoulder;
    }

    const leftArm = createArm(true);
    const rightArm = createArm(false);
    bodyBase.childs.push(leftArm);
    bodyBase.childs.push(rightArm);

    // --- Roda (wheel: Child dari bodyBase, rim: Child dari wheel) ---
    function createWheel(xPos) {
        const wheel = createMeshObject(LIBS.createCylinder(20, 6, 0.32, 0.32, 0.65, COLOR_PURPLE_WHEEL));
        LIBS.rotateX(wheel.POSITION_MATRIX, Math.PI / 2);
        LIBS.set_position(wheel.POSITION_MATRIX, xPos, -0.85, 0.0);

        const rim = createMeshObject(LIBS.createCylinder(16, 4, 0.20, 0.20, 0.67, COLOR_BLUE_PIPE));
        wheel.childs.push(rim);

        return wheel;
    }

    const leftWheel = createWheel(-0.62);
    const rightWheel = createWheel(0.62);
    bodyBase.childs.push(leftWheel);
    bodyBase.childs.push(rightWheel);

    backgroundRoot.setup();
    bodyBase.setup();

    // ================= KONTROL TERPISAH KHUSUS SPROUT =================
    var zoomDistance = 8.5;
    var sproutRotationX = 0.0;
    var sproutRotationY = 0.0;
    var sproutPosX = 0.0;
    var sproutPosY = 0.0;

    var isLeftMouseDown = false;
    var isRightMouseDown = false;
    var prevMouseX = 0;
    var prevMouseY = 0;

    CANVAS.addEventListener("contextmenu", function (e) {
        e.preventDefault();
    });

    CANVAS.addEventListener("mousedown", function (e) {
        if (e.button === 0) {
            isLeftMouseDown = true;
        } else if (e.button === 2) {
            isRightMouseDown = true;
        }
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    });

    window.addEventListener("mouseup", function (e) {
        if (e.button === 0) isLeftMouseDown = false;
        if (e.button === 2) isRightMouseDown = false;
    });

    CANVAS.addEventListener("mousemove", function (e) {
        var deltaX = e.clientX - prevMouseX;
        var deltaY = e.clientY - prevMouseY;

        if (isLeftMouseDown) {
            sproutRotationY += deltaX * 0.008;
            sproutRotationX += deltaY * 0.008;
            sproutRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sproutRotationX));
        } else if (isRightMouseDown) {
            sproutPosX += deltaX * 0.008;
            sproutPosY -= deltaY * 0.008;
        }

        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    });

    window.addEventListener("keydown", function (e) {
        const speed = 0.12;
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
            sproutPosX -= speed;
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
            sproutPosX += speed;
        } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
            sproutPosY += speed;
        } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
            sproutPosY -= speed;
        }
    });

    CANVAS.addEventListener("wheel", function (e) {
        zoomDistance += e.deltaY * 0.005;
        zoomDistance = Math.max(4.5, Math.min(18.0, zoomDistance));
        e.preventDefault();
    });

    window.addEventListener("resize", function () {
        CANVAS.width = window.innerWidth;
        CANVAS.height = window.innerHeight;
    });

    // ================= ANIMASI & RENDER =================
    function animate(time) {
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);

        GL.clearColor(0.66, 0.86, 0.98, 1.0);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        const PROJMATRIX = LIBS.get_projection(42, CANVAS.width / CANVAS.height, 1, 100);

        const VIEWMATRIX = LIBS.get_I4();
        LIBS.translateY(VIEWMATRIX, -0.6);
        LIBS.translateZ(VIEWMATRIX, -zoomDistance);
        LIBS.rotateX(VIEWMATRIX, 0.08);

        LIBS.set_I4(bodyBase.MOVE_MATRIX);
        LIBS.translateX(bodyBase.MOVE_MATRIX, sproutPosX);
        LIBS.translateY(bodyBase.MOVE_MATRIX, sproutPosY);
        LIBS.rotateX(bodyBase.MOVE_MATRIX, sproutRotationX);
        LIBS.rotateY(bodyBase.MOVE_MATRIX, sproutRotationY);

        // Animasi Tangan Melambai
        const speed = 0.0025;
        const armWave = Math.sin(time * speed) * 0.18;

        LIBS.set_I4(leftArm.MOVE_MATRIX);
        LIBS.rotateZ(leftArm.MOVE_MATRIX, -0.45 + armWave);

        LIBS.set_I4(rightArm.MOVE_MATRIX);
        LIBS.rotateZ(rightArm.MOVE_MATRIX, 0.45 - armWave);

        GL.uniformMatrix4fv(_Pmatrix, false, PROJMATRIX);
        GL.uniformMatrix4fv(_Vmatrix, false, VIEWMATRIX);

        const identity = LIBS.get_I4();

        // 1. Render Background Dekorasi (Statis)
        backgroundRoot.render(identity);

        // 2. Render Sprout beserta seluruh anak cabang hierarkinya
        bodyBase.render(identity);

        GL.flush();
        window.requestAnimationFrame(animate);
    }

    animate(0);
}

window.addEventListener("load", main);